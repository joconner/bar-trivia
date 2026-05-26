import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import type { RoomStateDto } from '@bar-trivia/shared'
import { apiJoin, apiReroll, apiSubmitAnswer } from './api'
import { decodeToken, isTokenExpired } from './jwt'
import {
  getAccessToken,
  setAccessToken,
  refreshAccessToken,
  subscribe,
} from './token-store'
import { createSocket } from './socket'
import type { AppSocket } from './socket'

interface PlayerState {
  // 'loading' while silent refresh is in progress on mount
  view: 'loading' | 'join' | 'lobby' | 'question' | 'reveal' | 'final'
  accessToken: string | null
  participantId: string | null
  roomCode: string | null
  displayName: string | null
  roomState: RoomStateDto | null
  // questionId -> choiceId for answers already submitted this session
  submittedAnswers: Record<string, string>
  error: string | null
}

interface PlayerActions {
  join(roomCode: string): Promise<void>
  reroll(): Promise<void>
  submitAnswer(questionId: string, choiceId: string): Promise<void>
  clearError(): void
}

const PlayerCtx = createContext<(PlayerState & PlayerActions) | null>(null)

export function usePlayer() {
  const ctx = useContext(PlayerCtx)
  if (!ctx) throw new Error('usePlayer must be used inside PlayerProvider')
  return ctx
}

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PlayerState>({
    view: 'loading',
    accessToken: null,
    participantId: null,
    roomCode: null,
    displayName: null,
    roomState: null,
    submittedAnswers: {},
    error: null,
  })

  const socketRef = useRef<AppSocket | null>(null)

  const disconnectSocket = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect()
      socketRef.current = null
    }
  }, [])

  const resetToJoin = useCallback((error: string) => {
    disconnectSocket()
    setAccessToken(null)
    setState({
      view: 'join',
      accessToken: null,
      participantId: null,
      roomCode: null,
      displayName: null,
      roomState: null,
      submittedAnswers: {},
      error,
    })
  }, [disconnectSocket])

  const connectSocket = useCallback(() => {
    disconnectSocket()
    const sock = createSocket()

    sock.on('room:state', (roomState: RoomStateDto) => {
      setState((s) => ({
        ...s,
        roomState,
        view: roomState.phase,
      }))
    })

    sock.on('room:kicked', () => {
      resetToJoin('You were removed from the game.')
    })

    // A handshake rejection surfaces here. Only a token problem warrants a
    // refresh; other errors are transient and socket.io keeps retrying. If the
    // refresh token itself is dead, there is no recovering — send them back to
    // the join screen rather than looping forever.
    sock.on('connect_error', async () => {
      const token = getAccessToken()
      if (token && !isTokenExpired(token)) return
      const fresh = await refreshAccessToken()
      if (!fresh) resetToJoin('Your session expired. Please rejoin.')
    })

    socketRef.current = sock
  }, [disconnectSocket, resetToJoin])

  // Keep the (display-only) token in state in sync with the store.
  useEffect(() => subscribe((token) => {
    setState((s) => (s.accessToken === token ? s : { ...s, accessToken: token }))
  }), [])

  // On mount: silent refresh to check for an existing session
  useEffect(() => {
    let cancelled = false

    async function init() {
      const token = await refreshAccessToken()
      if (cancelled) return

      if (!token) {
        setState((s) => ({ ...s, view: 'join' }))
        return
      }

      const claims = decodeToken(token)
      const roomCode = claims?.['roomCode'] as string | undefined
      const participantId = claims?.['roomParticipantId'] as string | undefined
      const displayName = claims?.['displayName'] as string | undefined

      if (roomCode && participantId && !isTokenExpired(token)) {
        // Reconnect path: we have valid room claims, connect socket directly.
        setState((s) => ({
          ...s,
          roomCode,
          participantId,
          displayName: displayName ?? null,
          view: 'lobby', // will be overwritten by the first room:state event
        }))
        connectSocket()
      } else {
        setState((s) => ({ ...s, view: 'join' }))
      }
    }

    init()
    return () => { cancelled = true }
  }, [connectSocket])

  const join = useCallback(async (roomCode: string) => {
    setState((s) => ({ ...s, error: null }))
    try {
      const current = getAccessToken()
      const currentToken = current && !isTokenExpired(current) ? current : undefined
      const result = await apiJoin(roomCode.toUpperCase(), currentToken)
      setAccessToken(result.accessToken)
      setState((s) => ({
        ...s,
        participantId: result.participant.id,
        displayName: result.participant.displayName,
        roomCode: roomCode.toUpperCase(),
        view: 'lobby',
      }))
      connectSocket()
    } catch (err) {
      setState((s) => ({
        ...s,
        error: err instanceof Error ? err.message : 'Failed to join room',
      }))
    }
  }, [connectSocket])

  const reroll = useCallback(async () => {
    if (!getAccessToken() || !state.roomCode) return
    setState((s) => ({ ...s, error: null }))
    try {
      const result = await apiReroll(state.roomCode)
      setAccessToken(result.accessToken)
      setState((s) => ({ ...s, displayName: result.displayName }))
    } catch (err) {
      setState((s) => ({
        ...s,
        error: err instanceof Error ? err.message : 'Failed to reroll name',
      }))
    }
  }, [state.roomCode])

  const submitAnswer = useCallback(async (questionId: string, choiceId: string) => {
    if (!getAccessToken() || !state.roomCode) return
    // Optimistic lock: mark as submitted before the network call
    setState((s) => ({
      ...s,
      submittedAnswers: { ...s.submittedAnswers, [questionId]: choiceId },
    }))
    try {
      await apiSubmitAnswer(state.roomCode, questionId, choiceId)
    } catch (err) {
      setState((s) => ({
        ...s,
        error: err instanceof Error ? err.message : 'Failed to submit answer',
      }))
    }
  }, [state.roomCode])

  const clearError = useCallback(() => {
    setState((s) => ({ ...s, error: null }))
  }, [])

  // Cleanup on unmount
  useEffect(() => () => disconnectSocket(), [disconnectSocket])

  const value = {
    ...state,
    join,
    reroll,
    submitAnswer,
    clearError,
  }

  return <PlayerCtx.Provider value={value}>{children}</PlayerCtx.Provider>
}

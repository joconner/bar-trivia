import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import type { RoomStateDto } from '@bar-trivia/shared'
import {
  apiRefresh,
  apiJoin,
  apiReroll,
  apiSubmitAnswer,
  decodeToken,
  isTokenExpired,
} from './api'
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

  const connectSocket = useCallback((token: string) => {
    disconnectSocket()
    const sock = createSocket(token)

    sock.on('room:state', (roomState: RoomStateDto) => {
      setState((s) => ({
        ...s,
        roomState,
        view: roomState.phase,
      }))
    })

    sock.on('room:kicked', () => {
      disconnectSocket()
      setState({
        view: 'join',
        accessToken: null,
        participantId: null,
        roomCode: null,
        displayName: null,
        roomState: null,
        submittedAnswers: {},
        error: 'You were removed from the game.',
      })
    })

    socketRef.current = sock
  }, [disconnectSocket])

  // On mount: silent refresh to check for an existing session
  useEffect(() => {
    let cancelled = false

    async function init() {
      const token = await apiRefresh()
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
          accessToken: token,
          roomCode,
          participantId,
          displayName: displayName ?? null,
          view: 'lobby', // will be overwritten by the first room:state event
        }))
        connectSocket(token)
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
      const currentToken =
        state.accessToken && !isTokenExpired(state.accessToken)
          ? state.accessToken
          : undefined
      const result = await apiJoin(roomCode.toUpperCase(), currentToken)
      setState((s) => ({
        ...s,
        accessToken: result.accessToken,
        participantId: result.participant.id,
        displayName: result.participant.displayName,
        roomCode: roomCode.toUpperCase(),
        view: 'lobby',
      }))
      connectSocket(result.accessToken)
    } catch (err) {
      setState((s) => ({
        ...s,
        error: err instanceof Error ? err.message : 'Failed to join room',
      }))
    }
  }, [state.accessToken, connectSocket])

  const reroll = useCallback(async () => {
    if (!state.accessToken || !state.roomCode) return
    setState((s) => ({ ...s, error: null }))
    try {
      const result = await apiReroll(state.roomCode, state.accessToken)
      setState((s) => ({
        ...s,
        accessToken: result.accessToken,
        displayName: result.displayName,
      }))
      // Reconnect socket with new token so future socket reconnects use it
      connectSocket(result.accessToken)
    } catch (err) {
      setState((s) => ({
        ...s,
        error: err instanceof Error ? err.message : 'Failed to reroll name',
      }))
    }
  }, [state.accessToken, state.roomCode, connectSocket])

  const submitAnswer = useCallback(async (questionId: string, choiceId: string) => {
    if (!state.accessToken || !state.roomCode) return
    // Optimistic lock: mark as submitted before the network call
    setState((s) => ({
      ...s,
      submittedAnswers: { ...s.submittedAnswers, [questionId]: choiceId },
    }))
    try {
      await apiSubmitAnswer(state.roomCode, state.accessToken, questionId, choiceId)
    } catch (err) {
      setState((s) => ({
        ...s,
        error: err instanceof Error ? err.message : 'Failed to submit answer',
      }))
    }
  }, [state.accessToken, state.roomCode])

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

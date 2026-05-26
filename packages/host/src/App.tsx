import { useState, useEffect, useCallback } from 'react'
import type { RoomStateDto } from '@bar-trivia/shared'
import { setToken, getToken, refreshAccessToken } from './api'
import { isTokenExpired } from './jwt'
import { connectRoom, disconnectRoom } from './socket'
import Login from './views/Login'
import PackLibrary from './views/PackLibrary'
import PackDetail from './views/PackDetail'
import QuestionForm from './views/QuestionForm'
import RoomLobby from './views/RoomLobby'
import InGame from './views/InGame'
import Final from './views/Final'

export type Screen =
  | { id: 'login' }
  | { id: 'packs' }
  | { id: 'pack-detail'; packId: string }
  | { id: 'question-form'; packId: string; gameId: string; questionId?: string }
  | { id: 'lobby'; roomCode: string; packId: string }
  | { id: 'in-game'; roomCode: string; packId: string }
  | { id: 'final'; roomCode: string; packId: string }

const ROOM_SCREENS = new Set<Screen['id']>(['lobby', 'in-game', 'final'])

export default function App() {
  const [screen, setScreen] = useState<Screen>({ id: 'login' })
  const [roomState, setRoomState] = useState<RoomStateDto | null>(null)

  // Try to refresh token on mount
  useEffect(() => {
    refreshAccessToken().then((token) => {
      if (token) setScreen({ id: 'packs' })
      // else: no valid session; stay on login
    })
  }, [])

  const handleLogout = useCallback(() => {
    setToken(null)
    disconnectRoom()
    setRoomState(null)
    setScreen({ id: 'login' })
  }, [])

  const navigate = useCallback((next: Screen) => {
    const wasInRoom = ROOM_SCREENS.has(screen.id)
    const willBeInRoom = ROOM_SCREENS.has(next.id)

    if (wasInRoom && !willBeInRoom) {
      disconnectRoom()
      setRoomState(null)
    }

    if (willBeInRoom && 'roomCode' in next) {
      const token = getToken()
      if (token) {
        const sock = connectRoom(next.roomCode)
        sock.on('room:state', (state) => {
          setRoomState(state)
          // Auto-advance screen based on phase
          setScreen((prev) => {
            if (!('roomCode' in prev)) return prev
            if (state.phase === 'final' && prev.id !== 'final') {
              return { id: 'final', roomCode: prev.roomCode, packId: (prev as { packId: string }).packId }
            }
            if ((state.phase === 'question' || state.phase === 'reveal') && prev.id === 'lobby') {
              return { id: 'in-game', roomCode: prev.roomCode, packId: (prev as { packId: string }).packId }
            }
            return prev
          })
        })
        // A handshake rejection lands here. Refresh only for a token problem;
        // if the refresh token is dead, log out instead of looping forever.
        sock.on('connect_error', async () => {
          const current = getToken()
          if (current && !isTokenExpired(current)) return
          const fresh = await refreshAccessToken()
          if (!fresh) handleLogout()
        })
      }
    }

    setScreen(next)
  }, [screen.id, handleLogout])

  const handleLogin = useCallback((token: string) => {
    setToken(token)
    navigate({ id: 'packs' })
  }, [navigate])

  switch (screen.id) {
    case 'login':
      return <Login onLogin={handleLogin} />

    case 'packs':
      return (
        <PackLibrary
          onOpenPack={(packId) => navigate({ id: 'pack-detail', packId })}
          onLogout={handleLogout}
        />
      )

    case 'pack-detail':
      return (
        <PackDetail
          packId={screen.packId}
          onBack={() => navigate({ id: 'packs' })}
          onAddQuestion={(gameId, questionId?) =>
            navigate({ id: 'question-form', packId: screen.packId, gameId, questionId })
          }
          onStartRoom={(roomCode) =>
            navigate({ id: 'lobby', roomCode, packId: screen.packId })
          }
        />
      )

    case 'question-form':
      return (
        <QuestionForm
          packId={screen.packId}
          gameId={screen.gameId}
          questionId={screen.questionId}
          onBack={() => navigate({ id: 'pack-detail', packId: screen.packId })}
          onSaved={() => navigate({ id: 'pack-detail', packId: screen.packId })}
        />
      )

    case 'lobby':
      return (
        <RoomLobby
          roomCode={screen.roomCode}
          packId={screen.packId}
          roomState={roomState}
          onBack={() => navigate({ id: 'pack-detail', packId: screen.packId })}
        />
      )

    case 'in-game':
      return (
        <InGame
          roomCode={screen.roomCode}
          roomState={roomState}
          onDone={() => navigate({ id: 'final', roomCode: screen.roomCode, packId: screen.packId })}
        />
      )

    case 'final':
      return (
        <Final
          roomCode={screen.roomCode}
          packId={screen.packId}
          roomState={roomState}
          onBackToPacks={() => navigate({ id: 'packs' })}
          onNextGame={(gameId) => navigate({ id: 'lobby', roomCode: screen.roomCode, packId: screen.packId })}
        />
      )
  }
}

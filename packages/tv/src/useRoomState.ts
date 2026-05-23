import { useState, useEffect } from 'react'
import { io } from 'socket.io-client'
import type { RoomStateDto } from '@bar-trivia/shared'

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3000'

export function useRoomState(roomCode: string) {
  const [state, setState] = useState<RoomStateDto | null>(null)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    const socket = io(SERVER_URL, {
      query: { roomCode },
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 2000,
    })

    socket.on('connect', () => setConnected(true))
    socket.on('disconnect', () => setConnected(false))
    socket.on('room:state', (s) => setState(s))

    return () => {
      socket.disconnect()
    }
  }, [roomCode])

  return { state, connected }
}

import { useState, useEffect } from 'react'
import { io } from 'socket.io-client'
import type { RoomStateDto } from '@bar-trivia/shared'

// Empty string = same-origin (nginx / Railway all-in-one).
// Set VITE_API_URL at build time when frontends are on a separate origin
// (e.g. Cloudflare Pages pointing at a Railway backend).
const API_URL = import.meta.env.VITE_API_URL ?? import.meta.env.VITE_SERVER_URL ?? ''

export function useRoomState(roomCode: string) {
  const [state, setState] = useState<RoomStateDto | null>(null)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    const socket = io(API_URL, {
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

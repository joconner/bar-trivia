import { io, Socket } from 'socket.io-client'
import type { ServerToClientEvents, ClientToServerEvents } from '@bar-trivia/shared'
import { getToken } from './api'

type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>

const BASE = (import.meta as { env: Record<string, string> }).env.VITE_API_URL ?? 'http://localhost:3000'

let socket: AppSocket | null = null

// `auth` is a function so each (re)connection attempt reads the current token —
// a token refreshed mid-game is picked up on the next reconnect automatically.
export function connectRoom(roomCode: string): AppSocket {
  if (socket) {
    socket.disconnect()
  }
  socket = io(BASE, {
    auth: (cb: (data: { token: string }) => void) => cb({ token: getToken() ?? '' }),
    query: { roomCode },
    transports: ['websocket', 'polling'],
  })
  return socket
}

export function disconnectRoom() {
  if (socket) {
    socket.disconnect()
    socket = null
  }
}

export function getSocket(): AppSocket | null {
  return socket
}

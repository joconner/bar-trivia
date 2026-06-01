import { io, Socket } from 'socket.io-client'
import type { ServerToClientEvents, ClientToServerEvents } from '@bar-trivia/shared'
import { getToken } from './api'

type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>

// Empty string = same-origin (nginx / Railway all-in-one).
// Set VITE_API_URL at build time when frontends are on a separate origin.
const API_URL = import.meta.env.VITE_API_URL ?? ''

let socket: AppSocket | null = null

// `auth` is a function so each (re)connection attempt reads the current token:
// a token refreshed mid-game is picked up on the next reconnect automatically.
export function connectRoom(roomCode: string): AppSocket {
  if (socket) {
    socket.disconnect()
  }
  socket = io(API_URL, {
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

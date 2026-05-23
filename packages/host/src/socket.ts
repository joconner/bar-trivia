import { io, Socket } from 'socket.io-client'
import type { ServerToClientEvents, ClientToServerEvents } from '@bar-trivia/shared'

type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>

const BASE = (import.meta as { env: Record<string, string> }).env.VITE_API_URL ?? 'http://localhost:3000'

let socket: AppSocket | null = null

export function connectRoom(token: string, roomCode: string): AppSocket {
  if (socket) {
    socket.disconnect()
  }
  socket = io(BASE, {
    auth: { token },
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

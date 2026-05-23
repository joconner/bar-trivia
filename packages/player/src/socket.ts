import { io } from 'socket.io-client'
import type { Socket } from 'socket.io-client'
import type { ServerToClientEvents, ClientToServerEvents } from '@bar-trivia/shared'

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>

// Connect to the same origin; Vite dev proxy routes /socket.io → server.
export function createSocket(token: string): AppSocket {
  return io('', {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: Infinity,
  })
}

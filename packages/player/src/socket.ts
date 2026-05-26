import { io } from 'socket.io-client'
import type { Socket } from 'socket.io-client'
import type { ServerToClientEvents, ClientToServerEvents } from '@bar-trivia/shared'
import { getAccessToken } from './token-store'

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>

// Connect to the same origin; Vite dev proxy routes /socket.io → server.
// `auth` is a function so every (re)connection attempt reads the current token
// from the store — a token refreshed mid-session is picked up on the next
// reconnect without tearing down and recreating the socket.
export function createSocket(): AppSocket {
  return io('', {
    auth: (cb: (data: { token: string }) => void) => cb({ token: getAccessToken() ?? '' }),
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: Infinity,
  })
}

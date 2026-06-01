import { io } from 'socket.io-client'
import type { Socket } from 'socket.io-client'
import type { ServerToClientEvents, ClientToServerEvents } from '@bar-trivia/shared'
import { getAccessToken } from './token-store'

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>

// Empty string = same-origin (nginx / Railway all-in-one).
// Set VITE_API_URL at build time when frontends are on a separate origin.
const API_URL = import.meta.env.VITE_API_URL ?? ''

// `auth` is a function so every (re)connection attempt reads the current token
// from the store — a token refreshed mid-session is picked up on the next
// reconnect without tearing down and recreating the socket.
export function createSocket(): AppSocket {
  return io(API_URL, {
    auth: (cb: (data: { token: string }) => void) => cb({ token: getAccessToken() ?? '' }),
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: Infinity,
  })
}

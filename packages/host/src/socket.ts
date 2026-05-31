import { io, Socket } from 'socket.io-client'
import type { ServerToClientEvents, ClientToServerEvents } from '@bar-trivia/shared'
import { getToken } from './api'

type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>

let socket: AppSocket | null = null

// Same-origin connect — nginx proxies /socket.io to the server. `auth` is a
// function so each (re)connection attempt reads the current token: a token
// refreshed mid-game is picked up on the next reconnect automatically.
export function connectRoom(roomCode: string): AppSocket {
  if (socket) {
    socket.disconnect()
  }
  socket = io('', {
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

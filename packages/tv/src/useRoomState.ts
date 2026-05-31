import { useState, useEffect } from 'react'
import { io } from 'socket.io-client'
import type { RoomStateDto } from '@bar-trivia/shared'

// Same-origin: nginx proxies /socket.io to the server. A hardcoded
// localhost:3000 would break the moment the TV is opened on the bar's LAN IP.
export function useRoomState(roomCode: string) {
  const [state, setState] = useState<RoomStateDto | null>(null)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    const socket = io('', {
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

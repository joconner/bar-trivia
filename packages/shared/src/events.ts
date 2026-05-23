import type { RoomStateDto } from './schemas/rooms'

// Server → all clients in room
export interface ServerToClientEvents {
  'room:state': (state: RoomStateDto) => void
  'room:player-joined': (payload: { participantId: string; displayName: string }) => void
  'room:player-left': (payload: { participantId: string }) => void
  'room:kicked': (payload: { participantId: string; reason: string }) => void
}

// Client → server: empty — all game actions go via REST, sockets are subscribe-only.
export interface ClientToServerEvents {}

// Per-socket data attached by the gateway on connection
export interface SocketData {
  userId: string
  role: 'guest' | 'player' | 'host' | 'admin' | 'tv'
  displayName: string
  roomCode: string | null
  roomParticipantId: string | null
}

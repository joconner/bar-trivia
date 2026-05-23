import { Logger } from '@nestjs/common'
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets'
import { Server, Socket } from 'socket.io'
import type { ServerToClientEvents, ClientToServerEvents, SocketData, RoomStateDto } from '@bar-trivia/shared'
import { AuthService } from '../auth/auth.service'
import { RoomStateStore } from './room-state.store'
import { RoomsService } from './rooms.service'

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>
type AppServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>

@WebSocketGateway({
  cors: {
    origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => {
      const allowed = (process.env.CLIENT_ORIGINS ?? '').split(',').filter(Boolean)
      if (!allowed.length || allowed.includes(origin ?? '')) {
        cb(null, true)
      } else {
        cb(new Error('Not allowed by CORS'))
      }
    },
    credentials: true,
  },
})
export class RoomsGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: AppServer
  private readonly logger = new Logger(RoomsGateway.name)

  constructor(
    private readonly roomsService: RoomsService,
    private readonly store: RoomStateStore,
    private readonly auth: AuthService,
  ) {}

  afterInit(_server: AppServer) {
    this.roomsService.setGateway(this)
    this.logger.log('WebSocket gateway initialized')
  }

  handleConnection(socket: AppSocket) {
    const token: string | undefined = socket.handshake.auth?.token
    const queryRoomCode = socket.handshake.query?.roomCode as string | undefined

    if (token) {
      let payload: ReturnType<typeof this.auth.verifyAccessToken>
      try {
        payload = this.auth.verifyAccessToken(token)
      } catch {
        this.logger.warn(`Socket ${socket.id} rejected: invalid token`)
        socket.disconnect(true)
        return
      }

      let roomCode: string | null = null
      let roomParticipantId: string | null = null

      if (payload.role === 'guest' && payload.roomCode && payload.roomParticipantId) {
        roomCode = payload.roomCode
        roomParticipantId = payload.roomParticipantId
      } else if (payload.role === 'host') {
        roomCode = queryRoomCode ?? null
      }

      if (!roomCode) {
        this.logger.warn(`Socket ${socket.id} rejected: no roomCode resolved`)
        socket.disconnect(true)
        return
      }

      socket.data = {
        userId: payload.sub,
        role: payload.role as SocketData['role'],
        displayName: payload.displayName,
        roomCode,
        roomParticipantId: roomParticipantId ?? null,
      }

      if (roomParticipantId) {
        const state = this.store.get(roomCode)
        const participant = state?.participants.get(roomParticipantId)
        if (participant) {
          participant.socketId = socket.id
          participant.isConnected = true
        }
      }

      socket.join(roomCode)
      this.emitCurrentState(socket, roomCode)
      this.logger.log(`Socket ${socket.id} connected as ${payload.role} in room ${roomCode}`)
      return
    }

    // TV observer: no JWT, roomCode in query
    if (queryRoomCode) {
      socket.data = {
        userId: 'tv',
        role: 'tv',
        displayName: 'TV',
        roomCode: queryRoomCode,
        roomParticipantId: null,
      }
      socket.join(queryRoomCode)
      this.emitCurrentState(socket, queryRoomCode)
      this.logger.log(`Socket ${socket.id} connected as TV observer in room ${queryRoomCode}`)
      return
    }

    this.logger.warn(`Socket ${socket.id} rejected: no token and no roomCode`)
    socket.disconnect(true)
  }

  handleDisconnect(socket: AppSocket) {
    const { roomCode, roomParticipantId } = socket.data ?? {}
    if (!roomCode || !roomParticipantId) return

    const state = this.store.get(roomCode)
    if (!state) return

    const participant = state.participants.get(roomParticipantId)
    if (participant) {
      participant.isConnected = false
      participant.socketId = null
    }

    this.logger.log(`Socket ${socket.id} disconnected from room ${roomCode}`)
  }

  broadcastRoomState(roomCode: string, state: RoomStateDto): void {
    this.server.to(roomCode).emit('room:state', state)
  }

  private emitCurrentState(socket: AppSocket, roomCode: string): void {
    try {
      const dto = this.roomsService.getRoomStateDto(roomCode)
      socket.emit('room:state', dto)
    } catch {
      // Room not found or not yet created — socket stays connected
    }
  }
}

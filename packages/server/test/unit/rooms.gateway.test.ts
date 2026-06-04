import { describe, it, expect, beforeEach, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { RoomsGateway } from '../../src/rooms/rooms.gateway'
import { RoomStateStore } from '../../src/rooms/room-state.store'
import { RoomState } from '../../src/rooms/room-state'
import type { AuthService } from '../../src/auth/auth.service'
import type { RoomsService } from '../../src/rooms/rooms.service'
import type { AccessTokenPayload } from '@bar-trivia/shared'
import { makeGameConfig, makeQuestion } from './test-utils'

// Minimal socket double that captures calls for assertions.
function makeSocket(overrides: {
  authToken?: string
  queryRoomCode?: string
  id?: string
} = {}) {
  const socket = {
    id: overrides.id ?? 'socket-1',
    handshake: {
      auth: overrides.authToken !== undefined ? { token: overrides.authToken } : {},
      query: overrides.queryRoomCode !== undefined ? { roomCode: overrides.queryRoomCode } : {},
    },
    data: {} as Record<string, unknown>,
    join: vi.fn(),
    disconnect: vi.fn(),
    emit: vi.fn(),
  }
  return socket
}

type MockSocket = ReturnType<typeof makeSocket>

let store: RoomStateStore
let auth: { verifyAccessToken: ReturnType<typeof vi.fn> }
let roomsService: { setGateway: ReturnType<typeof vi.fn>; getRoomStateDto: ReturnType<typeof vi.fn> }
let gateway: RoomsGateway

beforeEach(() => {
  store = new RoomStateStore()
  auth = { verifyAccessToken: vi.fn() }
  roomsService = {
    setGateway: vi.fn(),
    getRoomStateDto: vi.fn().mockImplementation(() => { throw new Error('no room') }),
  }
  gateway = new RoomsGateway(
    roomsService as unknown as RoomsService,
    store,
    auth as unknown as AuthService,
  )
})

describe('handleConnection: TV observer', () => {
  it('joins the room and sets TV socket data when no token but roomCode is present', () => {
    const socket = makeSocket({ queryRoomCode: 'ABCD' })
    gateway.handleConnection(socket as never)

    expect(socket.disconnect).not.toHaveBeenCalled()
    expect(socket.join).toHaveBeenCalledWith('ABCD')
    expect(socket.data.role).toBe('tv')
    expect(socket.data.roomCode).toBe('ABCD')
    expect(socket.data.roomParticipantId).toBeNull()
  })
})

describe('handleConnection: invalid token', () => {
  it('disconnects when the token fails verification', () => {
    auth.verifyAccessToken.mockImplementation(() => { throw new Error('jwt expired') })
    const socket = makeSocket({ authToken: 'bad-token' })

    gateway.handleConnection(socket as never)

    expect(socket.disconnect).toHaveBeenCalledWith(true)
    expect(socket.join).not.toHaveBeenCalled()
  })
})

describe('handleConnection: no token, no roomCode', () => {
  it('disconnects a socket that provides neither a token nor a roomCode', () => {
    const socket = makeSocket()
    gateway.handleConnection(socket as never)

    expect(socket.disconnect).toHaveBeenCalledWith(true)
    expect(socket.join).not.toHaveBeenCalled()
  })
})

describe('handleConnection: guest token', () => {
  it('joins the room and marks the participant connected', () => {
    const roomCode = 'WXYZ'
    const participantId = randomUUID()
    const hostId = randomUUID()
    const state = new RoomState({
      roomId: randomUUID(),
      roomCode,
      hostId,
      packId: randomUUID(),
      packTitle: 'Test Pack',
      config: makeGameConfig([makeQuestion()]),
    })
    state.participants.set(participantId, {
      userId: randomUUID(),
      displayName: 'BraveOtter',
      score: 0,
      totalResponseTimeMs: 0,
      socketId: null,
      isConnected: false,
    })
    store.set(roomCode, state)

    const guestPayload: AccessTokenPayload = {
      sub: randomUUID(),
      role: 'guest',
      displayName: 'BraveOtter',
      roomCode,
      roomParticipantId: participantId,
    }
    auth.verifyAccessToken.mockReturnValue(guestPayload)

    const socket = makeSocket({ authToken: 'valid-guest-token', id: 'sock-g' })
    gateway.handleConnection(socket as never)

    expect(socket.disconnect).not.toHaveBeenCalled()
    expect(socket.join).toHaveBeenCalledWith(roomCode)
    expect(socket.data.role).toBe('guest')
    expect(socket.data.roomCode).toBe(roomCode)
    expect(socket.data.roomParticipantId).toBe(participantId)

    const participant = state.participants.get(participantId)!
    expect(participant.isConnected).toBe(true)
    expect(participant.socketId).toBe('sock-g')
  })

  it('disconnects a guest whose token carries no roomCode', () => {
    const guestPayload: AccessTokenPayload = {
      sub: randomUUID(),
      role: 'guest',
      displayName: 'LostOtter',
      roomCode: null as unknown as string,
      roomParticipantId: null as unknown as string,
    }
    auth.verifyAccessToken.mockReturnValue(guestPayload)

    const socket = makeSocket({ authToken: 'guest-no-room' })
    gateway.handleConnection(socket as never)

    expect(socket.disconnect).toHaveBeenCalledWith(true)
  })
})

describe('handleConnection: host token', () => {
  it('joins the room from the query param when the host token provides no embedded roomCode', () => {
    const hostPayload: AccessTokenPayload = {
      sub: randomUUID(),
      role: 'host',
      displayName: 'Alice',
    } as AccessTokenPayload
    auth.verifyAccessToken.mockReturnValue(hostPayload)

    const socket = makeSocket({ authToken: 'host-token', queryRoomCode: 'ZZZZ' })
    gateway.handleConnection(socket as never)

    expect(socket.disconnect).not.toHaveBeenCalled()
    expect(socket.join).toHaveBeenCalledWith('ZZZZ')
    expect(socket.data.role).toBe('host')
    expect(socket.data.roomCode).toBe('ZZZZ')
  })

  it('disconnects a host that has no roomCode in query and no embedded roomCode', () => {
    const hostPayload: AccessTokenPayload = {
      sub: randomUUID(),
      role: 'host',
      displayName: 'Alice',
    } as AccessTokenPayload
    auth.verifyAccessToken.mockReturnValue(hostPayload)

    const socket = makeSocket({ authToken: 'host-token' })
    gateway.handleConnection(socket as never)

    expect(socket.disconnect).toHaveBeenCalledWith(true)
  })
})

describe('handleDisconnect', () => {
  it('marks the participant disconnected and clears the socketId', () => {
    const roomCode = 'ABCD'
    const participantId = randomUUID()
    const state = new RoomState({
      roomId: randomUUID(),
      roomCode,
      hostId: randomUUID(),
      packId: randomUUID(),
      packTitle: 'Pack',
      config: makeGameConfig([makeQuestion()]),
    })
    state.participants.set(participantId, {
      userId: randomUUID(),
      displayName: 'BraveOtter',
      score: 0,
      totalResponseTimeMs: 0,
      socketId: 'sock-1',
      isConnected: true,
    })
    store.set(roomCode, state)

    const socket = makeSocket({ id: 'sock-1' })
    socket.data = { roomCode, roomParticipantId: participantId }
    gateway.handleDisconnect(socket as never)

    const participant = state.participants.get(participantId)!
    expect(participant.isConnected).toBe(false)
    expect(participant.socketId).toBeNull()
  })

  it('is a no-op when the socket has no roomCode', () => {
    const socket = makeSocket()
    socket.data = {}
    // Should not throw
    expect(() => gateway.handleDisconnect(socket as never)).not.toThrow()
  })

  it('is a no-op when the room has already been removed from the store', () => {
    const socket = makeSocket()
    socket.data = { roomCode: 'GONE', roomParticipantId: randomUUID() }
    expect(() => gateway.handleDisconnect(socket as never)).not.toThrow()
  })
})

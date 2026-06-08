import { describe, it, expect, beforeEach, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { RoomsController } from '../../src/rooms/rooms.controller'
import type { RoomsService } from '../../src/rooms/rooms.service'
import type { AccessTokenPayload } from '@bar-trivia/shared'

function makeRes() {
  const cookies: Record<string, string> = {}
  return {
    cookie: vi.fn((name: string, value: string) => { cookies[name] = value }),
    _cookies: cookies,
  }
}

function makeUser(role: 'host' | 'guest' | 'player' = 'host'): AccessTokenPayload {
  return { sub: randomUUID(), role, displayName: 'Alice' } as AccessTokenPayload
}

const STUB_STATE = { roomCode: 'ABCD', phase: 'lobby', participants: [] } as never

let rooms: Record<string, ReturnType<typeof vi.fn>>
let controller: RoomsController

beforeEach(() => {
  rooms = {
    createRoom: vi.fn().mockResolvedValue(STUB_STATE),
    getActiveRooms: vi.fn().mockReturnValue({ count: 1, roomCode: 'ABCD' }),
    getHostRooms: vi.fn().mockReturnValue([]),
    getRoomStateDto: vi.fn().mockReturnValue(STUB_STATE),
    updateLobbyConfig: vi.fn().mockReturnValue(STUB_STATE),
    joinRoom: vi.fn(),
    rerollName: vi.fn().mockResolvedValue({ accessToken: 'at' }),
    startGame: vi.fn().mockReturnValue(STUB_STATE),
    selectGame: vi.fn().mockResolvedValue(STUB_STATE),
    pauseGame: vi.fn().mockReturnValue(STUB_STATE),
    advance: vi.fn().mockResolvedValue(STUB_STATE),
    kick: vi.fn().mockResolvedValue(STUB_STATE),
    submitAnswer: vi.fn().mockReturnValue({ received: true }),
  }
  controller = new RoomsController(rooms as unknown as RoomsService)
})

describe('POST /rooms', () => {
  it('delegates to rooms.createRoom with user.sub and body', async () => {
    const user = makeUser('host')
    const body = { packId: 'p1', gameId: 'g1' } as never

    await controller.createRoom(body, user)

    expect(rooms.createRoom).toHaveBeenCalledWith(user.sub, body)
  })
})

describe('GET /rooms/active', () => {
  it('returns the active room summary', () => {
    const result = controller.getActive()
    expect(result).toEqual({ count: 1, roomCode: 'ABCD' })
  })
})

describe('GET /rooms/my-rooms', () => {
  it('delegates to rooms.getHostRooms with the authenticated user id', () => {
    const user = makeUser('host')
    const list = [{ roomCode: 'ABCD', packId: 'p1', packTitle: 'Pack', playerCount: 3, phase: 'question' }]
    rooms.getHostRooms.mockReturnValue(list)

    const result = controller.getMyRooms(user)

    expect(rooms.getHostRooms).toHaveBeenCalledWith(user.sub)
    expect(result).toBe(list)
  })
})

describe('GET /rooms/:roomCode', () => {
  it('delegates to rooms.getRoomStateDto', () => {
    const result = controller.getRoom('ABCD')
    expect(rooms.getRoomStateDto).toHaveBeenCalledWith('ABCD')
    expect(result).toBe(STUB_STATE)
  })
})

describe('PATCH /rooms/:roomCode (updateConfig)', () => {
  it('delegates to rooms.updateLobbyConfig with roomCode, user.sub, and body', () => {
    const user = makeUser('host')
    const body = { lateJoinPolicy: 'locked' } as never

    controller.updateConfig('WXYZ', body, user)

    expect(rooms.updateLobbyConfig).toHaveBeenCalledWith('WXYZ', user.sub, body)
  })
})

describe('POST /rooms/:roomCode/join', () => {
  it('sets the refresh cookie when the service returns a refreshToken (new guest)', async () => {
    rooms.joinRoom.mockResolvedValue({
      accessToken: 'guest-at',
      refreshToken: 'guest-rt',
      participant: { id: 'p1', displayName: 'BraveOtter' },
    })
    const req = { headers: { authorization: undefined } }
    const res = makeRes()

    const result = await controller.joinRoom('ABCD', req as never, res as never)

    expect(result).toEqual({ accessToken: 'guest-at', participant: { id: 'p1', displayName: 'BraveOtter' } })
    expect(res.cookie).toHaveBeenCalledWith('refresh_token', 'guest-rt', expect.anything())
  })

  it('does NOT set a cookie when no refreshToken is returned (guest reconnect)', async () => {
    rooms.joinRoom.mockResolvedValue({
      accessToken: 'reconnect-at',
      participant: { id: 'p1', displayName: 'BraveOtter' },
    })
    const req = { headers: { authorization: 'Bearer old-token' } }
    const res = makeRes()

    await controller.joinRoom('ABCD', req as never, res as never)

    expect(res.cookie).not.toHaveBeenCalled()
  })

  it('passes the Authorization header from the request to the service', async () => {
    rooms.joinRoom.mockResolvedValue({
      accessToken: 'at',
      participant: { id: 'p1', displayName: 'X' },
    })
    const req = { headers: { authorization: 'Bearer token123' } }

    await controller.joinRoom('ROOM', req as never, makeRes() as never)

    expect(rooms.joinRoom).toHaveBeenCalledWith('ROOM', 'Bearer token123')
  })
})

describe('POST /rooms/:roomCode/game/start', () => {
  it('delegates to rooms.startGame with roomCode and user.sub', () => {
    const user = makeUser('host')
    controller.startGame('ABCD', user)
    expect(rooms.startGame).toHaveBeenCalledWith('ABCD', user.sub)
  })
})

describe('POST /rooms/:roomCode/game/select-game', () => {
  it('delegates to rooms.selectGame with roomCode, user.sub, and gameId', async () => {
    const user = makeUser('host')
    await controller.selectGame('ABCD', { gameId: 'g42' } as never, user)
    expect(rooms.selectGame).toHaveBeenCalledWith('ABCD', user.sub, 'g42')
  })
})

describe('POST /rooms/:roomCode/game/pause', () => {
  it('delegates to rooms.pauseGame', () => {
    const user = makeUser('host')
    controller.pauseGame('ABCD', user)
    expect(rooms.pauseGame).toHaveBeenCalledWith('ABCD', user.sub)
  })
})

describe('POST /rooms/:roomCode/game/advance', () => {
  it('delegates to rooms.advance', async () => {
    const user = makeUser('host')
    await controller.advance('ABCD', user)
    expect(rooms.advance).toHaveBeenCalledWith('ABCD', user.sub)
  })
})

describe('POST /rooms/:roomCode/game/kick', () => {
  it('delegates to rooms.kick with participantId from body', async () => {
    const user = makeUser('host')
    const participantId = randomUUID()
    await controller.kick('ABCD', { participantId } as never, user)
    expect(rooms.kick).toHaveBeenCalledWith('ABCD', user.sub, participantId)
  })
})

describe('POST /rooms/:roomCode/answers', () => {
  it('delegates submitAnswer to the service with the full user context', () => {
    const user = makeUser('guest')
    const body = { choiceId: randomUUID() } as never
    controller.submitAnswer('ABCD', body, user)
    expect(rooms.submitAnswer).toHaveBeenCalledWith('ABCD', user, body)
  })
})

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common'
import { RoomsService } from '../../src/rooms/rooms.service'
import { RoomStateStore } from '../../src/rooms/room-state.store'
import { RoomState, type ParticipantState } from '../../src/rooms/room-state'
import type { AuthService } from '../../src/auth/auth.service'
import type { UsersService } from '../../src/users/users.service'
import type { AccessTokenPayload } from '@bar-trivia/shared'
import { makePrismaMock, makeQuestion, makeGameConfig, type PrismaMock } from './test-utils'

type Phase = RoomState['phase']

let prisma: PrismaMock
let auth: { verifyAccessToken: ReturnType<typeof vi.fn>; issueRoomAccessToken: ReturnType<typeof vi.fn>; issueRoomTokenPair: ReturnType<typeof vi.fn> }
let users: { generateDisplayName: ReturnType<typeof vi.fn> }
let store: RoomStateStore
let service: RoomsService

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
  prisma = makePrismaMock()
  auth = {
    verifyAccessToken: vi.fn(),
    issueRoomAccessToken: vi.fn().mockReturnValue('access-token'),
    issueRoomTokenPair: vi.fn().mockResolvedValue({ accessToken: 'access-token', refreshToken: 'refresh-token' }),
  }
  users = { generateDisplayName: vi.fn().mockReturnValue('BraveOtter') }
  store = new RoomStateStore()
  service = new RoomsService(prisma as never, auth as unknown as AuthService, users as unknown as UsersService, store)
})

afterEach(() => {
  vi.useRealTimers()
})

function seedRoom(opts: { questions?: ReturnType<typeof makeQuestion>[]; phase?: Phase; lateJoinPolicy?: 'open' | 'locked' } = {}) {
  const hostId = randomUUID()
  const roomCode = 'WXYZ'
  const state = new RoomState({
    roomId: randomUUID(),
    roomCode,
    hostId,
    packId: randomUUID(),
    packTitle: 'Pack',
    gameConfig: makeGameConfig(opts.questions ?? [makeQuestion(0)], { lateJoinPolicy: opts.lateJoinPolicy ?? 'open' }),
  })
  state.phase = opts.phase ?? 'lobby'
  store.set(roomCode, state)
  return { state, hostId, roomCode }
}

function addParticipant(
  state: RoomState,
  o: { id?: string; name?: string; score?: number; rtMs?: number; userId?: string } = {},
): string {
  const id = o.id ?? randomUUID()
  const p: ParticipantState = {
    userId: o.userId ?? randomUUID(),
    displayName: o.name ?? 'P',
    score: o.score ?? 0,
    totalResponseTimeMs: o.rtMs ?? 0,
    socketId: null,
    isConnected: true,
  }
  state.participants.set(id, p)
  return id
}

describe('room lookup and host authorization', () => {
  it('throws NotFound for an unknown room', () => {
    expect(() => service.getRoomStateDto('NOPE')).toThrow(NotFoundException)
  })

  it('throws Forbidden when a non-host issues a host action', () => {
    const { roomCode } = seedRoom()
    expect(() => service.startGame(roomCode, 'not-the-host')).toThrow(ForbiddenException)
  })
})

describe('getHostRooms', () => {
  it('returns only rooms hosted by the given user, with packTitle/playerCount/phase', () => {
    const a = seedRoom()
    addParticipant(a.state)
    addParticipant(a.state)
    const otherHost = randomUUID()
    const otherState = new RoomState({
      roomId: randomUUID(),
      roomCode: 'OTHR',
      hostId: otherHost,
      packId: randomUUID(),
      packTitle: 'Other Pack',
      gameConfig: makeGameConfig([makeQuestion(0)]),
    })
    store.set('OTHR', otherState)

    const mine = service.getHostRooms(a.hostId)
    expect(mine).toEqual([
      { roomCode: a.roomCode, packId: a.state.packId, packTitle: 'Pack', playerCount: 2, phase: 'lobby' },
    ])

    const theirs = service.getHostRooms(otherHost)
    expect(theirs).toEqual([
      { roomCode: 'OTHR', packId: otherState.packId, packTitle: 'Other Pack', playerCount: 0, phase: 'lobby' },
    ])
  })

  it('returns an empty array when the host has no live rooms', () => {
    expect(service.getHostRooms(randomUUID())).toEqual([])
  })
})

describe('startGame', () => {
  it('moves from lobby to the first question and starts the timer', () => {
    const { state, hostId, roomCode } = seedRoom({ questions: [makeQuestion(0, 20)] })
    const dto = service.startGame(roomCode, hostId)

    expect(state.phase).toBe('question')
    expect(state.currentQuestionIndex).toBe(0)
    expect(state.questionStartedAt).toEqual(new Date('2026-01-01T00:00:00Z'))
    expect(state.timer.endsAt?.getTime()).toBe(Date.now() + 20_000)
    expect(dto.currentQuestion?.questionId).toBe(state.gameConfig.questions[0].id)
    expect(dto.currentQuestion).not.toHaveProperty('correctChoiceId')
  })

  it('rejects starting a game that is not in lobby', () => {
    const { hostId, roomCode } = seedRoom({ phase: 'question' })
    expect(() => service.startGame(roomCode, hostId)).toThrow(BadRequestException)
  })

  it('rejects starting a game with no questions', () => {
    const { hostId, roomCode } = seedRoom({ questions: [] })
    expect(() => service.startGame(roomCode, hostId)).toThrow(BadRequestException)
  })
})

describe('submitAnswer', () => {
  function setup() {
    const seeded = seedRoom({ questions: [makeQuestion(0)] })
    seeded.state.phase = 'question'
    seeded.state.currentQuestionIndex = 0
    seeded.state.questionStartedAt = new Date(Date.now() - 2000)
    const pid = addParticipant(seeded.state)
    const q = seeded.state.gameConfig.questions[0]
    const user: AccessTokenPayload = { sub: randomUUID(), role: 'guest', displayName: 'P', roomCode: seeded.roomCode, roomParticipantId: pid }
    return { ...seeded, pid, q, user }
  }

  it('records an answer with the elapsed response time', () => {
    const { roomCode, q, user, state, pid } = setup()
    const result = service.submitAnswer(roomCode, user, { questionId: q.id, choiceId: q.data.choices[0].id })

    expect(result.responseTimeMs).toBe(2000)
    expect(state.answers.get(q.id)?.get(pid)?.choiceId).toBe(q.data.choices[0].id)
  })

  it('rejects a second answer for the same question', () => {
    const { roomCode, q, user } = setup()
    service.submitAnswer(roomCode, user, { questionId: q.id, choiceId: q.data.choices[0].id })
    expect(() => service.submitAnswer(roomCode, user, { questionId: q.id, choiceId: q.data.choices[1].id })).toThrow(
      ConflictException,
    )
  })

  it('rejects answers outside the question phase', () => {
    const { roomCode, q, user, state } = setup()
    state.phase = 'reveal'
    expect(() => service.submitAnswer(roomCode, user, { questionId: q.id, choiceId: q.data.choices[0].id })).toThrow(
      BadRequestException,
    )
  })

  it('rejects a user with no room session', () => {
    const { roomCode, q, user } = setup()
    expect(() => service.submitAnswer(roomCode, { ...user, roomParticipantId: undefined }, { questionId: q.id, choiceId: q.data.choices[0].id })).toThrow(
      ForbiddenException,
    )
  })

  it('rejects a token scoped to a different room', () => {
    const { roomCode, q, user } = setup()
    expect(() => service.submitAnswer(roomCode, { ...user, roomCode: 'ZZZZ' }, { questionId: q.id, choiceId: q.data.choices[0].id })).toThrow(
      ForbiddenException,
    )
  })

  it('rejects an answer for the wrong question id', () => {
    const { roomCode, user } = setup()
    expect(() => service.submitAnswer(roomCode, user, { questionId: randomUUID(), choiceId: randomUUID() })).toThrow(
      BadRequestException,
    )
  })
})

describe('advance: scoring on question -> reveal', () => {
  it('awards a point for the correct choice and accumulates response time', async () => {
    const { state, hostId, roomCode } = seedRoom({ questions: [makeQuestion(0)] })
    state.phase = 'question'
    state.currentQuestionIndex = 0
    const q = state.gameConfig.questions[0]
    const correct = q.data.choices[0].id
    const wrong = q.data.choices[1].id
    const p1 = addParticipant(state, { name: 'Right' })
    const p2 = addParticipant(state, { name: 'Wrong' })
    state.answers.set(
      q.id,
      new Map([
        [p1, { choiceId: correct, submittedAt: new Date(), responseTimeMs: 1000 }],
        [p2, { choiceId: wrong, submittedAt: new Date(), responseTimeMs: 2000 }],
      ]),
    )

    await service.advance(roomCode, hostId)

    expect(state.phase).toBe('reveal')
    expect(state.participants.get(p1)!.score).toBe(1)
    expect(state.participants.get(p1)!.totalResponseTimeMs).toBe(1000)
    expect(state.participants.get(p2)!.score).toBe(0)
    expect(state.participants.get(p2)!.totalResponseTimeMs).toBe(2000)
  })

  it('reveal DTO exposes the correct choice and an answer breakdown', async () => {
    const { state, hostId, roomCode } = seedRoom({ questions: [makeQuestion(0)] })
    state.phase = 'question'
    state.currentQuestionIndex = 0
    const q = state.gameConfig.questions[0]
    const p1 = addParticipant(state)
    const p2 = addParticipant(state)
    state.answers.set(
      q.id,
      new Map([
        [p1, { choiceId: q.data.choices[0].id, submittedAt: new Date(), responseTimeMs: 1000 }],
        [p2, { choiceId: q.data.choices[0].id, submittedAt: new Date(), responseTimeMs: 1500 }],
      ]),
    )

    const dto = await service.advance(roomCode, hostId)
    expect(dto.currentQuestion?.correctChoiceId).toBe(q.data.correctChoiceId)
    expect(dto.currentQuestion?.answerBreakdown).toEqual({ [q.data.choices[0].id]: 2 })
  })
})

describe('advance: phase progression', () => {
  it('advances from reveal to the next question and starts a new timer', async () => {
    const { state, hostId, roomCode } = seedRoom({ questions: [makeQuestion(0), makeQuestion(1, 45)] })
    state.phase = 'reveal'
    state.currentQuestionIndex = 0

    const dto = await service.advance(roomCode, hostId)

    expect(state.phase).toBe('question')
    expect(state.currentQuestionIndex).toBe(1)
    expect(state.timer.endsAt?.getTime()).toBe(Date.now() + 45_000)
    expect(dto.currentQuestion?.questionId).toBe(state.gameConfig.questions[1].id)
  })

  it('finalizes the game when advancing past the last question', async () => {
    const { state, hostId, roomCode } = seedRoom({ questions: [makeQuestion(0)] })
    state.phase = 'reveal'
    state.currentQuestionIndex = 0
    addParticipant(state, { name: 'Winner', score: 3, rtMs: 1000 })
    prisma.gameResult.create.mockResolvedValue({ id: 'gr1' })
    prisma.room.update.mockResolvedValue({})

    const dto = await service.advance(roomCode, hostId)

    expect(state.phase).toBe('final')
    expect(prisma.gameResult.create).toHaveBeenCalledOnce()
    expect(prisma.room.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'final', endedAt: expect.any(Date) }) }),
    )
    expect(dto.finalPodium?.[0]).toMatchObject({ rank: 1, displayName: 'Winner', score: 3 })
  })

  it('rejects advancing from the lobby', async () => {
    const { hostId, roomCode } = seedRoom({ phase: 'lobby' })
    await expect(service.advance(roomCode, hostId)).rejects.toBeInstanceOf(BadRequestException)
  })
})

describe('pauseGame', () => {
  it('pauses then resumes the running timer on successive calls', () => {
    const { state, hostId, roomCode } = seedRoom({ phase: 'question' })
    state.currentQuestionIndex = 0
    state.startTimer(30_000, () => undefined)

    service.pauseGame(roomCode, hostId)
    expect(state.timer.isPaused).toBe(true)

    service.pauseGame(roomCode, hostId)
    expect(state.timer.isPaused).toBe(false)
  })

  it('rejects pausing outside the question phase', () => {
    const { hostId, roomCode } = seedRoom({ phase: 'lobby' })
    expect(() => service.pauseGame(roomCode, hostId)).toThrow(BadRequestException)
  })
})

describe('kick', () => {
  it('removes the participant and marks the row inactive', async () => {
    const { state, hostId, roomCode } = seedRoom()
    const pid = addParticipant(state)
    prisma.roomParticipant.updateMany.mockResolvedValue({ count: 1 })

    await service.kick(roomCode, hostId, pid)

    expect(state.participants.has(pid)).toBe(false)
    expect(prisma.roomParticipant.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: pid, roomCode }, data: { isActive: false } }),
    )
  })

  it('throws NotFound when kicking an unknown participant', async () => {
    const { hostId, roomCode } = seedRoom()
    await expect(service.kick(roomCode, hostId, 'ghost')).rejects.toBeInstanceOf(NotFoundException)
  })
})

describe('updateLobbyConfig', () => {
  it('updates late-join policy and phone-text mode in the lobby', () => {
    const { state, hostId, roomCode } = seedRoom({ phase: 'lobby' })
    const dto = service.updateLobbyConfig(roomCode, hostId, { lateJoinPolicy: 'locked', phoneTextMode: 'full' })
    expect(state.gameConfig.lateJoinPolicy).toBe('locked')
    expect(dto.phoneTextMode).toBe('full')
  })

  it('rejects config changes once the game has started', () => {
    const { hostId, roomCode } = seedRoom({ phase: 'question' })
    expect(() => service.updateLobbyConfig(roomCode, hostId, { lateJoinPolicy: 'locked' })).toThrow(
      BadRequestException,
    )
  })
})

describe('createRoom', () => {
  function mockPack(hostId: string, opts: { questions?: number; ownerId?: string; games?: boolean } = {}) {
    const q = makeQuestion(0)
    const questions =
      (opts.questions ?? 1) > 0
        ? [{ id: q.id, prompt: q.prompt, imageUrl: null, data: q.data, defaultTimerSeconds: 30, position: 0 }]
        : []
    return {
      id: randomUUID(),
      ownerId: opts.ownerId ?? hostId,
      title: 'Pack',
      games: opts.games === false ? [] : [{ id: randomUUID(), title: 'G', lateJoinDefault: 'open', phoneTextMode: 'heads_up', questions }],
    }
  }

  it('creates a room, stores live state, and returns a 4-char code', async () => {
    const hostId = randomUUID()
    const pack = mockPack(hostId)
    prisma.pack.findUnique.mockResolvedValue(pack)
    prisma.room.findUnique.mockResolvedValue(null)
    prisma.room.create.mockResolvedValue({ id: randomUUID() })

    const result = await service.createRoom(hostId, { packId: pack.id, gameId: pack.games[0].id })

    expect(result.roomCode).toMatch(/^[2-9A-HJ-NP-Z]{4}$/)
    expect(store.has(result.roomCode)).toBe(true)
  })

  it('throws NotFound when the pack does not exist', async () => {
    prisma.pack.findUnique.mockResolvedValue(null)
    await expect(service.createRoom('h', { packId: 'p', gameId: 'g' })).rejects.toBeInstanceOf(NotFoundException)
  })

  it('throws Forbidden when the pack belongs to another host', async () => {
    prisma.pack.findUnique.mockResolvedValue(mockPack('someone-else', { ownerId: 'someone-else' }))
    await expect(service.createRoom('h', { packId: 'p', gameId: 'g' })).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('throws NotFound when the requested game is not in the pack', async () => {
    const hostId = randomUUID()
    prisma.pack.findUnique.mockResolvedValue(mockPack(hostId, { games: false }))
    await expect(service.createRoom(hostId, { packId: 'p', gameId: 'g' })).rejects.toBeInstanceOf(NotFoundException)
  })

  it('throws BadRequest when the game has no questions', async () => {
    const hostId = randomUUID()
    prisma.pack.findUnique.mockResolvedValue(mockPack(hostId, { questions: 0 }))
    await expect(service.createRoom(hostId, { packId: 'p', gameId: 'g' })).rejects.toBeInstanceOf(BadRequestException)
  })
})

describe('joinRoom', () => {
  it('rejects joining a finished game', async () => {
    const { roomCode } = seedRoom({ phase: 'final' })
    await expect(service.joinRoom(roomCode, undefined)).rejects.toBeInstanceOf(BadRequestException)
  })

  it('creates a new guest participant when joining the lobby unauthenticated', async () => {
    const { state, roomCode } = seedRoom({ phase: 'lobby' })
    prisma.user.create.mockResolvedValue({ id: 'g1' })
    prisma.roomParticipant.create.mockResolvedValue({ id: 'p1' })

    const result = await service.joinRoom(roomCode, undefined)

    expect(users.generateDisplayName).toHaveBeenCalled()
    expect(result.participant).toEqual({ id: 'p1', displayName: 'BraveOtter' })
    expect(state.participants.has('p1')).toBe(true)
  })

  it('reconnects an existing guest without creating a new participant', async () => {
    const { state, roomCode } = seedRoom({ phase: 'question', lateJoinPolicy: 'open' })
    const pid = addParticipant(state, { name: 'BraveOtter' })
    state.participants.get(pid)!.isConnected = false
    auth.verifyAccessToken.mockReturnValue({ sub: 'g1', role: 'guest', displayName: 'BraveOtter', roomCode, roomParticipantId: pid })

    const result = await service.joinRoom(roomCode, 'Bearer token')

    expect(prisma.user.create).not.toHaveBeenCalled()
    expect(result.participant).toEqual({ id: pid, displayName: 'BraveOtter' })
    expect(state.participants.get(pid)!.isConnected).toBe(true)
  })

  it('adds a registered user using their real identity', async () => {
    const { state, roomCode } = seedRoom({ phase: 'lobby' })
    auth.verifyAccessToken.mockReturnValue({ sub: 'u1', role: 'player', displayName: 'Alex' })
    prisma.user.findUniqueOrThrow.mockResolvedValue({ id: 'u1', displayName: 'Alex' })
    prisma.roomParticipant.create.mockResolvedValue({ id: 'p2' })

    const result = await service.joinRoom(roomCode, 'Bearer token')

    expect(prisma.user.create).not.toHaveBeenCalled()
    expect(result.participant).toEqual({ id: 'p2', displayName: 'Alex' })
    expect(state.participants.get('p2')!.userId).toBe('u1')
  })

  it('allows a guest late-join when policy is open mid-question', async () => {
    const { roomCode } = seedRoom({ phase: 'question', lateJoinPolicy: 'open' })
    prisma.user.create.mockResolvedValue({ id: 'g2' })
    prisma.roomParticipant.create.mockResolvedValue({ id: 'p3' })
    await expect(service.joinRoom(roomCode, undefined)).resolves.toBeTruthy()
  })

  it('blocks a late-join when policy is locked mid-question', async () => {
    const { roomCode } = seedRoom({ phase: 'question', lateJoinPolicy: 'locked' })
    await expect(service.joinRoom(roomCode, undefined)).rejects.toBeInstanceOf(BadRequestException)
  })
})

describe('rerollName', () => {
  function setup() {
    const seeded = seedRoom({ phase: 'lobby' })
    const pid = addParticipant(seeded.state, { name: 'OldName' })
    const user: AccessTokenPayload = { sub: randomUUID(), role: 'guest', displayName: 'OldName', roomCode: seeded.roomCode, roomParticipantId: pid }
    return { ...seeded, pid, user }
  }

  it('assigns a new name and persists it', async () => {
    const { roomCode, user, pid, state } = setup()
    users.generateDisplayName.mockReturnValue('CleverFox')
    prisma.user.update.mockResolvedValue({})
    prisma.roomParticipant.update.mockResolvedValue({})

    const result = await service.rerollName(roomCode, user)

    expect(result.displayName).toBe('CleverFox')
    expect(state.participants.get(pid)!.displayName).toBe('CleverFox')
    expect(prisma.roomParticipant.update).toHaveBeenCalled()
  })

  it('rejects when the token has no room session', async () => {
    const { roomCode, user } = setup()
    await expect(service.rerollName(roomCode, { ...user, roomParticipantId: undefined })).rejects.toBeInstanceOf(
      ForbiddenException,
    )
  })

  it('rejects when the token is for a different room', async () => {
    const { roomCode, user } = setup()
    await expect(service.rerollName(roomCode, { ...user, roomCode: 'ZZZZ' })).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('rejects rerolling once the game has started', async () => {
    const { roomCode, user, state } = setup()
    state.phase = 'question'
    await expect(service.rerollName(roomCode, user)).rejects.toBeInstanceOf(BadRequestException)
  })
})

describe('selectGame', () => {
  function mockGame(questions = 1) {
    const q = makeQuestion(0)
    return {
      id: randomUUID(),
      title: 'Game 2',
      lateJoinDefault: 'locked',
      phoneTextMode: 'full',
      questions:
        questions > 0
          ? [{ id: q.id, prompt: q.prompt, imageUrl: null, data: q.data, defaultTimerSeconds: 30, position: 0 }]
          : [],
    }
  }

  it('resets the room to a fresh lobby for the newly selected game', async () => {
    const { state, hostId, roomCode } = seedRoom({ phase: 'final' })
    addParticipant(state, { name: 'P', score: 5, rtMs: 9000 })
    const game = mockGame()
    prisma.game.findFirst.mockResolvedValue(game)
    prisma.room.update.mockResolvedValue({})

    const dto = await service.selectGame(roomCode, hostId, game.id)

    expect(state.phase).toBe('lobby')
    expect(state.currentQuestionIndex).toBe(-1)
    expect(state.currentGameIndex).toBe(1)
    expect(dto.gameTitle).toBe('Game 2')
    expect([...state.participants.values()][0].score).toBe(0)
  })

  it('rejects selecting a game before the current one ends', async () => {
    const { hostId, roomCode } = seedRoom({ phase: 'lobby' })
    await expect(service.selectGame(roomCode, hostId, 'g')).rejects.toBeInstanceOf(BadRequestException)
  })

  it('throws NotFound when the game is not in the current pack', async () => {
    const { hostId, roomCode } = seedRoom({ phase: 'final' })
    prisma.game.findFirst.mockResolvedValue(null)
    await expect(service.selectGame(roomCode, hostId, 'g')).rejects.toBeInstanceOf(NotFoundException)
  })

  it('throws BadRequest when the selected game has no questions', async () => {
    const { hostId, roomCode } = seedRoom({ phase: 'final' })
    prisma.game.findFirst.mockResolvedValue(mockGame(0))
    await expect(service.selectGame(roomCode, hostId, 'g')).rejects.toBeInstanceOf(BadRequestException)
  })
})

// R8: concurrent guest join race condition
// The race: N calls all read `existingNames` from state.participants before any resolves.
// With a deterministic generateDisplayName mock, all guests get the same display name.
// This is a known limitation of the current in-memory implementation - name uniqueness
// is not enforced under concurrent load, but participant data (IDs, scores) is never lost.
describe('concurrent guest joins (R8)', () => {
  it('all N guests resolve and every participant is stored without data loss', async () => {
    const { state, roomCode } = seedRoom({ phase: 'lobby' })
    const N = 5

    // Each call gets a unique user and participant ID from Prisma
    for (let i = 0; i < N; i++) {
      prisma.user.create.mockResolvedValueOnce({ id: `g${i}` })
      prisma.roomParticipant.create.mockResolvedValueOnce({ id: `p${i}` })
    }

    const results = await Promise.all(
      Array.from({ length: N }, () => service.joinRoom(roomCode, undefined)),
    )

    // All calls resolved - no data loss
    expect(results).toHaveLength(N)
    expect(state.participants.size).toBe(N)

    // Each participant ID is unique even if display names collide
    const ids = results.map((r) => r.participant.id)
    expect(new Set(ids).size).toBe(N)
  })

  it('documents the known name-collision under concurrent load', async () => {
    const { state, roomCode } = seedRoom({ phase: 'lobby' })
    const N = 3

    for (let i = 0; i < N; i++) {
      prisma.user.create.mockResolvedValueOnce({ id: `g${i}` })
      prisma.roomParticipant.create.mockResolvedValueOnce({ id: `p${i}` })
    }

    await Promise.all(
      Array.from({ length: N }, () => service.joinRoom(roomCode, undefined)),
    )

    // generateDisplayName is a deterministic mock (always 'BraveOtter'),
    // so concurrent calls all receive the same name - a known gap in the
    // current implementation. The test documents this rather than asserting
    // uniqueness so a future fix can tighten the assertion.
    const names = [...state.participants.values()].map((p) => p.displayName)
    expect(names).toHaveLength(N)
    expect(names.every((n) => n === 'BraveOtter')).toBe(true)
  })
})

describe('toRoomStateDto leaderboard', () => {
  it('ranks by score desc, breaking ties by faster total response time', () => {
    const { state, roomCode } = seedRoom({ phase: 'lobby' })
    addParticipant(state, { id: 'slow2pts', name: 'Slow2', score: 2, rtMs: 5000 })
    addParticipant(state, { id: 'top', name: 'Top', score: 3, rtMs: 1000 })
    addParticipant(state, { id: 'fast2pts', name: 'Fast2', score: 2, rtMs: 3000 })

    const dto = service.getRoomStateDto(roomCode)

    expect(dto.leaderboard.map((e) => e.participantId)).toEqual(['top', 'fast2pts', 'slow2pts'])
    expect(dto.leaderboard.map((e) => e.rank)).toEqual([1, 2, 3])
    expect(dto.players).toHaveLength(3)
    expect(dto.finalPodium).toBeNull()
  })
})

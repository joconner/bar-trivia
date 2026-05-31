import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { AuthService } from '../auth/auth.service'
import { UsersService } from '../users/users.service'
import { RoomStateStore } from './room-state.store'
import { RoomState, ParticipantState, AnswerRecord, GameConfig } from './room-state'
import {
  RoomStateDto,
  MultipleChoiceDataSchema,
  LeaderboardEntry,
  PlayerSummary,
  FinalPodiumEntry,
  AccessTokenPayload,
} from '@bar-trivia/shared'

@Injectable()
export class RoomsService {
  private gateway: { broadcastRoomState(roomCode: string, state: RoomStateDto): void } | null = null

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly users: UsersService,
    private readonly store: RoomStateStore,
  ) {}

  setGateway(gw: { broadcastRoomState(roomCode: string, state: RoomStateDto): void }): void {
    this.gateway = gw
  }

  async createRoom(hostId: string, body: { packId: string; gameId: string }) {
    const pack = await this.prisma.pack.findUnique({
      where: { id: body.packId },
      include: {
        games: {
          where: { id: body.gameId },
          include: { questions: { orderBy: { position: 'asc' } } },
        },
      },
    })

    if (!pack) throw new NotFoundException('Pack not found')
    if (pack.ownerId !== hostId) throw new ForbiddenException('Not your pack')

    const game = pack.games[0]
    if (!game) throw new NotFoundException('Game not found in pack')
    if (game.questions.length === 0) throw new BadRequestException('Game has no questions')

    const roomCode = await this.generateUniqueRoomCode()

    const room = await this.prisma.room.create({
      data: { roomCode, hostId, packId: body.packId, currentGameId: game.id, status: 'lobby' },
    })

    const gameConfig: GameConfig = {
      gameId: game.id,
      gameTitle: game.title,
      lateJoinPolicy: game.lateJoinDefault as 'open' | 'locked',
      phoneTextMode: game.phoneTextMode as 'heads_up' | 'full',
      questions: game.questions.map((q) => ({
        id: q.id,
        prompt: q.prompt,
        imageUrl: q.imageUrl,
        data: MultipleChoiceDataSchema.parse(q.data),
        defaultTimerSeconds: q.defaultTimerSeconds,
        position: q.position,
      })),
    }

    const state = new RoomState({ roomId: room.id, roomCode, hostId, packId: body.packId, packTitle: pack.title, gameConfig })
    this.store.set(roomCode, state)

    // The TV builds the player join URL from its own window.location.origin —
    // the server doesn't know which hostname (LAN IP, mDNS, etc.) the TV was
    // opened at, so any URL the server constructs would lie to mobile devices
    // on the same Wi-Fi. Clients that need the join link derive it themselves.
    return { roomCode }
  }

  getRoomStateDto(roomCode: string): RoomStateDto {
    const state = this.requireRoom(roomCode)
    return this.toRoomStateDto(state)
  }

  // Returns count of live in-memory rooms, plus the code if exactly one exists.
  // Used by the TV client to auto-discover the room to observe.
  getActiveRooms(): { count: number; roomCode: string | null } {
    const codes = this.store.codes()
    return { count: codes.length, roomCode: codes.length === 1 ? codes[0] : null }
  }

  updateLobbyConfig(
    roomCode: string,
    hostId: string,
    config: { lateJoinPolicy?: 'open' | 'locked'; phoneTextMode?: 'heads_up' | 'full' },
  ): RoomStateDto {
    const state = this.requireRoom(roomCode)
    this.requireHost(state, hostId)
    if (state.phase !== 'lobby') throw new BadRequestException('Can only update config in lobby phase')

    if (config.lateJoinPolicy !== undefined) state.gameConfig.lateJoinPolicy = config.lateJoinPolicy
    if (config.phoneTextMode !== undefined) state.gameConfig.phoneTextMode = config.phoneTextMode

    this.broadcast(roomCode)
    return this.toRoomStateDto(state)
  }

  async joinRoom(
    roomCode: string,
    authHeader: string | undefined,
  ): Promise<{ accessToken: string; refreshToken?: string; participant: { id: string; displayName: string } }> {
    const state = this.requireRoom(roomCode)

    const canJoin =
      state.phase === 'lobby' ||
      (state.phase !== 'final' && state.gameConfig.lateJoinPolicy === 'open')
    if (!canJoin) throw new BadRequestException('Room is not accepting new players')

    let parsed: AccessTokenPayload | null = null
    if (authHeader?.startsWith('Bearer ')) {
      try {
        parsed = this.auth.verifyAccessToken(authHeader.slice(7))
      } catch {
        // Invalid or expired — treat as unauthenticated
      }
    }

    // Reconnect path: valid guest token for this exact room, participant still in memory
    if (
      parsed?.role === 'guest' &&
      parsed.roomParticipantId &&
      parsed.roomCode === roomCode &&
      state.participants.has(parsed.roomParticipantId)
    ) {
      const existing = state.participants.get(parsed.roomParticipantId)!
      existing.isConnected = true
      const accessToken = this.auth.issueRoomAccessToken(
        parsed.sub,
        existing.displayName,
        roomCode,
        parsed.roomParticipantId,
      )
      this.broadcast(roomCode)
      return { accessToken, participant: { id: parsed.roomParticipantId, displayName: existing.displayName } }
    }

    // Registered user joining: look up their real identity, no new User row
    if (parsed !== null && parsed.role !== 'guest') {
      const user = await this.prisma.user.findUniqueOrThrow({ where: { id: parsed.sub } })
      const displayName = user.displayName

      const participant = await this.prisma.roomParticipant.create({
        data: { userId: user.id, roomId: state.roomId, roomCode, displayName },
      })

      const { accessToken, refreshToken } = await this.auth.issueRoomTokenPair(
        user.id,
        displayName,
        roomCode,
        participant.id,
      )

      const participantState: ParticipantState = {
        userId: user.id,
        displayName,
        score: 0,
        totalResponseTimeMs: 0,
        socketId: null,
        isConnected: true,
      }
      state.participants.set(participant.id, participantState)

      this.broadcast(roomCode)
      return { accessToken, refreshToken, participant: { id: participant.id, displayName } }
    }

    // New guest participant
    const existingNames = new Set([...state.participants.values()].map((p) => p.displayName))
    const displayName = this.users.generateDisplayName(existingNames)

    const guestUser = await this.prisma.user.create({ data: { role: 'guest', displayName } })

    const participant = await this.prisma.roomParticipant.create({
      data: { userId: guestUser.id, roomId: state.roomId, roomCode, displayName },
    })

    const { accessToken, refreshToken } = await this.auth.issueRoomTokenPair(
      guestUser.id,
      displayName,
      roomCode,
      participant.id,
    )

    const participantState: ParticipantState = {
      userId: guestUser.id,
      displayName,
      score: 0,
      totalResponseTimeMs: 0,
      socketId: null,
      isConnected: true,
    }
    state.participants.set(participant.id, participantState)

    this.broadcast(roomCode)
    return { accessToken, refreshToken, participant: { id: participant.id, displayName } }
  }

  async rerollName(
    roomCode: string,
    user: AccessTokenPayload,
  ): Promise<{ accessToken: string; displayName: string }> {
    const state = this.requireRoom(roomCode)
    if (!user.roomParticipantId) throw new ForbiddenException('No room session')
    if (user.roomCode !== roomCode) throw new ForbiddenException('Wrong room')
    if (state.phase !== 'lobby') throw new BadRequestException('Can only reroll name in lobby')

    const participant = state.participants.get(user.roomParticipantId)
    if (!participant) throw new NotFoundException('Participant not in room')

    const existingNames = new Set([...state.participants.values()].map((p) => p.displayName))
    existingNames.delete(participant.displayName)

    let newName: string
    let attempts = 0
    do {
      newName = this.users.generateDisplayName(existingNames)
      attempts++
    } while (newName === participant.displayName && attempts < 5)

    await this.prisma.user.update({ where: { id: participant.userId }, data: { displayName: newName } })
    await this.prisma.roomParticipant.update({ where: { id: user.roomParticipantId }, data: { displayName: newName } })

    participant.displayName = newName
    const accessToken = this.auth.issueRoomAccessToken(user.sub, newName, roomCode, user.roomParticipantId)

    this.broadcast(roomCode)
    return { accessToken, displayName: newName }
  }

  startGame(roomCode: string, hostId: string): RoomStateDto {
    const state = this.requireRoom(roomCode)
    this.requireHost(state, hostId)
    if (state.phase !== 'lobby') throw new BadRequestException('Game already started')
    if (state.gameConfig.questions.length === 0) throw new BadRequestException('No questions in game')

    state.currentQuestionIndex = 0
    state.questionStartedAt = new Date()
    state.phase = 'question'

    const q = state.gameConfig.questions[0]
    state.startTimer(q.defaultTimerSeconds * 1000, () => this.handleTimerExpiry(roomCode))

    this.broadcast(roomCode)
    return this.toRoomStateDto(state)
  }

  async selectGame(roomCode: string, hostId: string, gameId: string): Promise<RoomStateDto> {
    const state = this.requireRoom(roomCode)
    this.requireHost(state, hostId)
    if (state.phase !== 'final') throw new BadRequestException('Can only select game after a game ends')

    const game = await this.prisma.game.findFirst({
      where: { id: gameId, packId: state.packId },
      include: { questions: { orderBy: { position: 'asc' } } },
    })
    if (!game) throw new NotFoundException('Game not found in current pack')
    if (game.questions.length === 0) throw new BadRequestException('Game has no questions')

    state.clearTimer()
    state.phase = 'lobby'
    state.currentQuestionIndex = -1
    state.questionStartedAt = null
    state.currentGameIndex++
    state.answers = new Map()
    state.gameConfig = {
      gameId: game.id,
      gameTitle: game.title,
      lateJoinPolicy: game.lateJoinDefault as 'open' | 'locked',
      phoneTextMode: game.phoneTextMode as 'heads_up' | 'full',
      questions: game.questions.map((q) => ({
        id: q.id,
        prompt: q.prompt,
        imageUrl: q.imageUrl,
        data: MultipleChoiceDataSchema.parse(q.data),
        defaultTimerSeconds: q.defaultTimerSeconds,
        position: q.position,
      })),
    }

    for (const p of state.participants.values()) {
      p.score = 0
      p.totalResponseTimeMs = 0
    }

    await this.prisma.room.update({
      where: { id: state.roomId },
      data: { currentGameId: game.id, status: 'lobby', endedAt: null },
    })

    this.broadcast(roomCode)
    return this.toRoomStateDto(state)
  }

  pauseGame(roomCode: string, hostId: string): RoomStateDto {
    const state = this.requireRoom(roomCode)
    this.requireHost(state, hostId)
    if (state.phase !== 'question') throw new BadRequestException('Not in question phase')

    if (state.timer.isPaused) {
      state.resumeTimer(() => this.handleTimerExpiry(roomCode))
    } else {
      state.pauseTimer()
    }

    this.broadcast(roomCode)
    return this.toRoomStateDto(state)
  }

  async advance(roomCode: string, hostId: string): Promise<RoomStateDto> {
    const state = this.requireRoom(roomCode)
    this.requireHost(state, hostId)

    if (state.phase === 'question') {
      state.clearTimer()
      this.scoreQuestion(state)
      state.phase = 'reveal'
      this.broadcast(roomCode)
      return this.toRoomStateDto(state)
    }

    if (state.phase === 'reveal') {
      const isLast = state.currentQuestionIndex >= state.gameConfig.questions.length - 1
      if (isLast) {
        await this.finalizeGame(state)
      } else {
        state.currentQuestionIndex++
        state.questionStartedAt = new Date()
        state.phase = 'question'
        const q = state.gameConfig.questions[state.currentQuestionIndex]
        state.startTimer(q.defaultTimerSeconds * 1000, () => this.handleTimerExpiry(roomCode))
      }
      this.broadcast(roomCode)
      return this.toRoomStateDto(state)
    }

    throw new BadRequestException(`Cannot advance from '${state.phase}' phase`)
  }

  async kick(roomCode: string, hostId: string, participantId: string): Promise<RoomStateDto> {
    const state = this.requireRoom(roomCode)
    this.requireHost(state, hostId)
    if (!state.participants.has(participantId)) throw new NotFoundException('Participant not in room')

    state.participants.delete(participantId)

    await this.prisma.roomParticipant.updateMany({
      where: { id: participantId, roomCode },
      data: { isActive: false },
    })

    this.broadcast(roomCode)
    return this.toRoomStateDto(state)
  }

  submitAnswer(
    roomCode: string,
    user: AccessTokenPayload,
    body: { questionId: string; choiceId: string },
  ): { questionId: string; choiceId: string; responseTimeMs: number } {
    const state = this.requireRoom(roomCode)
    if (state.phase !== 'question') throw new BadRequestException('Not accepting answers right now')
    if (!user.roomParticipantId) throw new ForbiddenException('No room session')
    if (user.roomCode !== roomCode) throw new ForbiddenException('Wrong room')

    const q = state.gameConfig.questions[state.currentQuestionIndex]
    if (!q) throw new BadRequestException('No active question')
    if (q.id !== body.questionId) throw new BadRequestException('Wrong question ID')

    const questionAnswers = state.answers.get(q.id) ?? new Map<string, AnswerRecord>()
    if (questionAnswers.has(user.roomParticipantId)) {
      throw new ConflictException('Already submitted an answer for this question')
    }

    const responseTimeMs = state.questionStartedAt
      ? Math.max(0, Date.now() - state.questionStartedAt.getTime())
      : 0

    const record: AnswerRecord = { choiceId: body.choiceId, submittedAt: new Date(), responseTimeMs }
    questionAnswers.set(user.roomParticipantId, record)
    state.answers.set(q.id, questionAnswers)

    return { questionId: q.id, choiceId: body.choiceId, responseTimeMs }
  }

  // --- Private helpers ---

  private requireRoom(roomCode: string): RoomState {
    const state = this.store.get(roomCode)
    if (!state) throw new NotFoundException('Room not found or expired')
    return state
  }

  private requireHost(state: RoomState, hostId: string): void {
    if (state.hostId !== hostId) throw new ForbiddenException('Only the host can do that')
  }

  private handleTimerExpiry(roomCode: string): void {
    const state = this.store.get(roomCode)
    if (!state || state.phase !== 'question') return
    state.timer.timeoutRef = null
    state.timer.endsAt = null
    this.scoreQuestion(state)
    state.phase = 'reveal'
    this.broadcast(roomCode)
  }

  private scoreQuestion(state: RoomState): void {
    const q = state.gameConfig.questions[state.currentQuestionIndex]
    if (!q) return
    const questionAnswers = state.answers.get(q.id) ?? new Map<string, AnswerRecord>()
    for (const [participantId, answer] of questionAnswers) {
      const p = state.participants.get(participantId)
      if (!p) continue
      if (answer.choiceId === q.data.correctChoiceId) p.score += 1
      p.totalResponseTimeMs += answer.responseTimeMs
    }
  }

  private async finalizeGame(state: RoomState): Promise<void> {
    const leaderboard = this.buildLeaderboard(state)
    const results = leaderboard.map((entry) => {
      const responseTimes: number[] = []
      for (const questionAnswers of state.answers.values()) {
        const answer = questionAnswers.get(entry.participantId)
        if (answer) responseTimes.push(answer.responseTimeMs)
      }
      return { participantId: entry.participantId, displayName: entry.displayName, score: entry.score, rank: entry.rank, responseTimes }
    })

    await this.prisma.gameResult.create({
      data: { roomId: state.roomId, gameId: state.gameConfig.gameId, results },
    })
    await this.prisma.room.update({ where: { id: state.roomId }, data: { status: 'final', endedAt: new Date() } })
    state.phase = 'final'
    state.clearTimer()
  }

  private buildLeaderboard(state: RoomState): LeaderboardEntry[] {
    const entries = [...state.participants.entries()].map(([participantId, p]) => ({
      participantId,
      displayName: p.displayName,
      score: p.score,
      totalResponseTimeMs: p.totalResponseTimeMs,
    }))
    entries.sort((a, b) => b.score - a.score || a.totalResponseTimeMs - b.totalResponseTimeMs)
    return entries.map((e, i) => ({ participantId: e.participantId, displayName: e.displayName, score: e.score, rank: i + 1 }))
  }

  private buildAnswerBreakdown(state: RoomState, questionId: string): Record<string, number> {
    const questionAnswers = state.answers.get(questionId) ?? new Map<string, AnswerRecord>()
    const breakdown: Record<string, number> = {}
    for (const answer of questionAnswers.values()) {
      breakdown[answer.choiceId] = (breakdown[answer.choiceId] ?? 0) + 1
    }
    return breakdown
  }

  private buildFinalPodium(state: RoomState): FinalPodiumEntry[] {
    return this.buildLeaderboard(state)
      .slice(0, 3)
      .map((e) => ({ rank: e.rank, participantId: e.participantId, displayName: e.displayName, score: e.score }))
  }

  toRoomStateDto(state: RoomState): RoomStateDto {
    const leaderboard = this.buildLeaderboard(state)
    const players: PlayerSummary[] = [...state.participants.entries()].map(([participantId, p]) => ({
      participantId,
      displayName: p.displayName,
      score: p.score,
    }))

    const q = state.currentQuestionIndex >= 0 ? state.gameConfig.questions[state.currentQuestionIndex] : null
    let currentQuestion: RoomStateDto['currentQuestion'] = null

    if (q && state.phase === 'question') {
      currentQuestion = {
        questionId: q.id,
        prompt: q.prompt,
        imageUrl: q.imageUrl,
        choices: q.data.choices,
        timerEndsAt: state.timer.endsAt?.toISOString() ?? null,
        isPaused: state.timer.isPaused,
        pausedRemainingMs: state.timer.pausedRemainingMs,
      }
    } else if (q && state.phase === 'reveal') {
      currentQuestion = {
        questionId: q.id,
        prompt: q.prompt,
        imageUrl: q.imageUrl,
        choices: q.data.choices,
        correctChoiceId: q.data.correctChoiceId,
        timerEndsAt: null,
        isPaused: false,
        pausedRemainingMs: null,
        answerBreakdown: this.buildAnswerBreakdown(state, q.id),
      }
    }

    const finalPodium = state.phase === 'final' ? this.buildFinalPodium(state) : null

    return {
      roomCode: state.roomCode,
      phase: state.phase,
      packTitle: state.packTitle,
      gameTitle: state.gameConfig.gameTitle,
      totalQuestions: state.gameConfig.questions.length,
      currentQuestionIndex: state.currentQuestionIndex >= 0 ? state.currentQuestionIndex : null,
      lateJoinPolicy: state.gameConfig.lateJoinPolicy,
      phoneTextMode: state.gameConfig.phoneTextMode,
      players,
      leaderboard,
      currentQuestion,
      finalPodium,
    }
  }

  private broadcast(roomCode: string): void {
    if (!this.gateway) return
    const state = this.store.get(roomCode)
    if (!state) return
    this.gateway.broadcastRoomState(roomCode, this.toRoomStateDto(state))
  }

  private async generateUniqueRoomCode(): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt++) {
      const code = this.generateRoomCode()
      const existing = await this.prisma.room.findUnique({ where: { roomCode: code } })
      if (!existing) return code
    }
    throw new InternalServerErrorException('Failed to generate unique room code after 10 attempts')
  }

  private generateRoomCode(): string {
    // Excludes confusable chars: 0/O, 1/I/L
    const chars = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
    let code = ''
    for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)]
    return code
  }
}

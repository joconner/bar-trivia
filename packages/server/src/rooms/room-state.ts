import type { MultipleChoiceData } from '@bar-trivia/shared'

export interface LoadedQuestion {
  id: string
  prompt: string
  imageUrl: string | null
  data: MultipleChoiceData
  defaultTimerSeconds: number
  position: number
}

export interface ParticipantState {
  userId: string
  displayName: string
  score: number
  totalResponseTimeMs: number
  socketId: string | null
  isConnected: boolean
}

export interface AnswerRecord {
  choiceId: string
  submittedAt: Date
  responseTimeMs: number
}

export interface GameConfig {
  gameId: string
  gameTitle: string
  lateJoinPolicy: 'open' | 'locked'
  phoneTextMode: 'heads_up' | 'full'
  questions: LoadedQuestion[]
}

export class RoomState {
  roomId: string
  roomCode: string
  hostId: string
  packId: string
  packTitle: string
  venueName?: string
  phase: 'lobby' | 'question' | 'reveal' | 'final' = 'lobby'
  currentGameIndex: number = 0
  currentQuestionIndex: number = -1
  questionStartedAt: Date | null = null
  gameConfig: GameConfig
  timer: {
    endsAt: Date | null
    isPaused: boolean
    pausedRemainingMs: number | null
    timeoutRef: ReturnType<typeof setTimeout> | null
  } = { endsAt: null, isPaused: false, pausedRemainingMs: null, timeoutRef: null }
  // participantId -> ParticipantState
  participants: Map<string, ParticipantState> = new Map()
  // questionId -> Map<participantId, AnswerRecord>
  answers: Map<string, Map<string, AnswerRecord>> = new Map()

  constructor(init: {
    roomId: string
    roomCode: string
    hostId: string
    packId: string
    packTitle: string
    venueName?: string
    gameConfig: GameConfig
  }) {
    this.roomId = init.roomId
    this.roomCode = init.roomCode
    this.hostId = init.hostId
    this.packId = init.packId
    this.packTitle = init.packTitle
    this.venueName = init.venueName
    this.gameConfig = init.gameConfig
  }

  startTimer(durationMs: number, onExpiry: () => void): void {
    this.clearTimer()
    this.timer.endsAt = new Date(Date.now() + durationMs)
    this.timer.isPaused = false
    this.timer.pausedRemainingMs = null
    this.timer.timeoutRef = setTimeout(onExpiry, durationMs)
  }

  pauseTimer(): boolean {
    if (!this.timer.endsAt || this.timer.isPaused) return false
    clearTimeout(this.timer.timeoutRef!)
    this.timer.timeoutRef = null
    this.timer.pausedRemainingMs = Math.max(0, this.timer.endsAt.getTime() - Date.now())
    this.timer.isPaused = true
    this.timer.endsAt = null
    return true
  }

  resumeTimer(onExpiry: () => void): boolean {
    if (!this.timer.isPaused || this.timer.pausedRemainingMs === null) return false
    const remaining = this.timer.pausedRemainingMs
    this.timer.endsAt = new Date(Date.now() + remaining)
    this.timer.isPaused = false
    this.timer.pausedRemainingMs = null
    this.timer.timeoutRef = setTimeout(onExpiry, remaining)
    return true
  }

  clearTimer(): void {
    if (this.timer.timeoutRef !== null) {
      clearTimeout(this.timer.timeoutRef)
      this.timer.timeoutRef = null
    }
    this.timer.endsAt = null
    this.timer.isPaused = false
    this.timer.pausedRemainingMs = null
  }
}

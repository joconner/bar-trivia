import { describe, it, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import {
  GamePhaseSchema,
  LeaderboardEntrySchema,
  PlayerSummarySchema,
  CurrentQuestionSchema,
  FinalPodiumEntrySchema,
  RoomStateDtoSchema,
} from '../src/schemas/rooms'

describe('GamePhaseSchema', () => {
  it('accepts the four phases', () => {
    for (const phase of ['lobby', 'question', 'reveal', 'final']) {
      expect(GamePhaseSchema.parse(phase)).toBe(phase)
    }
  })

  it('rejects an unknown phase', () => {
    expect(GamePhaseSchema.safeParse('paused').success).toBe(false)
  })
})

describe('CurrentQuestionSchema', () => {
  function base(extra: Record<string, unknown> = {}) {
    return {
      questionId: randomUUID(),
      prompt: 'Q?',
      imageUrl: null,
      choices: [
        { id: 'a', text: 'A' },
        { id: 'b', text: 'B' },
      ],
      timerEndsAt: null,
      isPaused: false,
      pausedRemainingMs: null,
      ...extra,
    }
  }

  it('accepts a question-phase shape with no correctChoiceId', () => {
    const parsed = CurrentQuestionSchema.parse(base())
    expect(parsed.correctChoiceId).toBeUndefined()
    expect(parsed.answerBreakdown).toBeUndefined()
  })

  it('accepts a reveal-phase shape with correctChoiceId and answerBreakdown', () => {
    const parsed = CurrentQuestionSchema.parse(
      base({ correctChoiceId: 'a', answerBreakdown: { a: 3, b: 1 } }),
    )
    expect(parsed.correctChoiceId).toBe('a')
    expect(parsed.answerBreakdown).toEqual({ a: 3, b: 1 })
  })

  it('accepts an ISO datetime for timerEndsAt', () => {
    expect(CurrentQuestionSchema.parse(base({ timerEndsAt: new Date().toISOString() }))).toBeTruthy()
  })

  it('rejects a non-datetime timerEndsAt', () => {
    expect(CurrentQuestionSchema.safeParse(base({ timerEndsAt: 'soon' })).success).toBe(false)
  })
})

describe('FinalPodiumEntrySchema', () => {
  it('accepts ranks 1 through 3', () => {
    for (const rank of [1, 2, 3]) {
      expect(
        FinalPodiumEntrySchema.parse({ rank, participantId: randomUUID(), displayName: 'P', score: 5 }),
      ).toBeTruthy()
    }
  })

  it('rejects rank 0 and rank 4', () => {
    for (const rank of [0, 4]) {
      expect(
        FinalPodiumEntrySchema.safeParse({
          rank,
          participantId: randomUUID(),
          displayName: 'P',
          score: 5,
        }).success,
      ).toBe(false)
    }
  })
})

describe('LeaderboardEntrySchema and PlayerSummarySchema', () => {
  it('LeaderboardEntrySchema requires integer score and rank', () => {
    expect(
      LeaderboardEntrySchema.safeParse({
        participantId: randomUUID(),
        displayName: 'P',
        score: 1.5,
        rank: 1,
      }).success,
    ).toBe(false)
  })

  it('PlayerSummarySchema accepts a minimal player', () => {
    expect(
      PlayerSummarySchema.parse({ participantId: randomUUID(), displayName: 'P', score: 0 }),
    ).toBeTruthy()
  })
})

describe('RoomStateDtoSchema', () => {
  function baseDto(extra: Record<string, unknown> = {}) {
    return {
      roomCode: 'WXYZ',
      phase: 'lobby',
      packTitle: 'Pack',
      gameTitle: 'Game',
      totalQuestions: 3,
      currentQuestionIndex: null,
      lateJoinPolicy: 'open',
      phoneTextMode: 'heads_up',
      players: [],
      leaderboard: [],
      currentQuestion: null,
      finalPodium: null,
      ...extra,
    }
  }

  it('accepts a valid lobby DTO', () => {
    expect(RoomStateDtoSchema.parse(baseDto()).phase).toBe('lobby')
  })

  it('rejects an unknown lateJoinPolicy', () => {
    expect(RoomStateDtoSchema.safeParse(baseDto({ lateJoinPolicy: 'maybe' })).success).toBe(false)
  })

  it('rejects an unknown phoneTextMode', () => {
    expect(RoomStateDtoSchema.safeParse(baseDto({ phoneTextMode: 'silent' })).success).toBe(false)
  })
})

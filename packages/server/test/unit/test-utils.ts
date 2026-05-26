import { vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import type { LoadedQuestion, GameConfig } from '../../src/rooms/room-state'

// A loosely-typed Prisma double: every model method is a vi.fn() so tests can
// stub return values per call. Cast to PrismaService when injecting.
export function makePrismaMock() {
  const model = () => ({
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  })
  return {
    pack: model(),
    game: model(),
    question: model(),
    room: model(),
    roomParticipant: model(),
    user: model(),
    refreshToken: model(),
    gameResult: model(),
  }
}

export type PrismaMock = ReturnType<typeof makePrismaMock>

let qSeq = 0

// Builds a LoadedQuestion with 4 choices; choice index `correctIndex` is correct.
export function makeQuestion(correctIndex = 0, timerSeconds = 30): LoadedQuestion {
  const choices = [0, 1, 2, 3].map(() => ({ id: randomUUID(), text: `choice` }))
  return {
    id: randomUUID(),
    prompt: `Question ${qSeq++}`,
    imageUrl: null,
    data: {
      type: 'multiple_choice',
      choices,
      correctChoiceId: choices[correctIndex].id,
    },
    defaultTimerSeconds: timerSeconds,
    position: 0,
  }
}

export function makeGameConfig(questions: LoadedQuestion[], extra: Partial<GameConfig> = {}): GameConfig {
  return {
    gameId: randomUUID(),
    gameTitle: 'Test Game',
    lateJoinPolicy: 'open',
    phoneTextMode: 'heads_up',
    questions,
    ...extra,
  }
}

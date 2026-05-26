import { describe, it, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import { SubmitAnswerRequestSchema, AnswerResultSchema } from '../src/schemas/answers'

describe('SubmitAnswerRequestSchema', () => {
  it('accepts uuid questionId and choiceId', () => {
    const body = { questionId: randomUUID(), choiceId: randomUUID() }
    expect(SubmitAnswerRequestSchema.parse(body)).toEqual(body)
  })

  it('rejects a non-uuid questionId', () => {
    expect(
      SubmitAnswerRequestSchema.safeParse({ questionId: 'q1', choiceId: randomUUID() }).success,
    ).toBe(false)
  })

  it('rejects a missing choiceId', () => {
    expect(SubmitAnswerRequestSchema.safeParse({ questionId: randomUUID() }).success).toBe(false)
  })
})

describe('AnswerResultSchema', () => {
  it('accepts a fully-formed result', () => {
    const result = {
      questionId: randomUUID(),
      choiceId: randomUUID(),
      isCorrect: true,
      pointsAwarded: 1,
      responseTimeMs: 4200,
    }
    expect(AnswerResultSchema.parse(result)).toEqual(result)
  })

  it('rejects a non-integer pointsAwarded', () => {
    expect(
      AnswerResultSchema.safeParse({
        questionId: randomUUID(),
        choiceId: randomUUID(),
        isCorrect: false,
        pointsAwarded: 0.5,
        responseTimeMs: 100,
      }).success,
    ).toBe(false)
  })

  it('rejects a non-integer responseTimeMs', () => {
    expect(
      AnswerResultSchema.safeParse({
        questionId: randomUUID(),
        choiceId: randomUUID(),
        isCorrect: false,
        pointsAwarded: 0,
        responseTimeMs: 12.5,
      }).success,
    ).toBe(false)
  })
})

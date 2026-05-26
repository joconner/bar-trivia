import { describe, it, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import {
  ChoiceSchema,
  MultipleChoiceDataSchema,
  QuestionSchema,
  GameSchema,
  PackSchema,
} from '../src/schemas/packs'

function makeChoices() {
  return [
    { id: randomUUID(), text: 'A' },
    { id: randomUUID(), text: 'B' },
    { id: randomUUID(), text: 'C' },
    { id: randomUUID(), text: 'D' },
  ]
}

describe('ChoiceSchema', () => {
  it('accepts a uuid id and 1-300 char text', () => {
    expect(ChoiceSchema.parse({ id: randomUUID(), text: 'Paris' })).toBeTruthy()
  })

  it('rejects empty text', () => {
    expect(ChoiceSchema.safeParse({ id: randomUUID(), text: '' }).success).toBe(false)
  })

  it('rejects text longer than 300 chars', () => {
    expect(ChoiceSchema.safeParse({ id: randomUUID(), text: 'x'.repeat(301) }).success).toBe(false)
  })

  it('rejects a non-uuid id', () => {
    expect(ChoiceSchema.safeParse({ id: 'not-a-uuid', text: 'ok' }).success).toBe(false)
  })
})

describe('MultipleChoiceDataSchema', () => {
  it('accepts exactly 4 choices with a correctChoiceId that matches one', () => {
    const choices = makeChoices()
    const data = { type: 'multiple_choice', choices, correctChoiceId: choices[2].id }
    expect(MultipleChoiceDataSchema.parse(data).correctChoiceId).toBe(choices[2].id)
  })

  it('rejects when there are not exactly 4 choices', () => {
    const choices = makeChoices().slice(0, 3)
    const data = { type: 'multiple_choice', choices, correctChoiceId: choices[0].id }
    expect(MultipleChoiceDataSchema.safeParse(data).success).toBe(false)
  })

  it('rejects when correctChoiceId does not reference a provided choice', () => {
    const choices = makeChoices()
    const data = { type: 'multiple_choice', choices, correctChoiceId: randomUUID() }
    const result = MultipleChoiceDataSchema.safeParse(data)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('correctChoiceId')
    }
  })

  it('rejects a wrong literal type', () => {
    const choices = makeChoices()
    const data = { type: 'true_false', choices, correctChoiceId: choices[0].id }
    expect(MultipleChoiceDataSchema.safeParse(data).success).toBe(false)
  })
})

describe('QuestionSchema', () => {
  function baseQuestion(extra: Record<string, unknown> = {}) {
    const choices = makeChoices()
    return {
      id: randomUUID(),
      type: 'multiple_choice',
      prompt: 'Capital of France?',
      imageUrl: null,
      data: { type: 'multiple_choice', choices, correctChoiceId: choices[0].id },
      position: 0,
      ...extra,
    }
  }

  it('defaults defaultTimerSeconds to 30 when omitted', () => {
    expect(QuestionSchema.parse(baseQuestion()).defaultTimerSeconds).toBe(30)
  })

  it('rejects a timer below the 5s minimum', () => {
    expect(QuestionSchema.safeParse(baseQuestion({ defaultTimerSeconds: 4 })).success).toBe(false)
  })

  it('rejects a timer above the 120s maximum', () => {
    expect(QuestionSchema.safeParse(baseQuestion({ defaultTimerSeconds: 121 })).success).toBe(false)
  })

  it('accepts a valid http imageUrl', () => {
    expect(QuestionSchema.parse(baseQuestion({ imageUrl: 'https://x.test/a.png' })).imageUrl).toBe(
      'https://x.test/a.png',
    )
  })

  it('rejects a non-url imageUrl', () => {
    expect(QuestionSchema.safeParse(baseQuestion({ imageUrl: 'not a url' })).success).toBe(false)
  })

  it('rejects an empty prompt', () => {
    expect(QuestionSchema.safeParse(baseQuestion({ prompt: '' })).success).toBe(false)
  })

  it('rejects a negative position', () => {
    expect(QuestionSchema.safeParse(baseQuestion({ position: -1 })).success).toBe(false)
  })
})

describe('GameSchema', () => {
  function baseGame(extra: Record<string, unknown> = {}) {
    return {
      id: randomUUID(),
      title: 'Round 1',
      questions: [],
      tiebreakerMethod: 'response_time',
      ...extra,
    }
  }

  it('applies defaults for lateJoinDefault and phoneTextMode', () => {
    const game = GameSchema.parse(baseGame())
    expect(game.lateJoinDefault).toBe('open')
    expect(game.phoneTextMode).toBe('heads_up')
  })

  it('rejects an unknown tiebreakerMethod', () => {
    expect(GameSchema.safeParse(baseGame({ tiebreakerMethod: 'coin_flip' })).success).toBe(false)
  })

  it('rejects an empty title', () => {
    expect(GameSchema.safeParse(baseGame({ title: '' })).success).toBe(false)
  })
})

describe('PackSchema', () => {
  it('accepts a pack with a uuid owner and games array', () => {
    const pack = {
      id: randomUUID(),
      title: 'Trivia Night',
      ownerId: randomUUID(),
      games: [],
    }
    expect(PackSchema.parse(pack).title).toBe('Trivia Night')
  })

  it('rejects a non-uuid ownerId', () => {
    const pack = { id: randomUUID(), title: 'T', ownerId: 'nope', games: [] }
    expect(PackSchema.safeParse(pack).success).toBe(false)
  })
})

// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, act, cleanup } from '@testing-library/react'
import type { RoomStateDto } from '@bar-trivia/shared'
import { QuestionView } from '../../src/views/QuestionView'
import { RevealView } from '../../src/views/RevealView'
import { FinalView } from '../../src/views/FinalView'

// TimerRing uses requestAnimationFrame inside; silence it for tests.
vi.mock('../../src/components/TimerRing', () => ({
  TimerRing: () => null,
}))

afterEach(cleanup)

const PLAYERS = [
  { participantId: 'p-1', displayName: 'Alice', score: 200 },
  { participantId: 'p-2', displayName: 'Bob', score: 150 },
]

const LEADERBOARD = [
  { participantId: 'p-1', displayName: 'Alice', score: 200, rank: 1 },
  { participantId: 'p-2', displayName: 'Bob', score: 150, rank: 2 },
]

const BASE_STATE: RoomStateDto = {
  roomCode: 'MURP',
  phase: 'question',
  packTitle: 'Bar Trivia Night',
  gameTitle: 'Friday Quiz',
  totalQuestions: 10,
  currentQuestionIndex: 2,
  lateJoinPolicy: 'open',
  phoneTextMode: 'heads_up',
  players: PLAYERS,
  leaderboard: LEADERBOARD,
  currentQuestion: null,
  finalPodium: null,
}

const QUESTION = {
  questionId: 'q-1',
  prompt: 'What is the capital of France?',
  imageUrl: null,
  choices: [
    { id: 'c-1', text: 'Paris' },
    { id: 'c-2', text: 'London' },
    { id: 'c-3', text: 'Berlin' },
    { id: 'c-4', text: 'Madrid' },
  ],
  timerEndsAt: null,
  isPaused: false,
  pausedRemainingMs: null,
}

describe('QuestionView', () => {
  it('renders the question prompt', () => {
    render(<QuestionView state={{ ...BASE_STATE, currentQuestion: QUESTION }} />)
    expect(screen.getByText('What is the capital of France?')).toBeTruthy()
  })

  it('renders all four answer choices', () => {
    const { container } = render(<QuestionView state={{ ...BASE_STATE, currentQuestion: QUESTION }} />)
    const choiceTexts = container.querySelectorAll('.choice-text')
    const texts = Array.from(choiceTexts).map((el) => el.textContent)
    expect(texts).toContain('Paris')
    expect(texts).toContain('London')
    expect(texts).toContain('Berlin')
    expect(texts).toContain('Madrid')
  })

  it('renders choice labels A B C D', () => {
    const { container } = render(<QuestionView state={{ ...BASE_STATE, currentQuestion: QUESTION }} />)
    const labels = container.querySelectorAll('.choice-label')
    const labelTexts = Array.from(labels).map((el) => el.textContent)
    expect(labelTexts).toEqual(['A', 'B', 'C', 'D'])
  })

  it('renders the question counter', () => {
    const { container } = render(<QuestionView state={{ ...BASE_STATE, currentQuestion: QUESTION }} />)
    // currentQuestionIndex=2, totalQuestions=10 → "3 / 10"
    const counter = container.querySelector('.question-counter')
    expect(counter?.textContent?.replace(/\s+/g, ' ').trim()).toBe('3 / 10')
  })

  it('renders pack title', () => {
    render(<QuestionView state={{ ...BASE_STATE, currentQuestion: QUESTION }} />)
    expect(screen.getAllByText('Bar Trivia Night').length).toBeGreaterThan(0)
  })

  it('renders top-5 leaderboard in the sidebar', () => {
    const { container } = render(<QuestionView state={{ ...BASE_STATE, currentQuestion: QUESTION }} />)
    const lb = container.querySelector('.mini-leaderboard')
    expect(lb?.textContent).toContain('Alice')
    expect(lb?.textContent).toContain('Bob')
  })

  it('renders an image when imageUrl is present', () => {
    const q = { ...QUESTION, imageUrl: 'https://example.com/q.jpg' }
    const { container } = render(<QuestionView state={{ ...BASE_STATE, currentQuestion: q }} />)
    const img = container.querySelector('img') as HTMLImageElement
    expect(img).toBeTruthy()
    expect(img.src).toBe('https://example.com/q.jpg')
  })
})

describe('RevealView', () => {
  const REVEAL_QUESTION = {
    ...QUESTION,
    correctChoiceId: 'c-1',
    answerBreakdown: { 'c-1': 3, 'c-2': 1, 'c-3': 0, 'c-4': 0 },
  }

  it('renders the correct answer badge', () => {
    render(<RevealView state={{ ...BASE_STATE, phase: 'reveal', currentQuestion: REVEAL_QUESTION }} />)
    expect(screen.getByText('CORRECT')).toBeTruthy()
  })

  it('renders all answer choices', () => {
    const { container } = render(<RevealView state={{ ...BASE_STATE, phase: 'reveal', currentQuestion: REVEAL_QUESTION }} />)
    const choiceTexts = container.querySelectorAll('.choice-text')
    const texts = Array.from(choiceTexts).map((el) => el.textContent)
    expect(texts).toContain('Paris')
    expect(texts).toContain('London')
  })

  it('calculates and renders answer percentages', () => {
    // 3/(3+1+0+0)=75%, 1/4=25%
    const { container } = render(<RevealView state={{ ...BASE_STATE, phase: 'reveal', currentQuestion: REVEAL_QUESTION }} />)
    const pcts = Array.from(container.querySelectorAll('.answer-bar-pct')).map((el) => el.textContent)
    expect(pcts).toContain('75%')
    expect(pcts).toContain('25%')
  })

  it('shows 0% when no answers recorded for a choice', () => {
    const { container } = render(<RevealView state={{ ...BASE_STATE, phase: 'reveal', currentQuestion: REVEAL_QUESTION }} />)
    const pcts = Array.from(container.querySelectorAll('.answer-bar-pct')).map((el) => el.textContent)
    const zeros = pcts.filter((p) => p === '0%')
    expect(zeros.length).toBeGreaterThanOrEqual(2)
  })

  it('renders leaderboard entries', () => {
    const { container } = render(<RevealView state={{ ...BASE_STATE, phase: 'reveal', currentQuestion: REVEAL_QUESTION }} />)
    const lb = container.querySelector('.reveal-leaderboard')
    expect(lb?.textContent).toContain('Alice')
    expect(lb?.textContent).toContain('Bob')
  })
})

describe('FinalView', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const PODIUM = [
    { rank: 1, participantId: 'p-1', displayName: 'Alice', score: 200 },
    { rank: 2, participantId: 'p-2', displayName: 'Bob', score: 150 },
    { rank: 3, participantId: 'p-3', displayName: 'Carol', score: 120 },
  ]

  const FINAL_STATE: RoomStateDto = {
    ...BASE_STATE,
    phase: 'final',
    leaderboard: [
      ...LEADERBOARD,
      { participantId: 'p-3', displayName: 'Carol', score: 120, rank: 3 },
    ],
    finalPodium: PODIUM,
  }

  it('renders "Final Results" heading', () => {
    render(<FinalView state={FINAL_STATE} />)
    expect(screen.getByText('Final Results')).toBeTruthy()
  })

  it('renders pack title', () => {
    render(<FinalView state={FINAL_STATE} />)
    expect(screen.getAllByText('Bar Trivia Night').length).toBeGreaterThan(0)
  })

  it('reveals 3rd place player in the podium after 1 second', async () => {
    const { container } = render(<FinalView state={FINAL_STATE} />)
    await act(async () => { vi.advanceTimersByTime(1500) })
    const slot3 = container.querySelector('.rank-3')
    expect(slot3?.textContent).toContain('Carol')
  })

  it('reveals 2nd place player in the podium after 3 seconds', async () => {
    const { container } = render(<FinalView state={FINAL_STATE} />)
    await act(async () => { vi.advanceTimersByTime(3500) })
    const slot2 = container.querySelector('.rank-2')
    expect(slot2?.textContent).toContain('Bob')
  })

  it('reveals 1st place player in the podium after 5 seconds', async () => {
    const { container } = render(<FinalView state={FINAL_STATE} />)
    await act(async () => { vi.advanceTimersByTime(5500) })
    const slot1 = container.querySelector('.rank-1')
    expect(slot1?.textContent).toContain('Alice')
  })

  it('renders the full leaderboard regardless of reveal timing', () => {
    const { container } = render(<FinalView state={FINAL_STATE} />)
    const lb = container.querySelector('.final-leaderboard')
    expect(lb?.textContent).toContain('Alice')
    expect(lb?.textContent).toContain('Bob')
    expect(lb?.textContent).toContain('Carol')
  })
})

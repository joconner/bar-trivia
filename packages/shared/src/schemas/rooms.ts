import { z } from 'zod'

export const GamePhaseSchema = z.enum(['lobby', 'question', 'reveal', 'final'])
export type GamePhase = z.infer<typeof GamePhaseSchema>

export const LeaderboardEntrySchema = z.object({
  participantId: z.string().uuid(),
  displayName: z.string(),
  score: z.number().int(),
  rank: z.number().int(),
})
export type LeaderboardEntry = z.infer<typeof LeaderboardEntrySchema>

export const PlayerSummarySchema = z.object({
  participantId: z.string().uuid(),
  displayName: z.string(),
  score: z.number().int(),
})
export type PlayerSummary = z.infer<typeof PlayerSummarySchema>

export const CurrentQuestionSchema = z.object({
  questionId: z.string().uuid(),
  prompt: z.string(),
  imageUrl: z.string().nullable(),
  choices: z.array(z.object({ id: z.string(), text: z.string() })),
  // correctChoiceId absent during 'question' phase; present only in 'reveal'
  correctChoiceId: z.string().optional(),
  timerEndsAt: z.string().datetime().nullable(),
  isPaused: z.boolean(),
  pausedRemainingMs: z.number().nullable(),
  // answerBreakdown present only in 'reveal': choiceId -> count
  answerBreakdown: z.record(z.string(), z.number()).optional(),
})
export type CurrentQuestion = z.infer<typeof CurrentQuestionSchema>

export const FinalPodiumEntrySchema = z.object({
  rank: z.number().int().min(1).max(3),
  participantId: z.string().uuid(),
  displayName: z.string(),
  score: z.number().int(),
})
export type FinalPodiumEntry = z.infer<typeof FinalPodiumEntrySchema>

export const RoomStateDtoSchema = z.object({
  roomCode: z.string(),
  phase: GamePhaseSchema,
  packTitle: z.string(),
  gameTitle: z.string(),
  venueName: z.string().optional(),
  totalQuestions: z.number().int(),
  currentQuestionIndex: z.number().int().nullable(),
  lateJoinPolicy: z.enum(['open', 'locked']),
  phoneTextMode: z.enum(['heads_up', 'full']),
  players: z.array(PlayerSummarySchema),
  leaderboard: z.array(LeaderboardEntrySchema),
  currentQuestion: CurrentQuestionSchema.nullable(),
  finalPodium: z.array(FinalPodiumEntrySchema).nullable(),
})
export type RoomStateDto = z.infer<typeof RoomStateDtoSchema>

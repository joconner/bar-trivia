import { z } from 'zod'

export const SubmitAnswerRequestSchema = z.object({
  questionId: z.string().uuid(),
  choiceId: z.string().uuid(),
})
export type SubmitAnswerRequest = z.infer<typeof SubmitAnswerRequestSchema>

export const AnswerResultSchema = z.object({
  questionId: z.string().uuid(),
  choiceId: z.string().uuid(),
  isCorrect: z.boolean(),
  pointsAwarded: z.number().int(),
  responseTimeMs: z.number().int(),
})
export type AnswerResult = z.infer<typeof AnswerResultSchema>

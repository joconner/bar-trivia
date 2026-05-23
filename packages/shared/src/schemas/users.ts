import { z } from 'zod'
import { UserRoleSchema } from './auth'

export const UserSchema = z.object({
  id: z.string().uuid(),
  role: UserRoleSchema,
  displayName: z.string().min(1).max(50),
  email: z.string().email().nullable(),
  createdAt: z.string().datetime(),
  lastSeenAt: z.string().datetime(),
})
export type User = z.infer<typeof UserSchema>

export const GuestJoinRequestSchema = z.object({
  displayName: z.string().min(1).max(50),
  roomCode: z.string(),
})
export type GuestJoinRequest = z.infer<typeof GuestJoinRequestSchema>

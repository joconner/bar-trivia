import { z } from 'zod'

export const UserRoleSchema = z.enum(['guest', 'player', 'host', 'admin'])
export type UserRole = z.infer<typeof UserRoleSchema>

export const AccessTokenPayloadSchema = z.object({
  sub: z.string().uuid(),
  role: UserRoleSchema,
  displayName: z.string(),
  roomCode: z.string().optional(),
  roomParticipantId: z.string().uuid().optional(),
})
export type AccessTokenPayload = z.infer<typeof AccessTokenPayloadSchema>

export const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
})
export type LoginRequest = z.infer<typeof LoginRequestSchema>

export const RegisterHostRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  displayName: z.string().min(1).max(50),
})
export type RegisterHostRequest = z.infer<typeof RegisterHostRequestSchema>

export const RefreshRequestSchema = z.object({
  refreshToken: z.string(),
})
export type RefreshRequest = z.infer<typeof RefreshRequestSchema>

export const TokenResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
})
export type TokenResponse = z.infer<typeof TokenResponseSchema>

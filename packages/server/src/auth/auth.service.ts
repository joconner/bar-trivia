import {
  Injectable,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { UsersService } from '../users/users.service'
import { hash, verify } from '@node-rs/argon2'
import * as jwt from 'jsonwebtoken'
import * as crypto from 'crypto'
import { RegisterHostRequest, LoginRequest, AccessTokenPayload } from '@bar-trivia/shared'

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60        // 15 minutes
const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 3600 // 7 days
// A token rotated within this window is treated as a benign concurrent refresh
// (e.g. the socket and a REST call both refreshing on the same expiry) rather
// than as token theft, so a harmless race never revokes a live session.
const REFRESH_REUSE_GRACE_MS = 30 * 1000

function jwtSecret(): string {
  const s = process.env.JWT_SECRET
  if (!s) throw new Error('JWT_SECRET not set')
  return s
}

function hashRawToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex')
}

function generateRawRefreshToken(): string {
  return crypto.randomBytes(48).toString('base64url')
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
  ) {}

  async register(body: RegisterHostRequest) {
    const existing = await this.prisma.user.findUnique({ where: { email: body.email } })
    if (existing) throw new ConflictException('Email already registered')

    const passwordHash = await hash(body.password)
    const trialDays = Number(process.env['STRIPE_TRIAL_DAYS'] ?? 14)
    const trialEndsAt = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000)
    const user = await this.prisma.user.create({
      data: {
        role: 'host',
        email: body.email,
        displayName: body.displayName,
        passwordHash,
        subscriptionStatus: 'trial',
        trialEndsAt,
      },
    })

    const { accessToken, rawRefreshToken } = await this.issueTokenPair(user.id, 'host', user.displayName)
    return { accessToken, refreshToken: rawRefreshToken }
  }

  async login(body: LoginRequest) {
    const user = await this.prisma.user.findUnique({ where: { email: body.email } })
    if (!user || !user.passwordHash) throw new UnauthorizedException('Invalid credentials')

    const valid = await verify(user.passwordHash, body.password)
    if (!valid) throw new UnauthorizedException('Invalid credentials')

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastSeenAt: new Date() },
    })

    const { accessToken, rawRefreshToken } = await this.issueTokenPair(user.id, user.role, user.displayName)
    return { accessToken, refreshToken: rawRefreshToken }
  }

  async refresh(rawToken: string) {
    const tokenHash = hashRawToken(rawToken)
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } })

    if (!stored) throw new UnauthorizedException('Invalid refresh token')

    // Already rotated. Distinguish genuine reuse of an old token (possible theft —
    // revoke the whole chain) from a benign race where another in-flight refresh
    // for the same user rotated it moments ago (reject, but leave the new session
    // intact). Without the grace window, a harmless double-refresh could revoke a
    // session that was just legitimately issued.
    if (stored.rotatedToId) {
      const rotatedAt = stored.lastUsedAt?.getTime() ?? 0
      if (Date.now() - rotatedAt > REFRESH_REUSE_GRACE_MS) {
        await this.revokeChain(stored.id)
        throw new UnauthorizedException('Refresh token already used')
      }
      throw new UnauthorizedException('Refresh already in progress')
    }

    if (stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expired or revoked')
    }

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: stored.userId },
      include: {
        participants: {
          where: { isActive: true },
          orderBy: { lastSeenAt: 'desc' },
          take: 1,
        },
      },
    })

    // For guest users, re-embed their latest active room participant so the
    // client can reconnect to an in-progress game after a page reload.
    const latestParticipant = user.participants[0]
    const roomExtra =
      user.role === 'guest' && latestParticipant
        ? { roomCode: latestParticipant.roomCode, roomParticipantId: latestParticipant.id }
        : {}

    // Issue new pair and link old row → new row via rotatedToId
    const { accessToken, rawRefreshToken, newTokenId } = await this.issueTokenPair(
      user.id,
      user.role,
      user.displayName,
      roomExtra,
    )

    // Atomically claim the rotation: the conditional `rotatedToId: null` guard
    // means only the first of any concurrent refreshes wins. The loser discards
    // the token it just minted and bows out without touching the live session.
    const claim = await this.prisma.refreshToken.updateMany({
      where: { id: stored.id, rotatedToId: null },
      data: { rotatedToId: newTokenId, lastUsedAt: new Date() },
    })

    if (claim.count === 0) {
      await this.prisma.refreshToken.delete({ where: { id: newTokenId } }).catch(() => undefined)
      throw new UnauthorizedException('Refresh already in progress')
    }

    return { accessToken, refreshToken: rawRefreshToken }
  }

  async logout(rawToken: string) {
    const tokenHash = hashRawToken(rawToken)
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } })
    if (!stored) return // already gone, no-op

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    })
  }

  async issueRoomTokenPair(
    userId: string,
    displayName: string,
    roomCode: string,
    roomParticipantId: string,
  ) {
    const { accessToken, rawRefreshToken } = await this.issueTokenPair(userId, 'guest', displayName, {
      roomCode,
      roomParticipantId,
    })
    return { accessToken, refreshToken: rawRefreshToken }
  }

  issueRoomAccessToken(
    userId: string,
    displayName: string,
    roomCode: string,
    roomParticipantId: string,
  ): string {
    const payload: AccessTokenPayload = { sub: userId, role: 'guest', displayName, roomCode, roomParticipantId }
    return jwt.sign(payload, jwtSecret(), { expiresIn: ACCESS_TOKEN_TTL_SECONDS })
  }

  private async issueTokenPair(
    userId: string,
    role: string,
    displayName: string,
    extra: { roomCode?: string; roomParticipantId?: string } = {},
  ) {
    const payload: AccessTokenPayload = {
      sub: userId,
      role: role as AccessTokenPayload['role'],
      displayName,
      ...extra,
    }
    const accessToken = jwt.sign(payload, jwtSecret(), { expiresIn: ACCESS_TOKEN_TTL_SECONDS })

    const rawRefreshToken = generateRawRefreshToken()
    const tokenHash = hashRawToken(rawRefreshToken)
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000)

    const created = await this.prisma.refreshToken.create({
      data: { userId, tokenHash, expiresAt },
    })

    return { accessToken, rawRefreshToken, newTokenId: created.id }
  }

  private async revokeChain(startId: string) {
    const now = new Date()
    let currentId: string | null = startId
    while (currentId) {
      const row: { id: string; rotatedToId: string | null } | null =
        await this.prisma.refreshToken.findUnique({
          where: { id: currentId },
          select: { id: true, rotatedToId: true },
        })
      if (!row) break
      await this.prisma.refreshToken.update({ where: { id: currentId }, data: { revokedAt: now } })
      currentId = row.rotatedToId
    }
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    try {
      return jwt.verify(token, jwtSecret()) as AccessTokenPayload
    } catch {
      throw new UnauthorizedException('Invalid or expired token')
    }
  }
}

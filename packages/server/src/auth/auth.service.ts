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
    const user = await this.prisma.user.create({
      data: {
        role: 'host',
        email: body.email,
        displayName: body.displayName,
        passwordHash,
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

    // Token reuse detection: if already rotated, revoke the whole chain and reject
    if (stored.rotatedToId) {
      await this.revokeChain(stored.id)
      throw new UnauthorizedException('Refresh token already used')
    }

    if (stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expired or revoked')
    }

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: stored.userId } })

    // Issue new pair and link old row → new row via rotatedToId
    const { accessToken, rawRefreshToken, newTokenId } = await this.issueTokenPair(
      user.id,
      user.role,
      user.displayName,
    )

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { rotatedToId: newTokenId, lastUsedAt: new Date() },
    })

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

  private async issueTokenPair(userId: string, role: string, displayName: string) {
    const payload: AccessTokenPayload = { sub: userId, role: role as AccessTokenPayload['role'], displayName }
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

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  HttpException,
  HttpStatus,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Request } from 'express'
import { AccessTokenPayload } from '@bar-trivia/shared'
import { PrismaService } from '../prisma/prisma.service'
import { REQUIRES_SUBSCRIPTION_KEY } from './requires-subscription.decorator'

@Injectable()
export class SubscriptionActiveGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<boolean>(REQUIRES_SUBSCRIPTION_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ])
    if (!required) return true

    const req = ctx.switchToHttp().getRequest<Request & { user?: AccessTokenPayload }>()
    const user = req.user
    if (!user) return false

    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.sub },
      select: { subscriptionStatus: true, trialEndsAt: true },
    })
    if (!dbUser) return false

    const { subscriptionStatus, trialEndsAt } = dbUser

    if (subscriptionStatus === 'active' || subscriptionStatus === 'trialing') return true

    if (subscriptionStatus === 'trial') {
      if (!trialEndsAt || trialEndsAt > new Date()) return true
      // Trial has expired — update status and block
      await this.prisma.user.update({
        where: { id: user.sub },
        data: { subscriptionStatus: 'trial_expired' },
      })
    }

    throw new HttpException(
      {
        statusCode: HttpStatus.PAYMENT_REQUIRED,
        error: 'SubscriptionRequired',
        message: 'An active subscription is required. Visit /subscriptions/checkout to subscribe.',
        subscriptionStatus,
      },
      HttpStatus.PAYMENT_REQUIRED,
    )
  }
}

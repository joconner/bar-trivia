import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Request } from 'express'
import { AccessTokenPayload } from '@bar-trivia/shared'
import { ROLES_KEY } from './roles.decorator'

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ])
    if (!required || required.length === 0) return true

    const req = ctx.switchToHttp().getRequest<Request & { user?: AccessTokenPayload }>()
    const user = req.user
    if (!user) throw new ForbiddenException('No authenticated user')

    if (!required.includes(user.role)) {
      throw new ForbiddenException(`Requires one of roles: ${required.join(', ')}`)
    }
    return true
  }
}

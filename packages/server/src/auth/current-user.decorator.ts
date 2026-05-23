import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import { Request } from 'express'
import { AccessTokenPayload } from '@bar-trivia/shared'

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AccessTokenPayload => {
    const req = ctx.switchToHttp().getRequest<Request & { user: AccessTokenPayload }>()
    return req.user
  },
)

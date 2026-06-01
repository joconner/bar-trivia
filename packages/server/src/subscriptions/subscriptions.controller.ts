import {
  Controller,
  Get,
  Post,
  Body,
  Headers,
  Req,
  RawBodyRequest,
  HttpCode,
} from '@nestjs/common'
import { Request } from 'express'
import { z } from 'zod'
import { createZodDto } from 'nestjs-zod'
import { SubscriptionsService } from './subscriptions.service'
import { Public } from '../auth/public.decorator'
import { Roles } from '../auth/roles.decorator'
import { CurrentUser } from '../auth/current-user.decorator'
import { AccessTokenPayload } from '@bar-trivia/shared'

const CheckoutSchema = z.object({
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
})
class CheckoutDto extends createZodDto(CheckoutSchema) {}

const PortalSchema = z.object({
  returnUrl: z.string().url(),
})
class PortalDto extends createZodDto(PortalSchema) {}

@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subs: SubscriptionsService) {}

  @Get('status')
  @Roles('host')
  getStatus(@CurrentUser() user: AccessTokenPayload) {
    return this.subs.getStatus(user.sub)
  }

  @Post('checkout')
  @Roles('host')
  async checkout(@Body() body: CheckoutDto, @CurrentUser() user: AccessTokenPayload) {
    const url = await this.subs.createCheckoutSession(user.sub, body.successUrl, body.cancelUrl)
    return { url }
  }

  @Post('portal')
  @Roles('host')
  async portal(@Body() body: PortalDto, @CurrentUser() user: AccessTokenPayload) {
    const url = await this.subs.createPortalSession(user.sub, body.returnUrl)
    return { url }
  }

  @Post('webhook')
  @Public()
  @HttpCode(200)
  async webhook(
    @Headers('stripe-signature') signature: string,
    @Req() req: RawBodyRequest<Request>,
  ) {
    const rawBody = req.rawBody ?? Buffer.from('')
    await this.subs.handleWebhook(rawBody, signature)
    return { received: true }
  }
}

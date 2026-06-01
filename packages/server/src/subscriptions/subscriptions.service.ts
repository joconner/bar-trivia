/* eslint-disable @typescript-eslint/no-require-imports */
import { Injectable, ServiceUnavailableException, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

// Use require so the CJS entry resolves correctly under moduleResolution:"node"
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const StripeLib: any = require('stripe')

const ACTIVE_STATUSES = new Set(['active', 'trialing', 'trial'])

@Injectable()
export class SubscriptionsService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private stripe: any = null

  constructor(private readonly prisma: PrismaService) {
    const key = process.env['STRIPE_SECRET_KEY']
    if (key) {
      this.stripe = new StripeLib(key)
    }
  }

  isSubscriptionActive(status: string): boolean {
    return ACTIVE_STATUSES.has(status)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private requireStripe(): any {
    if (!this.stripe) throw new ServiceUnavailableException('Billing not configured')
    return this.stripe
  }

  async createCheckoutSession(userId: string, successUrl: string, cancelUrl: string): Promise<string> {
    const stripe = this.requireStripe()
    const priceId = process.env['STRIPE_MONTHLY_PRICE_ID']
    if (!priceId) throw new ServiceUnavailableException('Billing price not configured')

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sessionParams: Record<string, any> = {
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { userId },
      subscription_data: {
        trial_period_days: Number(process.env['STRIPE_TRIAL_DAYS'] ?? 14),
        metadata: { userId },
      },
    }

    if (user.stripeCustomerId) {
      sessionParams['customer'] = user.stripeCustomerId
    } else if (user.email) {
      sessionParams['customer_email'] = user.email
    }

    const session = await stripe.checkout.sessions.create(sessionParams)
    return (session.url as string) ?? ''
  }

  async createPortalSession(userId: string, returnUrl: string): Promise<string> {
    const stripe = this.requireStripe()
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } })
    if (!user.stripeCustomerId) throw new BadRequestException('No active subscription to manage')

    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: returnUrl,
    })
    return session.url as string
  }

  async getStatus(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { subscriptionStatus: true, trialEndsAt: true },
    })
    return {
      status: user.subscriptionStatus,
      trialEndsAt: user.trialEndsAt,
      isActive: this.isSubscriptionActive(user.subscriptionStatus),
    }
  }

  async handleWebhook(rawBody: Buffer, signature: string): Promise<void> {
    const stripe = this.requireStripe()
    const secret = process.env['STRIPE_WEBHOOK_SECRET']
    if (!secret) throw new ServiceUnavailableException('Webhook secret not configured')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let event: any
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, secret)
    } catch {
      throw new BadRequestException('Invalid webhook signature')
    }

    await this.processWebhookEvent(event)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async processWebhookEvent(event: any): Promise<void> {
    switch (event.type as string) {
      case 'checkout.session.completed': {
        const session = event.data.object
        const userId = session.metadata?.userId as string | undefined
        if (!userId || !session.customer) break
        await this.prisma.user.update({
          where: { id: userId },
          data: { stripeCustomerId: session.customer as string },
        })
        break
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object
        const userId = sub.metadata?.userId as string | undefined
        if (!userId) break
        await this.prisma.user.update({
          where: { id: userId },
          data: {
            subscriptionStatus: sub.status as string,
            trialEndsAt: sub.trial_end ? new Date((sub.trial_end as number) * 1000) : null,
          },
        })
        break
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object
        const userId = sub.metadata?.userId as string | undefined
        if (!userId) break
        await this.prisma.user.update({
          where: { id: userId },
          data: { subscriptionStatus: 'cancelled' },
        })
        break
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object
        const customerId = invoice.customer as string | undefined
        if (!customerId) break
        await this.prisma.user.updateMany({
          where: { stripeCustomerId: customerId },
          data: { subscriptionStatus: 'past_due' },
        })
        break
      }
    }
  }
}

import { SetMetadata } from '@nestjs/common'

export const REQUIRES_SUBSCRIPTION_KEY = 'requiresSubscription'
export const RequiresSubscription = () => SetMetadata(REQUIRES_SUBSCRIPTION_KEY, true)

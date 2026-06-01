-- Add subscription billing fields to users table
ALTER TABLE "User" ADD COLUMN "stripeCustomerId" TEXT UNIQUE;
ALTER TABLE "User" ADD COLUMN "subscriptionStatus" TEXT NOT NULL DEFAULT 'trial';
ALTER TABLE "User" ADD COLUMN "trialEndsAt" TIMESTAMP(3);

CREATE INDEX "User_subscriptionStatus_idx" ON "User"("subscriptionStatus");

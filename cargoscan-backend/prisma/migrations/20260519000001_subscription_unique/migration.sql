-- Make Paystack webhook handling idempotent at the database level.
CREATE UNIQUE INDEX "Subscription_provider_providerRef_key"
ON "Subscription"("provider", "providerRef");

-- CreateEnum
CREATE TYPE "PaymentOrderStatus" AS ENUM ('PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('PENDING', 'ACTIVE', 'EXPIRED', 'CANCELLED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "ManualPaymentType" AS ENUM ('YAPE', 'QR_BCP', 'BANK_TRANSFER');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "accountStatus" TEXT NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "properties" ADD COLUMN     "isFeatured" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "subscriptionId" TEXT;

-- CreateTable
CREATE TABLE "commercial_plans" (
    "id" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "priceBOB" DECIMAL(12,2),
    "durationDays" INTEGER NOT NULL DEFAULT 30,
    "maxProperties" INTEGER NOT NULL DEFAULT 1,
    "maxPhotos" INTEGER NOT NULL DEFAULT 12,
    "featuredLimit" INTEGER NOT NULL DEFAULT 0,
    "benefits" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commercial_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_settings" (
    "id" TEXT NOT NULL DEFAULT 'billing',
    "bobPerUsd" DECIMAL(12,6),
    "orderExpiryHours" INTEGER NOT NULL DEFAULT 24,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manual_payment_methods" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ManualPaymentType" NOT NULL,
    "provider" TEXT NOT NULL DEFAULT '',
    "holder" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "accountNumber" TEXT NOT NULL DEFAULT '',
    "bankCode" TEXT NOT NULL DEFAULT '',
    "qrImageUrl" TEXT NOT NULL DEFAULT '',
    "currencies" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "instructions" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "manual_payment_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_orders" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "methodId" TEXT NOT NULL,
    "status" "PaymentOrderStatus" NOT NULL DEFAULT 'PENDING',
    "currency" TEXT NOT NULL,
    "amountBOB" DECIMAL(12,2) NOT NULL,
    "amountUSD" DECIMAL(12,2) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "exchangeRate" DECIMAL(12,6) NOT NULL,
    "planSnapshot" JSONB NOT NULL,
    "methodSnapshot" JSONB NOT NULL,
    "rejectionReason" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_receipts" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'PENDING',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "planName" TEXT NOT NULL,
    "maxProperties" INTEGER NOT NULL,
    "maxPhotos" INTEGER NOT NULL,
    "featuredLimit" INTEGER NOT NULL,
    "planSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_audit" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "userId" TEXT,
    "resourceId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_audit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_outbox" (
    "id" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "commercial_plans_slot_key" ON "commercial_plans"("slot");

-- CreateIndex
CREATE UNIQUE INDEX "manual_payment_methods_type_key" ON "manual_payment_methods"("type");

-- CreateIndex
CREATE UNIQUE INDEX "payment_orders_number_key" ON "payment_orders"("number");

-- CreateIndex
CREATE INDEX "payment_orders_status_expiresAt_idx" ON "payment_orders"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "payment_orders_userId_createdAt_idx" ON "payment_orders"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "payment_orders_planId_methodId_currency_createdAt_idx" ON "payment_orders"("planId", "methodId", "currency", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "payment_receipts_fileKey_key" ON "payment_receipts"("fileKey");

-- CreateIndex
CREATE INDEX "payment_receipts_orderId_createdAt_idx" ON "payment_receipts"("orderId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_orderId_key" ON "subscriptions"("orderId");

-- CreateIndex
CREATE INDEX "subscriptions_userId_status_expiresAt_idx" ON "subscriptions"("userId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "billing_audit_resourceId_createdAt_idx" ON "billing_audit"("resourceId", "createdAt");

-- CreateIndex
CREATE INDEX "billing_audit_userId_createdAt_idx" ON "billing_audit"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "notification_outbox_eventKey_key" ON "notification_outbox"("eventKey");

-- CreateIndex
CREATE INDEX "notification_outbox_status_nextAttemptAt_idx" ON "notification_outbox"("status", "nextAttemptAt");

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_planId_fkey" FOREIGN KEY ("planId") REFERENCES "commercial_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_methodId_fkey" FOREIGN KEY ("methodId") REFERENCES "manual_payment_methods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_receipts" ADD CONSTRAINT "payment_receipts_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "payment_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "commercial_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "payment_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "subscriptions_one_active_user" ON "subscriptions"("userId") WHERE "status" = 'ACTIVE';
ALTER TABLE "commercial_plans" ADD CONSTRAINT "commercial_plans_limits_check" CHECK ("slot" BETWEEN 1 AND 4 AND "durationDays" = 30 AND "maxProperties" > 0 AND "maxPhotos" BETWEEN 1 AND 12 AND "featuredLimit" BETWEEN 0 AND "maxProperties" AND ("priceBOB" IS NULL OR "priceBOB" >= 0));
ALTER TABLE "billing_settings" ADD CONSTRAINT "billing_settings_rate_check" CHECK (("bobPerUsd" IS NULL OR "bobPerUsd" > 0) AND "orderExpiryHours" BETWEEN 1 AND 168);
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_money_check" CHECK ("currency" IN ('BOB', 'USD') AND "amount" > 0 AND "amountBOB" > 0 AND "amountUSD" > 0 AND "exchangeRate" > 0);
ALTER TABLE "manual_payment_methods" ADD CONSTRAINT "manual_payment_methods_currency_check" CHECK ("currencies" <@ ARRAY['BOB', 'USD']::TEXT[]);
ALTER TABLE "users" ADD CONSTRAINT "users_account_status_check" CHECK ("accountStatus" IN ('ACTIVE', 'SUSPENDED', 'BLOCKED', 'INACTIVE'));


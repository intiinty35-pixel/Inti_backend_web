-- AlterTable
ALTER TABLE "billing_audit" ADD COLUMN     "actorEmail" TEXT,
ADD COLUMN     "actorName" TEXT,
ADD COLUMN     "actorRole" TEXT,
ADD COLUMN     "category" TEXT NOT NULL DEFAULT 'SYSTEM',
ADD COLUMN     "device" TEXT,
ADD COLUMN     "httpMethod" TEXT,
ADD COLUMN     "ipAddress" TEXT,
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "path" TEXT,
ADD COLUMN     "requestId" TEXT,
ADD COLUMN     "resourceName" TEXT,
ADD COLUMN     "statusCode" INTEGER,
ADD COLUMN     "subjectName" TEXT,
ADD COLUMN     "success" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "userAgent" TEXT;

-- CreateIndex
CREATE INDEX "billing_audit_actorId_createdAt_idx" ON "billing_audit"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "billing_audit_actorRole_createdAt_idx" ON "billing_audit"("actorRole", "createdAt");

-- CreateIndex
CREATE INDEX "billing_audit_category_createdAt_idx" ON "billing_audit"("category", "createdAt");

-- CreateIndex
CREATE INDEX "billing_audit_requestId_idx" ON "billing_audit"("requestId");

UPDATE "billing_audit" SET "category" = CASE
WHEN "action" LIKE 'PROJECT_%' THEN 'PROJECT'
WHEN "action" LIKE 'PROPERTY_%' OR "action" LIKE 'PUBLICATION_%' THEN 'PROPERTY'
WHEN "action" LIKE 'SUBSCRIPTION_%' OR "action" LIKE 'FREE_PLAN_%' THEN 'SUBSCRIPTION'
WHEN "action" LIKE 'PAYMENT_METHOD_%' OR "action" LIKE 'PAYMENT_QR_%' THEN 'PAYMENT_METHOD'
WHEN "action" LIKE 'PAYMENT_%' OR "action" LIKE 'ORDER_%' OR "action" LIKE 'RECEIPT_%' THEN 'PAYMENT'
WHEN "action" LIKE 'PLAN_%' THEN 'PLAN'
WHEN "action" LIKE 'ACCOUNT_%' OR "action" LIKE 'ADMIN_ACCOUNT_%' OR "action" LIKE 'USER_%' THEN 'USER'
WHEN "action" LIKE 'AUTH_%' THEN 'AUTH'
WHEN "action" LIKE 'SETTINGS_%' THEN 'CONFIG'
ELSE 'SYSTEM' END;

UPDATE "billing_audit" AS a SET "actorName" = u."name", "actorEmail" = u."email", "actorRole" = u."role",
"metadata" = COALESCE(a."metadata", '{}'::jsonb) || '{"identitySource":"current_account_for_historical_event"}'::jsonb
FROM "users" AS u WHERE a."actorId" = u."id" AND a."actorName" IS NULL;

UPDATE "billing_audit" SET "actorName" = 'Sistema', "actorRole" = 'SYSTEM', "device" = 'Proceso automático' WHERE "actorId" = 'SYSTEM';


-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "subscriptionId" TEXT;

-- AlterTable
ALTER TABLE "commercial_plans" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "maxProjects" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "priceAmount" DECIMAL(12,2),
ADD COLUMN     "priceCurrency" TEXT NOT NULL DEFAULT 'BOB';

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "maxProjects" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'MANUAL',
ALTER COLUMN "orderId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE "commercial_plans" SET "priceAmount" = "priceBOB" WHERE "priceAmount" IS NULL;

INSERT INTO "commercial_plans" ("id", "slot", "name", "priceBOB", "priceAmount", "priceCurrency", "maxProperties", "maxProjects", "durationDays", "displayOrder", "isActive", "updatedAt")
VALUES
('inti-plan-free', 1, 'Gratis', 0, 0, 'BOB', 1, 0, 30, 1, true, CURRENT_TIMESTAMP),
('inti-plan-basic', 2, 'Básico', NULL, 10, 'USD', 2, 0, 30, 2, true, CURRENT_TIMESTAMP),
('inti-plan-professional', 3, 'Profesional', 30, 30, 'BOB', 5, 0, 30, 3, true, CURRENT_TIMESTAMP),
('inti-plan-business', 4, 'Empresarial', NULL, 50, 'USD', 3, 2, 30, 4, true, CURRENT_TIMESTAMP)
ON CONFLICT ("slot") DO UPDATE SET
"name" = EXCLUDED."name", "priceBOB" = EXCLUDED."priceBOB", "priceAmount" = EXCLUDED."priceAmount", "priceCurrency" = EXCLUDED."priceCurrency",
"maxProperties" = EXCLUDED."maxProperties", "maxProjects" = EXCLUDED."maxProjects", "featuredLimit" = LEAST("commercial_plans"."featuredLimit", EXCLUDED."maxProperties"), "durationDays" = 30, "displayOrder" = EXCLUDED."displayOrder", "isActive" = true, "archivedAt" = NULL, "updatedAt" = CURRENT_TIMESTAMP;

ALTER TABLE "commercial_plans" ADD CONSTRAINT "commercial_plans_native_price_check" CHECK ("priceCurrency" IN ('BOB', 'USD') AND ("priceAmount" IS NULL OR "priceAmount" >= 0) AND "maxProjects" >= 0);
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_source_check" CHECK (("source" = 'MANUAL' AND "orderId" IS NOT NULL) OR ("source" = 'FREE' AND "orderId" IS NULL));


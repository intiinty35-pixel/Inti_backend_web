-- CreateTable
CREATE TABLE "inquiries" (
    "id" TEXT NOT NULL,
    "listingType" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "ownerId" TEXT,
    "senderName" TEXT NOT NULL,
    "senderEmail" TEXT NOT NULL,
    "senderPhone" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "inquiries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inquiries_ownerId_createdAt_idx" ON "inquiries"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "inquiries_listingType_listingId_createdAt_idx" ON "inquiries"("listingType", "listingId", "createdAt");

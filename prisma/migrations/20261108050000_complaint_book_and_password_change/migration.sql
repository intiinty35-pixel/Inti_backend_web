ALTER TABLE "users" ADD COLUMN "passwordChangedAt" TIMESTAMP(3);

CREATE TABLE "complaint_book_entries" (
    "id" TEXT NOT NULL,
    "ticketNumber" TEXT NOT NULL,
    "claimantName" TEXT NOT NULL,
    "claimantEmail" TEXT NOT NULL,
    "claimantPhone" TEXT NOT NULL,
    "documentNumber" TEXT,
    "entryType" TEXT NOT NULL,
    "serviceDescription" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "desiredResolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "complaint_book_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "complaint_book_entries_ticketNumber_key" ON "complaint_book_entries"("ticketNumber");
CREATE INDEX "complaint_book_entries_createdAt_idx" ON "complaint_book_entries"("createdAt");
CREATE INDEX "complaint_book_entries_claimantEmail_createdAt_idx" ON "complaint_book_entries"("claimantEmail", "createdAt");

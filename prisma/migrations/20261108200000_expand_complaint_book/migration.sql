ALTER TABLE "complaint_book_entries" RENAME COLUMN "claimantName" TO "claimantFirstName";

ALTER TABLE "complaint_book_entries"
    ADD COLUMN "claimantLastName" TEXT NOT NULL DEFAULT '',
    ADD COLUMN "documentType" TEXT NOT NULL DEFAULT 'OTHER',
    ADD COLUMN "department" TEXT NOT NULL DEFAULT '',
    ADD COLUMN "municipality" TEXT NOT NULL DEFAULT '',
    ADD COLUMN "address" TEXT NOT NULL DEFAULT '',
    ADD COLUMN "transactionNumber" TEXT,
    ADD COLUMN "incidentDate" DATE;

CREATE TABLE "complaint_attachments" (
    "id" TEXT NOT NULL,
    "complaintId" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "complaint_attachments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "complaint_attachments_fileKey_key" ON "complaint_attachments"("fileKey");
CREATE INDEX "complaint_attachments_complaintId_createdAt_idx" ON "complaint_attachments"("complaintId", "createdAt");

ALTER TABLE "complaint_attachments"
    ADD CONSTRAINT "complaint_attachments_complaintId_fkey"
    FOREIGN KEY ("complaintId") REFERENCES "complaint_book_entries"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

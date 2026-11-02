-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "currency" TEXT NOT NULL DEFAULT 'BOB',
    "floors" INTEGER,
    "startDate" DATETIME,
    "estimatedDelivery" DATETIME,
    "constructionProgress" INTEGER NOT NULL DEFAULT 0,
    "department" TEXT NOT NULL,
    "province" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "urbanization" TEXT,
    "reference" TEXT,
    "latitude" REAL,
    "longitude" REAL,
    "showExactAddress" BOOLEAN NOT NULL DEFAULT true,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "contactWhatsapp" TEXT,
    "websiteUrl" TEXT,
    "ruc" TEXT,
    "socialReason" TEXT,
    "initialFee" REAL,
    "monthlyPayment" REAL,
    "financingInfo" TEXT,
    "totalBlocks" INTEGER,
    "hasUrbanization" BOOLEAN NOT NULL DEFAULT false,
    "hasPropertyTitle" BOOLEAN NOT NULL DEFAULT false,
    "viewsCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "project_units" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "unitNumber" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "floor" INTEGER,
    "area" REAL,
    "bedrooms" INTEGER,
    "bathrooms" INTEGER,
    "parkingSpots" INTEGER,
    "price" REAL,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "view" TEXT,
    "block" TEXT,
    "lotNumber" TEXT,
    "frontWidth" REAL,
    "position" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "project_units_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "project_media" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "publicId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'IMAGE',
    "position" INTEGER NOT NULL DEFAULT 0,
    "isCover" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "project_media_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "project_amenities" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    CONSTRAINT "project_amenities_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "project_timeline" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "description" TEXT,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "project_timeline_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "project_comments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "project_comments_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "projects_slug_key" ON "projects"("slug");

-- CreateIndex
CREATE INDEX "projects_status_createdAt_idx" ON "projects"("status", "createdAt");

-- CreateIndex
CREATE INDEX "projects_type_phase_idx" ON "projects"("type", "phase");

-- CreateIndex
CREATE INDEX "projects_department_province_district_idx" ON "projects"("department", "province", "district");

-- CreateIndex
CREATE INDEX "project_units_projectId_position_idx" ON "project_units"("projectId", "position");

-- CreateIndex
CREATE INDEX "project_media_projectId_position_idx" ON "project_media"("projectId", "position");

-- CreateIndex
CREATE INDEX "project_amenities_projectId_idx" ON "project_amenities"("projectId");

-- CreateIndex
CREATE INDEX "project_timeline_projectId_date_idx" ON "project_timeline"("projectId", "date");

-- CreateIndex
CREATE INDEX "project_comments_projectId_createdAt_idx" ON "project_comments"("projectId", "createdAt");

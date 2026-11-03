PRAGMA defer_foreign_keys=ON;

CREATE TABLE "new_property_details" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "propertyId" TEXT NOT NULL,
    "totalArea" REAL,
    "constructedArea" REAL,
    "bedrooms" INTEGER,
    "bathrooms" INTEGER,
    "halfBathrooms" INTEGER,
    "parkingSpaces" INTEGER,
    "floor" INTEGER,
    "floors" INTEGER,
    "constructionDate" DATETIME,
    "conservationStatus" TEXT,
    "specificDetails" TEXT,
    CONSTRAINT "property_details_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_property_details" (
    "id",
    "propertyId",
    "totalArea",
    "constructedArea",
    "bedrooms",
    "bathrooms",
    "halfBathrooms",
    "parkingSpaces",
    "floor",
    "floors",
    "constructionDate",
    "conservationStatus",
    "specificDetails"
)
SELECT
    "id",
    "propertyId",
    "totalArea",
    "constructedArea",
    "bedrooms",
    "bathrooms",
    "halfBathrooms",
    "parkingSpaces",
    "floor",
    "floors",
    CASE WHEN "constructionYear" IS NULL THEN NULL ELSE printf('%04d-01-01T00:00:00.000Z', "constructionYear") END,
    "conservationStatus",
    "specificDetails"
FROM "property_details";

DROP TABLE "property_details";
ALTER TABLE "new_property_details" RENAME TO "property_details";

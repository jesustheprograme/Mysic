ALTER TABLE "Album"
ALTER COLUMN "releaseType" DROP DEFAULT,
ALTER COLUMN "releaseType" DROP NOT NULL;

-- Existing rows predate release-type metadata. Keep them unknown so the UI can
-- retain its former track-count fallback until Picard catalogs them again.
UPDATE "Album" SET "releaseType" = NULL;

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS "Song_title_trgm_idx" ON "Song" USING GIN ("title" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Artist_name_trgm_idx" ON "Artist" USING GIN ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Album_title_trgm_idx" ON "Album" USING GIN ("title" gin_trgm_ops);

-- Relation indexes used by catalog includes and reverse lookups.
CREATE INDEX "Artist_name_idx" ON "Artist"("name");
CREATE INDEX "Album_title_idx" ON "Album"("title");
CREATE INDEX "Album_releaseDate_idx" ON "Album"("releaseDate");
CREATE INDEX "Song_title_idx" ON "Song"("title");
CREATE INDEX "SongArtist_artistId_idx" ON "SongArtist"("artistId");
CREATE INDEX "AlbumArtist_artistId_idx" ON "AlbumArtist"("artistId");
CREATE INDEX "AlbumTrack_songId_idx" ON "AlbumTrack"("songId");
CREATE INDEX "MediaAsset_songId_type_idx" ON "MediaAsset"("songId", "type");

-- Prisma `contains` generates ILIKE '%term%'. Trigram indexes accelerate
-- that search shape, while the B-tree indexes above serve ordering/equality.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "Song_title_trgm_idx" ON "Song" USING GIN ("title" gin_trgm_ops);
CREATE INDEX "Artist_name_trgm_idx" ON "Artist" USING GIN ("name" gin_trgm_ops);
CREATE INDEX "Album_title_trgm_idx" ON "Album" USING GIN ("title" gin_trgm_ops);

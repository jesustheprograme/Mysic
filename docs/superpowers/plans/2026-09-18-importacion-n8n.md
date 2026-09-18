# Importacion musical con n8n Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatizar la importacion de MP3 descrita por `Backend/Asignar_metadatos/import.json`, usando n8n como coordinador y el backend existente como ejecutor seguro.

**Architecture:** El backend validara el manifiesto, encontrara la portada dentro de la carpeta exacta de Cloudinary, escribira etiquetas ID3, movera el MP3 a la estructura musical y sincronizara el catalogo. n8n ejecutara una peticion HTTP periodica contra el backend local; no tendra acceso directo a PostgreSQL, Cloudinary ni a los secretos.

**Tech Stack:** Node.js CommonJS, Express, Prisma, Cloudinary Search API, `music-metadata`, `node-id3`, n8n Schedule Trigger y HTTP Request.

**Spec:** `docs/superpowers/specs/2026-09-17-importacion-musica-design.md`

## Global Constraints

- La portada siempre la elige la persona administradora mediante `cloudinaryFolder`; el proceso no buscara ni subira portadas.
- Una entrada con errores permanece en `Backend/Asignar_metadatos` y no sobrescribe destinos existentes.
- Los secretos se mantienen en `Backend/.env`, `Backend/.env.cloudinary` y credenciales de n8n; nunca en `import.json` ni en el flujo exportado.
- El proceso debe conservar los sincronizadores actuales de FileZilla/Oracle y Cloudinary.
- La prueba automatica debe ejecutarse antes de implementar cada unidad nueva.

---

### Task 1: Modelo de manifiesto y validacion

**Files:**
- Create: `Backend/src/music-import/manifest.js`
- Test: `Backend/src/music-import/manifest.test.js`
- Create: `Backend/Asignar_metadatos/import.json`

**Interfaces:**
- Consumes: un objeto JSON con `{ imports: ImportEntry[] }`.
- Produces: `validateManifest(manifest) -> { entries, errors }` y `normalizeImportEntry(entry) -> normalizedEntry`.

- [ ] **Step 1: Write the failing tests**

```js
test('accepts a complete single entry and normalizes the folder', () => {
  const result = validateManifest({ imports: [{
    file: 'show.mp3', artist: 'Ado', title: 'Show', kind: 'single',
    releaseName: 'Show', year: 2023, genres: ['J-Pop'], trackNumber: 1,
    cloudinaryFolder: 'Artistas/Ado/Singles/Show/',
  }] })
  assert.deepEqual(result.errors, [])
  assert.equal(result.entries[0].cloudinaryFolder, 'Artistas/Ado/Singles/Show')
})

test('rejects an entry without the selected Cloudinary folder', () => {
  const result = validateManifest({ imports: [{
    file: 'show.mp3', artist: 'Ado', title: 'Show', kind: 'single', releaseName: 'Show',
  }] })
  assert.match(result.errors[0].message, /cloudinaryFolder/)
})
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `cd Backend; node --test src/music-import/manifest.test.js`

Expected: FAIL because `manifest.js` does not exist yet.

- [ ] **Step 3: Implement validation**

Require `file`, `artist`, `title`, `kind`, `releaseName`, and `cloudinaryFolder`; accept only `album` or `single`; require a positive integer `year` when provided and a positive integer `trackNumber`; normalize slashes, trim whitespace, reject absolute paths and `..` path segments, and return one error per invalid entry without throwing for the whole manifest.

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `cd Backend; node --test src/music-import/manifest.test.js`

Expected: PASS.

- [ ] **Step 5: Add the example manifest**

Create `Backend/Asignar_metadatos/import.json` with an empty `imports` array and document the full example in `README.md` after the implementation is complete.

- [ ] **Step 6: Commit**

```bash
git add Backend/src/music-import/manifest.js Backend/src/music-import/manifest.test.js Backend/Asignar_metadatos/import.json
git commit -m "feat: validar manifiesto de importacion musical"
```

### Task 2: Seleccion segura de portada en Cloudinary

**Files:**
- Create: `Backend/src/music-import/cloudinary-cover.js`
- Test: `Backend/src/music-import/cloudinary-cover.test.js`
- Modify: `Backend/scripts/sync-cloudinary-images.js:1-45`

**Interfaces:**
- Consumes: `cloudinaryFolder`, Cloudinary resource list and folder mode.
- Produces: `selectCoverForFolder(assets, folder, config) -> { url, asset }` or a descriptive error.

- [ ] **Step 1: Write the failing tests**

```js
test('selects portada before another image in the exact folder', () => {
  const result = selectCoverForFolder([
    { asset_folder: 'Artistas/Ado/Singles/Show', display_name: 'other', format: 'jpg', secure_url: validUrl },
    { asset_folder: 'Artistas/Ado/Singles/Show', display_name: 'portada', format: 'jpg', secure_url: validUrl },
  ], 'Artistas/Ado/Singles/Show', dynamicConfig)
  assert.equal(result.asset.display_name, 'portada')
})

test('does not select an image from a similarly named child folder', () => {
  assert.throws(() => selectCoverForFolder([
    { asset_folder: 'Artistas/Ado/Singles/Show/detalle', display_name: 'cover', format: 'jpg', secure_url: validUrl },
  ], 'Artistas/Ado/Singles/Show', dynamicConfig), /no contiene una imagen/)
})
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `cd Backend; node --test src/music-import/cloudinary-cover.test.js`

Expected: FAIL because the selector does not exist.

- [ ] **Step 3: Implement the selector**

Reuse the existing Cloudinary configuration and request helper. Normalize folder comparison according to `dynamic` or `fixed` mode, accept only image formats already allowed by the project, require a delivery URL belonging to the configured Cloudinary account, and prioritize labels matching `portada`, `cover`, `folder`, `front`, then the first deterministic alphabetical image.

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `cd Backend; node --test src/music-import/cloudinary-cover.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add Backend/src/music-import/cloudinary-cover.js Backend/src/music-import/cloudinary-cover.test.js Backend/scripts/sync-cloudinary-images.js
git commit -m "feat: seleccionar portada por carpeta exacta"
```

### Task 3: Etiquetado y procesamiento de una entrada

**Files:**
- Create: `Backend/src/music-import/process-entry.js`
- Test: `Backend/src/music-import/process-entry.test.js`
- Modify: `Backend/package.json`
- Modify: `Backend/prisma/schema.prisma`

**Interfaces:**
- Consumes: normalized entry, inbox root, final music root, selected cover, Prisma client and injectable filesystem functions.
- Produces: `processImportEntry(entry, dependencies) -> { status, source, destination, artist, album, coverUrl }`.

- [ ] **Step 1: Add tests for the required behavior**

Cover the following with real temporary MP3 fixtures: reject a missing source; reject an occupied destination; write artist/title/album/year/genre/track tags; preserve an existing embedded cover; embed the selected Cloudinary cover when no cover exists; and move the successfully processed file only after all validation succeeds.

- [ ] **Step 2: Run the focused tests and verify they fail**

Run: `cd Backend; node --test src/music-import/process-entry.test.js`

Expected: FAIL because the processor and tag writer are not implemented.

- [ ] **Step 3: Add the minimal production dependencies**

Add `node-id3` to `Backend/package.json` and install it with the repository package manager. Keep `music-metadata` for reading the existing file and `node-id3` only for writing tags and embedded artwork.

- [ ] **Step 4: Implement the transaction order**

Read and validate the source, create a temporary sibling file, write tags to the temporary file, ensure the destination does not exist, rename the temporary file to the final destination, then call the existing catalog import helper with the final path. On any failure, remove only the temporary file and leave the original MP3 untouched.

- [ ] **Step 5: Add album release date and genres to Prisma**

Add `genres String[] @default([])` to `Album` and update the album during import. Generate the Prisma migration using the project database URL; do not run a destructive reset. The ID3 tags remain the source for players, while Prisma stores the same genres for the web catalog.

- [ ] **Step 6: Run focused and existing tests**

Run: `cd Backend; npm test; node --test src/music-import/process-entry.test.js`

Expected: all existing tests and the new processor tests pass.

- [ ] **Step 7: Commit**

```bash
git add Backend/package.json Backend/package-lock.json Backend/prisma/schema.prisma Backend/prisma/migrations Backend/src/music-import/process-entry.js Backend/src/music-import/process-entry.test.js
git commit -m "feat: procesar MP3 con metadatos y portada"
```

### Task 4: Command and local API for n8n

**Files:**
- Create: `Backend/scripts/import-json.js`
- Test: `Backend/scripts/import-json.test.js`
- Modify: `Backend/server.js`
- Modify: `Backend/src/config.js`
- Modify: `Backend/.env.example`
- Modify: `Backend/package.json`

**Interfaces:**
- Command: `npm.cmd run music:import-json` processes the default manifest once and emits JSON summary.
- API: `POST /api/music/import-json` with header `x-music-import-token` returns `{ processed, skipped, failed, results }`.
- Environment: `MUSIC_IMPORT_ROOT`, `MUSIC_LIBRARY_PATH`, and `MUSIC_IMPORT_TOKEN`.

- [ ] **Step 1: Write failing command/API tests**

Test that an empty manifest returns a successful no-op, malformed entries are reported without processing valid entries, and a missing or incorrect token returns HTTP 401. Use dependency injection for the processor and Cloudinary client so tests never contact external services.

- [ ] **Step 2: Run tests and verify the expected failure**

Run: `cd Backend; node --test scripts/import-json.test.js`

Expected: FAIL because the command and route do not exist.

- [ ] **Step 3: Implement the command**

Load `Backend/Asignar_metadatos/import.json`, validate entries, list Cloudinary assets once, process each entry independently, and print one JSON summary. Keep successful entries recorded in a state file inside `Asignar_metadatos/.state.json` using a content hash so repeated n8n polls do not repeat completed work.

- [ ] **Step 4: Implement the protected API route**

Register the route before the generic `/api` 404 handler. Compare the header with `MUSIC_IMPORT_TOKEN` using a timing-safe comparison. Return 401 without revealing the configured token and return 200 with per-entry results for processing errors so n8n can display them.

- [ ] **Step 5: Add the package script and environment documentation**

Add `music:import-json` and document the exact Windows paths and token setup in `README.md`.

- [ ] **Step 6: Run all backend tests**

Run: `cd Backend; npm test`

Expected: PASS with no external Cloudinary or database calls in unit tests.

- [ ] **Step 7: Commit**

```bash
git add Backend/scripts/import-json.js Backend/scripts/import-json.test.js Backend/server.js Backend/src/config.js Backend/.env.example Backend/package.json README.md
git commit -m "feat: exponer importacion musical para n8n"
```

### Task 5: Exportar el flujo n8n

**Files:**
- Create: `n8n/music-import-workflow.json`
- Test: `n8n/music-import-workflow.test.js`
- Modify: `README.md`

**Interfaces:**
- The exported workflow uses Schedule Trigger every minute and HTTP Request to `http://host.docker.internal:4000/api/music/import-json`.
- It sends the n8n credential header `x-music-import-token`, logs the JSON summary, and continues on per-entry failures.

- [ ] **Step 1: Add the workflow fixture test**

Validate that the exported JSON contains exactly one schedule trigger, one HTTP request node, the protected endpoint, and no API secrets or MP3 data.

- [ ] **Step 2: Run the test and verify it fails**

Run: `node --test n8n/music-import-workflow.test.js`

Expected: FAIL because the workflow export does not exist.

- [ ] **Step 3: Create the n8n workflow export**

Create a workflow with `Schedule Trigger -> HTTP Request`, set the HTTP request response to JSON, and use a placeholder credential reference instead of embedding the token. Keep the workflow inactive on import so the user can verify the endpoint first.

- [ ] **Step 4: Document the import and activation steps**

Explain: import the JSON from n8n's menu, create a Header Auth credential named `Mysic music import`, set `x-music-import-token`, verify the backend is running on port 4000, run the workflow manually once, then activate it.

- [ ] **Step 5: Run the workflow fixture test**

Run: `node --test n8n/music-import-workflow.test.js`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add n8n/music-import-workflow.json n8n/music-import-workflow.test.js README.md
git commit -m "feat: agregar flujo n8n para importar musica"
```

### Task 6: End-to-end verification

**Files:**
- Modify: `README.md`
- Test: `Backend/scripts/import-json.e2e.test.js`

- [ ] **Step 1: Prepare a disposable fixture**

Create a temporary inbox with one known MP3, a manifest entry, and a mocked Cloudinary asset list; do not use the real music library or real Cloudinary credentials.

- [ ] **Step 2: Run the command in preview mode**

Run: `cd Backend; npm.cmd run music:import-json -- --dry-run`

Expected: one valid entry, no moved file, and a summary that names the selected Cloudinary folder.

- [ ] **Step 3: Run the full backend test suite**

Run: `cd Backend; npm test`

Expected: PASS.

- [ ] **Step 4: Verify the local n8n call**

With the backend and n8n running, execute the imported workflow manually and confirm the HTTP node returns the JSON summary. Then place a real MP3 and update `import.json` only after the fixture succeeds.

- [ ] **Step 5: Commit documentation-only verification updates**

```bash
git add README.md Backend/scripts/import-json.e2e.test.js
git commit -m "docs: document verificacion del flujo n8n"
```

// Copiado de Yotubei por tools/migrar-a-mysic.mjs. No editar a mano: se regenera.
// backend/downloads.js
// Descargas para escuchar sin conexión: guarda el audio y la carátula en disco
// (carpeta backend/downloads) y un index.json con los metadatos de cada canción.
import express from 'express';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

// Pide la carátula en mayor resolución cuando la URL lo permite
function upscaleThumbnail(url) {
  if (!url) return url;
  return url.replace(/=w\d+-h\d+/, '=w544-h544');
}

export function createDownloadsRouter({ dir, resolveAudioStream, invalidateStream }) {
  const router = express.Router();
  const indexFile = path.join(dir, 'index.json');

  /** @type {Map<string, object>} id -> metadatos de la canción descargada */
  const library = new Map();
  /** @type {Map<string, {status: string, received: number, total: number|null, error?: string}>} */
  const jobs = new Map();

  fs.mkdirSync(dir, { recursive: true });

  // Cargar el índice existente
  try {
    const saved = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
    for (const item of saved.items || []) {
      if (item?.id && fs.existsSync(audioPath(item.id))) library.set(item.id, item);
    }
    console.log(`💾 ${library.size} canción(es) descargada(s) disponibles sin conexión.`);
  } catch {
    /* sin índice todavía */
  }

  function audioPath(id) {
    return path.join(dir, `${id}.m4a`);
  }
  function coverPath(id) {
    return path.join(dir, `${id}.jpg`);
  }

  let saving = Promise.resolve();
  function saveIndex() {
    // Escritura atómica y en serie para no corromper el índice
    saving = saving.then(async () => {
      const tmp = `${indexFile}.tmp`;
      await fsp.writeFile(tmp, JSON.stringify({ items: [...library.values()] }, null, 2));
      await fsp.rename(tmp, indexFile);
    }).catch((error) => console.error('[downloads] no se pudo guardar el índice:', error.message));
    return saving;
  }

  function publicItem(item) {
    return {
      ...item,
      thumbnail: item.hasCover ? `/api/downloads/${item.id}/cover` : item.thumbnail,
      local: true,
    };
  }

  function jobsSnapshot() {
    const out = {};
    for (const [id, job] of jobs) {
      out[id] = {
        status: job.status,
        progress: job.total ? Math.min(1, job.received / job.total) : null,
        received: job.received,
        total: job.total,
        error: job.error,
      };
    }
    return out;
  }

  async function fetchStreamWithRetry(id) {
    let stream = await resolveAudioStream(id);
    let response = await fetch(stream.url, { headers: { Range: 'bytes=0-' } });
    if (response.status === 403 || response.status === 410) {
      await response.body?.cancel();
      invalidateStream(id);
      stream = await resolveAudioStream(id);
      response = await fetch(stream.url, { headers: { Range: 'bytes=0-' } });
    }
    if (!response.ok || !response.body) {
      await response.body?.cancel();
      throw new Error(`El origen del audio devolvió ${response.status}`);
    }
    return { stream, response };
  }

  async function runDownload(song) {
    const { id } = song;
    const job = { status: 'downloading', received: 0, total: null };
    jobs.set(id, job);
    const partPath = `${audioPath(id)}.part`;

    try {
      const { stream, response } = await fetchStreamWithRetry(id);
      job.total = Number(response.headers.get('content-length')) || stream.contentLength || null;

      const source = Readable.fromWeb(response.body);
      source.on('data', (chunk) => {
        job.received += chunk.length;
      });
      await pipeline(source, fs.createWriteStream(partPath));
      await fsp.rename(partPath, audioPath(id));

      // Carátula (opcional: si falla seguimos usando la URL remota)
      let hasCover = false;
      if (song.thumbnail) {
        try {
          const coverRes = await fetch(upscaleThumbnail(song.thumbnail));
          if (coverRes.ok) {
            await fsp.writeFile(coverPath(id), Buffer.from(await coverRes.arrayBuffer()));
            hasCover = true;
          }
        } catch {
          /* sin carátula local */
        }
      }

      const stat = await fsp.stat(audioPath(id));
      library.set(id, {
        id,
        title: song.title || 'Canción sin título',
        artist: song.artist || 'Artista desconocido',
        artistId: song.artistId || null,
        album: song.album || 'Sencillo',
        albumId: song.albumId || null,
        duration: song.duration || '--:--',
        durationSeconds: song.durationSeconds || 0,
        thumbnail: song.thumbnail || '',
        hasCover,
        mimeType: stream.mimeType || 'audio/mp4',
        size: stat.size,
        downloadedAt: new Date().toISOString(),
      });
      await saveIndex();
      job.status = 'done';
      console.log(`[downloads] ✅ ${song.title} (${(stat.size / 1048576).toFixed(1)} MB)`);
    } catch (error) {
      job.status = 'error';
      job.error = error.message;
      console.error(`[downloads] ❌ ${id}: ${error.message}`);
      await fsp.rm(partPath, { force: true }).catch(() => {});
    } finally {
      // Dejamos el estado final visible un rato para que el cliente lo recoja
      setTimeout(() => {
        if (jobs.get(id) === job) jobs.delete(id);
      }, 60 * 1000).unref();
    }
  }

  // Lista de descargas y estado de los trabajos en curso
  router.get('/', (req, res) => {
    const items = [...library.values()]
      .sort((a, b) => (a.downloadedAt < b.downloadedAt ? 1 : -1))
      .map(publicItem);
    res.json({ items, jobs: jobsSnapshot() });
  });

  // Inicia la descarga de una canción: body { song: {...} }
  router.post('/', (req, res) => {
    const song = req.body?.song;
    if (!song || !VIDEO_ID_RE.test(String(song.id || ''))) {
      return res.status(400).json({ error: 'Falta la canción a descargar' });
    }
    if (library.has(song.id)) return res.json({ status: 'done', item: publicItem(library.get(song.id)) });
    const existing = jobs.get(song.id);
    if (existing && existing.status === 'downloading') return res.json({ status: 'downloading' });

    runDownload(song);
    res.status(202).json({ status: 'downloading' });
  });

  // Audio local (sendFile gestiona las peticiones Range)
  router.get('/:id/audio', (req, res) => {
    const { id } = req.params;
    const item = library.get(id);
    if (!item) return res.status(404).json({ error: 'Canción no descargada' });
    res.sendFile(audioPath(id), {
      headers: {
        'Content-Type': item.mimeType || 'audio/mp4',
        'Cache-Control': 'private, max-age=31536000',
        // Permite cargarlo desde otro origen aunque haya helmet (p. ej. Mysic)
        'Cross-Origin-Resource-Policy': 'cross-origin',
      },
    });
  });

  router.get('/:id/cover', (req, res) => {
    const { id } = req.params;
    const item = library.get(id);
    if (!item?.hasCover) return res.status(404).end();
    res.sendFile(coverPath(id), { headers: { 'Cache-Control': 'private, max-age=31536000', 'Cross-Origin-Resource-Policy': 'cross-origin' } });
  });

  // Borrar una descarga
  router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    if (!VIDEO_ID_RE.test(id)) return res.status(400).json({ error: 'ID inválido' });
    library.delete(id);
    jobs.delete(id);
    await Promise.all([
      fsp.rm(audioPath(id), { force: true }),
      fsp.rm(coverPath(id), { force: true }),
      fsp.rm(`${audioPath(id)}.part`, { force: true }),
    ]).catch(() => {});
    await saveIndex();
    res.json({ ok: true });
  });

  return router;
}

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
import { getYoutubeForUser } from '../youtube/accountLink.mjs';
import { getYoutube } from '../youtube/client.mjs';

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

// Pide la carátula en mayor resolución cuando la URL lo permite
function upscaleThumbnail(url) {
  if (!url) return url;
  return url.replace(/=w\d+-h\d+/, '=w544-h544');
}

export function createDownloadsRouter({ dir, resolveAudioStream, invalidateStream }) {
  const router = express.Router();
  const userStates = new Map();

  fs.mkdirSync(dir, { recursive: true });

  function userId(req) {
    return req.mysicUser._id.toString();
  }

  function createUserState(id) {
    const userDir = path.join(dir, id);
    const indexFile = path.join(userDir, 'index.json');
    const library = new Map();
    const jobs = new Map();
    fs.mkdirSync(userDir, { recursive: true });

    const state = {
      id,
      indexFile,
      jobs,
      library,
      saving: Promise.resolve(),
      audioPath: (videoId) => path.join(userDir, `${videoId}.m4a`),
      coverPath: (videoId) => path.join(userDir, `${videoId}.jpg`),
    };
    try {
      const saved = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
      for (const item of saved.items || []) {
        if (item?.id && fs.existsSync(state.audioPath(item.id))) library.set(item.id, item);
      }
      console.log(`💾 ${library.size} descarga(s) cargada(s) para el usuario ${id}.`);
    } catch {
      /* El usuario todavía no tiene descargas. */
    }
    return state;
  }

  function getState(req) {
    const id = userId(req);
    let state = userStates.get(id);
    if (!state) {
      state = createUserState(id);
      userStates.set(id, state);
    }
    return state;
  }

  function saveIndex(state) {
    // Escritura atómica y en serie para no corromper el índice
    state.saving = state.saving.then(async () => {
      const tmp = `${state.indexFile}.tmp`;
      await fsp.writeFile(tmp, JSON.stringify({ items: [...state.library.values()] }, null, 2));
      await fsp.rename(tmp, state.indexFile);
    }).catch((error) => console.error('[downloads] no se pudo guardar el índice:', error.message));
    return state.saving;
  }

  function publicItem(item) {
    return {
      ...item,
      thumbnail: item.hasCover ? `/api/downloads/${item.id}/cover` : item.thumbnail,
      local: true,
    };
  }

  function jobsSnapshot(jobs) {
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

  async function fetchStreamWithRetry(id, youtube, cacheScope) {
    let stream = await resolveAudioStream(id, { youtube, cacheScope });
    let response = await fetch(stream.url, { headers: { Range: 'bytes=0-' } });
    if (response.status === 403 || response.status === 410) {
      await response.body?.cancel();
      invalidateStream(id, cacheScope);
      stream = await resolveAudioStream(id, { youtube, cacheScope });
      response = await fetch(stream.url, { headers: { Range: 'bytes=0-' } });
    }
    if (!response.ok || !response.body) {
      await response.body?.cancel();
      throw new Error(`El origen del audio devolvió ${response.status}`);
    }
    return { stream, response };
  }

  async function runDownload(song, state, youtube) {
    const { id } = song;
    const job = { status: 'downloading', received: 0, total: null };
    state.jobs.set(id, job);
    const partPath = `${state.audioPath(id)}.part`;

    try {
      const { stream, response } = await fetchStreamWithRetry(id, youtube, `user:${state.id}`);
      job.total = Number(response.headers.get('content-length')) || stream.contentLength || null;

      const source = Readable.fromWeb(response.body);
      source.on('data', (chunk) => {
        job.received += chunk.length;
      });
      await pipeline(source, fs.createWriteStream(partPath));
      await fsp.rename(partPath, state.audioPath(id));

      // Carátula (opcional: si falla seguimos usando la URL remota)
      let hasCover = false;
      if (song.thumbnail) {
        try {
          const coverRes = await fetch(upscaleThumbnail(song.thumbnail));
          if (coverRes.ok) {
            await fsp.writeFile(state.coverPath(id), Buffer.from(await coverRes.arrayBuffer()));
            hasCover = true;
          }
        } catch {
          /* sin carátula local */
        }
      }

      const stat = await fsp.stat(state.audioPath(id));
      state.library.set(id, {
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
      await saveIndex(state);
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
        if (state.jobs.get(id) === job) state.jobs.delete(id);
      }, 60 * 1000).unref();
    }
  }

  // Lista de descargas y estado de los trabajos en curso
  router.get('/', (req, res) => {
    const state = getState(req);
    const items = [...state.library.values()]
      .sort((a, b) => (a.downloadedAt < b.downloadedAt ? 1 : -1))
      .map(publicItem);
    res.json({ items, jobs: jobsSnapshot(state.jobs) });
  });

  // Inicia la descarga de una canción: body { song: {...} }
  router.post('/', async (req, res, next) => {
    try {
      const song = req.body?.song;
      if (!song || !VIDEO_ID_RE.test(String(song.id || ''))) {
        return res.status(400).json({ error: 'Falta la canción a descargar' });
      }
      const state = getState(req);
      if (state.library.has(song.id)) {
        return res.json({ status: 'done', item: publicItem(state.library.get(song.id)) });
      }
      const existing = state.jobs.get(song.id);
      if (existing?.status === 'downloading') return res.json({ status: 'downloading' });

      const youtube = await getYoutubeForUser(req.mysicUser) ?? getYoutube();
      void runDownload(song, state, youtube);
      return res.status(202).json({ status: 'downloading' });
    } catch (error) {
      return next(error);
    }
  });

  // Audio local (sendFile gestiona las peticiones Range)
  router.get('/:id/audio', (req, res) => {
    const { id } = req.params;
    const state = getState(req);
    const item = state.library.get(id);
    if (!item) return res.status(404).json({ error: 'Canción no descargada' });
    res.sendFile(state.audioPath(id), {
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
    const state = getState(req);
    const item = state.library.get(id);
    if (!item?.hasCover) return res.status(404).end();
    res.sendFile(state.coverPath(id), { headers: { 'Cache-Control': 'private, max-age=31536000', 'Cross-Origin-Resource-Policy': 'cross-origin' } });
  });

  // Borrar una descarga
  router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    if (!VIDEO_ID_RE.test(id)) return res.status(400).json({ error: 'ID inválido' });
    const state = getState(req);
    state.library.delete(id);
    state.jobs.delete(id);
    await Promise.all([
      fsp.rm(state.audioPath(id), { force: true }),
      fsp.rm(state.coverPath(id), { force: true }),
      fsp.rm(`${state.audioPath(id)}.part`, { force: true }),
    ]).catch(() => {});
    await saveIndex(state);
    res.json({ ok: true });
  });

  return router;
}

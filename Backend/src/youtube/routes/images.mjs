// Copiado de Yotubei por tools/migrar-a-mysic.mjs. No editar a mano: se regenera.
// backend/images.js
// Proxy de carátulas: el navegador pide las imágenes a localhost en vez de a Google.
// Evita bloqueos de extensiones, límites de ráfaga y problemas de referrer, y
// guarda una copia en disco para que las carátulas ya vistas funcionen sin internet.
import express from 'express';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

// Hosts de imágenes de YouTube/Google, Discogs, Deezer, Spotify y Wikimedia
const ALLOWED_HOST_RE =
  /(^|\.)(googleusercontent\.com|ytimg\.com|ggpht\.com|discogs\.com|dzcdn\.net|scdn\.co|wikimedia\.org)$/i;
const EXT_BY_TYPE = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
const TYPE_BY_EXT = Object.fromEntries(Object.entries(EXT_BY_TYPE).map(([t, e]) => [e, t]));
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

// Variantes de menor tamaño por si Google rechaza la grande
function smallerVariants(url) {
  const out = [];
  if (/=w\d+-h\d+/.test(url)) {
    out.push(url.replace(/=w\d+-h\d+/, '=w226-h226'));
    out.push(url.replace(/=w\d+-h\d+/, '=w120-h120'));
  }
  if (/\/hq720\.jpg/.test(url)) out.push(url.replace(/\/hq720\.jpg.*$/, '/hqdefault.jpg'));
  return out;
}

/**
 * Guarda en la caché del proxy una imagen ya descargada por otro módulo (p. ej.
 * el agregador de fotos de artista), para que el navegador la reciba al instante.
 */
export async function storeInImageCache(dir, url, buffer, contentType) {
  const type = String(contentType || '').split(';')[0].trim();
  const ext = EXT_BY_TYPE[type];
  if (!ext) return false;
  const file = `${path.join(dir, createHash('sha1').update(url).digest('hex'))}.${ext}`;
  try {
    await fsp.access(file);
    return true; // ya estaba
  } catch {
    /* no existe todavía */
  }
  const tmp = `${file}.${process.pid}.tmp`;
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(tmp, buffer);
  await fsp.rename(tmp, file);
  return true;
}

export function createImagesRouter({ dir }) {
  const router = express.Router();
  fs.mkdirSync(dir, { recursive: true });

  /** @type {Map<string, Promise<{file: string, type: string} | null>>} descargas en curso */
  const inflight = new Map();

  function cacheBase(url) {
    return path.join(dir, createHash('sha1').update(url).digest('hex'));
  }

  async function findCached(base) {
    for (const ext of Object.keys(TYPE_BY_EXT)) {
      const file = `${base}.${ext}`;
      try {
        await fsp.access(file);
        return { file, type: TYPE_BY_EXT[ext] };
      } catch {
        /* no existe */
      }
    }
    return null;
  }

  async function fetchToCache(url, base) {
    const candidates = [url, ...smallerVariants(url)];
    for (const candidate of candidates) {
      try {
        const res = await fetch(candidate, {
          headers: { 'User-Agent': UA, Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8' },
          redirect: 'follow',
        });
        const type = (res.headers.get('content-type') || '').split(';')[0].trim();
        if (!res.ok || !EXT_BY_TYPE[type]) {
          await res.body?.cancel();
          continue;
        }
        const file = `${base}.${EXT_BY_TYPE[type]}`;
        const tmp = `${file}.${process.pid}.tmp`;
        await fsp.writeFile(tmp, Buffer.from(await res.arrayBuffer()));
        await fsp.rename(tmp, file);
        return { file, type };
      } catch {
        /* probamos la siguiente variante */
      }
    }
    return null;
  }

  router.get('/', async (req, res) => {
    const url = String(req.query.u || '');
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      return res.status(400).json({ error: 'URL inválida' });
    }
    if (parsed.protocol !== 'https:' || !ALLOWED_HOST_RE.test(parsed.hostname)) {
      return res.status(400).json({ error: 'Host no permitido' });
    }

    const base = cacheBase(url);
    let entry = await findCached(base);
    if (!entry) {
      if (!inflight.has(url)) {
        inflight.set(url, fetchToCache(url, base).finally(() => inflight.delete(url)));
      }
      entry = await inflight.get(url);
    }
    if (!entry) return res.status(502).json({ error: 'No se pudo obtener la imagen' });

    res.sendFile(entry.file, {
      headers: {
        'Content-Type': entry.type,
        'Cache-Control': 'public, max-age=31536000, immutable',
        // Permite cargarla desde otro origen aunque haya helmet (p. ej. Mysic)
        'Cross-Origin-Resource-Policy': 'cross-origin',
      },
    });
  });

  return router;
}

// Copiado de Yotubei por tools/migrar-a-mysic.mjs. No editar a mano: se regenera.
import { config } from '../config.mjs';
import { createAsyncTtlCache } from '../utils/asyncCache.mjs';

export const LIBRARY_BROWSE_IDS = Object.freeze({
  albums: 'FEmusic_liked_albums',
  artists: 'FEmusic_library_corpus_track_artists',
  subscriptions: 'FEmusic_library_corpus_artists',
  uploads: 'FEmusic_library_privately_owned_releases',
});

const MAX_LIBRARY_PAGES = 20;
const libraryCache = createAsyncTtlCache({
  ttlMs: 5 * 60 * 1000,
  maxSize: config.requestCacheMax,
  shouldCache: (result) => result.complete,
});

function rawResponse(response) {
  return response?.data ?? response ?? {};
}

function walk(value, visit) {
  if (!value || typeof value !== 'object') return;
  visit(value);
  for (const child of Array.isArray(value) ? value : Object.values(value)) walk(child, visit);
}

function rendererValues(page, key) {
  const values = [];
  walk(rawResponse(page), (value) => {
    if (value[key]) values.push(value[key]);
  });
  return values;
}

function textValue(value) {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (typeof value?.simpleText === 'string') return value.simpleText;
  if (typeof value?.text === 'string') return value.text;
  if (Array.isArray(value?.runs)) return value.runs.map((run) => textValue(run?.text)).join('');
  return '';
}

function responsiveColumn(renderer, index) {
  return renderer.flexColumns?.[index]?.musicResponsiveListItemFlexColumnRenderer?.text;
}

function titleValue(renderer) {
  return textValue(renderer.title) || textValue(responsiveColumn(renderer, 0));
}

function subtitleValue(renderer) {
  return textValue(renderer.subtitle) || renderer.flexColumns?.slice(1)
    .map((_, index) => textValue(responsiveColumn(renderer, index + 1)))
    .filter(Boolean)
    .join(' • ');
}

function textRuns(renderer) {
  const candidates = [renderer.title, renderer.subtitle, ...(renderer.flexColumns || []).map((_, index) => responsiveColumn(renderer, index))];
  return candidates.flatMap((value) => value?.runs || []);
}

export function normalizeLibraryId(value) {
  return typeof value === 'string' ? value.replace(/^MPLA/, '') : '';
}

export function classifyLibraryId(value) {
  const id = normalizeLibraryId(value);
  if (id.startsWith('MPRE')) return 'album';
  if (id.startsWith('UC')) return 'artist';
  if (id.startsWith('VL')) return 'playlist';
  return null;
}

function browseIds(renderer) {
  const ids = [];
  walk(renderer, (value) => {
    const id = normalizeLibraryId(value.browseId);
    if (id) ids.push(id);
  });
  return ids;
}

function bestThumbnail(renderer) {
  const thumbnails = [];
  walk(renderer, (value) => {
    if (!Array.isArray(value.thumbnails)) return;
    for (const thumbnail of value.thumbnails) {
      if (thumbnail?.url) thumbnails.push(thumbnail);
    }
  });
  return thumbnails.sort((a, b) => {
    const area = (thumbnail) => (thumbnail.width || 0) * (thumbnail.height || 0);
    return area(b) - area(a) || (b.width || 0) - (a.width || 0);
  })[0]?.url || '';
}

function cleanSubtitle(value) {
  return String(value || '').split('•').map((part) => part.trim()).filter(Boolean).join(' • ');
}

function albumArtist(renderer, subtitle) {
  const artistRun = textRuns(renderer).find((run) => {
    const id = run?.navigationEndpoint?.browseEndpoint?.browseId;
    return classifyLibraryId(id) === 'artist';
  });
  if (artistRun) return textValue(artistRun.text);
  return subtitle.split('•').map((part) => part.trim())
    .find((part) => part && !/^(álbum|album|single|ep|sencillo|podcast)$/i.test(part) && !/^(19|20)\d{2}$/.test(part)) || '';
}

function mapLibraryRenderer(renderer, expectedKind) {
  const expectedIdKind = expectedKind === 'artist' ? 'artist' : 'album';
  const id = browseIds(renderer).find((candidate) => classifyLibraryId(candidate) === expectedIdKind);
  if (!id) return null;

  const title = titleValue(renderer);
  if (!title) return null;
  const subtitle = cleanSubtitle(subtitleValue(renderer));
  const thumbnail = bestThumbnail(renderer);

  if (expectedKind === 'artist') {
    return { id, name: title, thumbnail, ...(subtitle ? { subtitle } : {}) };
  }

  const artistId = browseIds(renderer).find((candidate) => classifyLibraryId(candidate) === 'artist');
  const artist = albumArtist(renderer, subtitle);
  if (expectedKind === 'upload') {
    return { id, title, thumbnail, ...(artist ? { artist } : {}) };
  }

  const year = subtitle.match(/\b(19|20)\d{2}\b/)?.[0];
  return {
    id,
    title,
    thumbnail,
    artist,
    ...(artistId ? { artistId } : {}),
    ...(year ? { year } : {}),
  };
}

export function inspectLibraryPage(page, expectedKind) {
  const twoRowRenderers = rendererValues(page, 'musicTwoRowItemRenderer');
  const responsiveRenderers = rendererValues(page, 'musicResponsiveListItemRenderer');
  const twoRows = twoRowRenderers
    .map((renderer) => mapLibraryRenderer(renderer, expectedKind))
    .filter(Boolean);
  const items = twoRows.length
    ? twoRows
    : responsiveRenderers.map((renderer) => mapLibraryRenderer(renderer, expectedKind)).filter(Boolean);
  return {
    items,
    foundTwoRow: twoRowRenderers.length,
    foundResponsive: responsiveRenderers.length,
  };
}

export function parseLibraryPage(page, expectedKind) {
  return inspectLibraryPage(page, expectedKind).items;
}

export function continuationToken(page) {
  let commandToken = '';
  let fallbackToken = '';
  walk(rawResponse(page), (value) => {
    if (!commandToken && typeof value.continuationCommand?.token === 'string') {
      commandToken = value.continuationCommand.token;
    }
    if (!fallbackToken && typeof value.nextContinuationData?.continuation === 'string') {
      fallbackToken = value.nextContinuationData.continuation;
    }
  });
  return commandToken || fallbackToken;
}

export async function collectLibraryBrowse(youtube, { browseId, kind, label = kind, diagnostics }) {
  const items = new Map();
  const tokens = new Set();
  const startedAt = Date.now();
  let pages = 0;
  let foundTwoRow = 0;
  let foundResponsive = 0;
  let parsed = 0;
  let payload = { browseId, client: 'YTMUSIC' };

  try {
    for (let pageNumber = 0; pageNumber < MAX_LIBRARY_PAGES; pageNumber += 1) {
      let page;
      try {
        pages += 1;
        page = await youtube.actions.execute('/browse', payload);
        if (page?.success === false) {
          throw new Error(`YouTube Music respondió HTTP ${page.status_code || 'desconocido'}`);
        }
      } catch (error) {
        if (!items.size) throw error;
        console.warn(`No se pudo ampliar ${label} de YouTube Music: ${error.message}`);
        break;
      }

      const pageResult = inspectLibraryPage(page, kind);
      foundTwoRow += pageResult.foundTwoRow;
      foundResponsive += pageResult.foundResponsive;
      parsed += pageResult.items.length;
      if (!pageResult.items.length) break;
      for (const item of pageResult.items) {
        if (!items.has(item.id)) items.set(item.id, item);
      }

      const token = continuationToken(page);
      if (!token || tokens.has(token)) break;
      tokens.add(token);
      payload = { continuation: token, client: 'YTMUSIC' };
    }
  } finally {
    const stats = {
      pages,
      elapsedMs: Date.now() - startedAt,
      foundTwoRow,
      foundResponsive,
      parsed,
      unique: items.size,
    };
    if (diagnostics) Object.assign(diagnostics, stats);
    if (foundTwoRow + foundResponsive > 0 && parsed === 0) {
      console.warn(`Posible formato roto en ${label}: ${foundTwoRow + foundResponsive} renderers encontrados y 0 parseados.`);
    }
  }
  return [...items.values()];
}

const extendedQueries = [
  ['albums', 'album', 'los álbumes guardados'],
  ['artists', 'artist', 'los artistas de la biblioteca'],
  ['subscriptions', 'artist', 'las suscripciones'],
  ['uploads', 'upload', 'los álbumes subidos'],
];

async function loadExtendedLibrary(youtube, diagnostics) {
  const settled = await Promise.allSettled(extendedQueries.map(([field, kind, label]) => (
    collectLibraryBrowse(youtube, {
      browseId: LIBRARY_BROWSE_IDS[field],
      kind,
      label,
      diagnostics: diagnostics?.[field],
    })
  )));
  const data = Object.fromEntries(extendedQueries.map(([field, , label], index) => {
    const result = settled[index];
    if (result.status === 'rejected') {
      console.warn(`No se pudieron cargar ${label} de YouTube Music: ${result.reason?.message || result.reason}`);
      return [field, []];
    }
    return [field, result.value];
  }));
  return { data, complete: settled.every((result) => result.status === 'fulfilled') };
}

export function invalidateExtendedLibrary(userId) {
  if (userId != null) libraryCache.delete(String(userId));
}

export async function getExtendedLibrary(youtube, { userId, fresh = false, diagnostics } = {}) {
  const key = userId == null ? null : String(userId);
  if (!key) return (await loadExtendedLibrary(youtube, diagnostics)).data;
  if (fresh) invalidateExtendedLibrary(key);
  return (await libraryCache.get(key, () => loadExtendedLibrary(youtube, diagnostics))).data;
}

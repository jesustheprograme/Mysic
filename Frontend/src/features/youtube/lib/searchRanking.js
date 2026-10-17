// Copiado de Yotubei por tools/migrar-a-mysic.mjs. No editar a mano: se regenera.
import { normalizeSearchText } from './searchIndex.js';

function itemScore(item, query, kind) {
  const title = normalizeSearchText(item?.title ?? item?.name);
  const artist = normalizeSearchText(item?.artist ?? item?.subtitle);
  const tokens = query.split(' ').filter(Boolean);
  let score = 0;

  if (title === query) score += kind === 'album' ? 1_000 : 2_000;
  else if (title.startsWith(query)) score += 800;
  else if (title.includes(query)) score += 350;

  if (artist === query) score += kind === 'artist' ? 1_800 : 1_400;
  else if (artist.startsWith(query)) score += 500;
  else if (artist.includes(query)) score += 200;

  const searchable = `${title} ${artist}`;
  score += tokens.filter((token) => searchable.includes(token)).length * 25;
  return score;
}

function rankItems(items, query, kind) {
  return (items ?? [])
    .map((item, index) => ({ item, index, score: itemScore(item, query, kind) }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ item }) => item);
}

export function rankSearchResult(result, query) {
  if (!result) return result;
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return result;

  if (result.type !== 'all') {
    return {
      ...result,
      items: rankItems(result.items, normalizedQuery, result.type),
    };
  }

  return {
    ...result,
    songs: rankItems(result.songs, normalizedQuery, 'song'),
    artists: rankItems(result.artists, normalizedQuery, 'artist'),
    albums: rankItems(result.albums, normalizedQuery, 'album'),
  };
}

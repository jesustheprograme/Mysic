const express = require('express')

/**
 * Límites de tamaño del cuerpo JSON. Casi todas las rutas reciben unos pocos bytes y se quedan en 32 kB, pero una
 * playlist se guarda entera en una sola petición (~370 bytes por canción, hasta 5.000): con 32 kB solo cabían ~88
 * canciones y una playlist importada de Spotify (hasta 100) o una playlist grande fallaba al guardarse.
 *
 * El analizador de /api/playlists va PRIMERO: body-parser deja pasar sin tocarlo un cuerpo ya leído, así que el
 * general de después no lo vuelve a limitar. Las rutas de playlist siguen validando cada campo con zod.
 */
function mountJsonParsers(app, { defaultLimit = '32kb', playlistsLimit = '2mb' } = {}) {
  app.use('/api/playlists', express.json({ limit: playlistsLimit }))
  app.use(express.json({ limit: defaultLimit }))
}

module.exports = { mountJsonParsers }

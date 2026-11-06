import express from 'express';
import { asyncRoute, BROWSE_ID_RE, requireYoutube, validateParam, VIDEO_ID_RE } from '../utils/http.mjs';
import { getExplore, getHome, getPlaylistQueue, getRadio, getRecommendations, getSessionLibrary } from '../youtube/browse.mjs';
import { getYoutube } from '../youtube/client.mjs';
import { connectBrowserSession, connectCapturedBrowserSession, getAccountStatus, getYoutubeForUser, startAccountLink, unlinkAccount } from '../youtube/accountLink.mjs';
import { getOfficialYoutubeLibrary } from '../youtube/dataApi.mjs';

async function getRequestYoutube(req) {
  return await getYoutubeForUser(req.mysicUser) ?? getYoutube();
}

export function createBrowseRouter() {
  const router = express.Router();

  router.get('/account', asyncRoute(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(await getAccountStatus(req.mysicUser));
  }, 'No se pudo consultar la vinculación de YouTube Music'));

  router.post('/link/start', asyncRoute(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(await startAccountLink(req.mysicUser));
  }, 'No se pudo iniciar la vinculación con YouTube Music'));

  router.get('/link/status', asyncRoute(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(await getAccountStatus(req.mysicUser));
  }, 'No se pudo consultar la vinculación de YouTube Music'));

  router.post('/link/browser', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      res.json(await connectBrowserSession(req.mysicUser, req.body?.requestText));
    } catch (error) {
      console.warn(`No se pudo validar la sesión de YouTube Music: ${error.message}`);
      res.status(400).json({ error: error.message });
    }
  });

  router.post('/link/session', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      res.json(await connectCapturedBrowserSession(req.mysicUser, req.body));
    } catch (error) {
      console.warn(`No se pudo validar una sesión capturada de YouTube Music: ${error.message}`);
      res.status(400).json({ error: error.message });
    }
  });

  router.delete('/link', asyncRoute(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(await unlinkAccount(req.mysicUser));
  }, 'No se pudo desvincular YouTube Music'));

  router.post('/official/library', async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    try {
      res.json(await getOfficialYoutubeLibrary(req.body?.accessToken));
    } catch (error) {
      res.status(error.status === 400 ? 400 : 502).json({ error: error.message });
    }
  });

  router.get('/library', requireYoutube, async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    const youtube = await getYoutubeForUser(req.mysicUser);
    if (!youtube) {
      return res.status(409).json({ error: 'Conecta una sesión de YouTube Music antes de sincronizar tu biblioteca.' });
    }
    try {
      return res.json(await getSessionLibrary(youtube));
    } catch (error) {
      console.warn(`No se pudo sincronizar la biblioteca de YouTube Music: ${error.message}`);
      return res.status(502).json({ error: 'YouTube Music no pudo entregar tu biblioteca. Inténtalo nuevamente.' });
    }
  });

  router.get('/home', requireYoutube, asyncRoute(async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    res.json(await getHome(await getRequestYoutube(req)));
  }, 'No se pudo cargar tu inicio de YouTube Music'));

  router.get('/explore', requireYoutube, asyncRoute(async (req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=900');
    res.json(await getExplore());
  }, 'No se pudo cargar Explorar'));

  router.get('/radio/:id', requireYoutube, validateParam('id', VIDEO_ID_RE, 'ID de video no válido'), asyncRoute(async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    res.json(await getRadio(req.params.id, await getRequestYoutube(req)));
  }, 'No se pudo crear la radio'));

  router.get('/playlist/:id', requireYoutube, validateParam('id', BROWSE_ID_RE, 'ID de playlist no válido'), asyncRoute(async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    res.json(await getPlaylistQueue(req.params.id, await getRequestYoutube(req)));
  }, 'No se pudo cargar la playlist'));

  router.get('/recommendations/:id', requireYoutube, validateParam('id', VIDEO_ID_RE, 'ID de video no válido'), asyncRoute(async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    res.json(await getRecommendations(req.params.id, await getRequestYoutube(req)));
  }, 'No se pudieron cargar las recomendaciones'));

  return router;
}

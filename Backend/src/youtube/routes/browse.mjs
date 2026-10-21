import express from 'express';
import { asyncRoute, BROWSE_ID_RE, requireYoutube, validateParam, VIDEO_ID_RE } from '../utils/http.mjs';
import { getExplore, getHome, getPlaylistQueue, getRadio, getRecommendations } from '../youtube/browse.mjs';
import { getYoutube } from '../youtube/client.mjs';
import { getAccountStatus, getYoutubeForUser, startAccountLink, unlinkAccount } from '../youtube/accountLink.mjs';

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

  router.delete('/link', asyncRoute(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(await unlinkAccount(req.mysicUser));
  }, 'No se pudo desvincular YouTube Music'));

  router.get('/home', requireYoutube, asyncRoute(async (req, res) => {
    res.setHeader('Cache-Control', 'private, max-age=120');
    res.json(await getHome(await getRequestYoutube(req)));
  }, 'No se pudo cargar tu inicio de YouTube Music'));

  router.get('/explore', requireYoutube, asyncRoute(async (req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=900');
    res.json(await getExplore());
  }, 'No se pudo cargar Explorar'));

  router.get('/radio/:id', requireYoutube, validateParam('id', VIDEO_ID_RE, 'ID de video no válido'), asyncRoute(async (req, res) => {
    res.setHeader('Cache-Control', 'private, max-age=120');
    res.json(await getRadio(req.params.id, await getRequestYoutube(req)));
  }, 'No se pudo crear la radio'));

  router.get('/playlist/:id', requireYoutube, validateParam('id', BROWSE_ID_RE, 'ID de playlist no válido'), asyncRoute(async (req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=900');
    res.json(await getPlaylistQueue(req.params.id));
  }, 'No se pudo cargar la playlist'));

  router.get('/recommendations/:id', requireYoutube, validateParam('id', VIDEO_ID_RE, 'ID de video no válido'), asyncRoute(async (req, res) => {
    res.setHeader('Cache-Control', 'private, max-age=120');
    res.json(await getRecommendations(req.params.id, await getRequestYoutube(req)));
  }, 'No se pudieron cargar las recomendaciones'));

  return router;
}

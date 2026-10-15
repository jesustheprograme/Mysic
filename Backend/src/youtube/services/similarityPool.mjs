// Copiado de Yotubei por tools/migrar-a-mysic.mjs. No editar a mano: se regenera.
// backend/src/services/similarityPool.js
// Pool de hilos para calcular similitudes de imágenes en paralelo (la
// comparación es puro cálculo y en un solo hilo tardaba varios segundos).
import os from 'node:os';
import { Worker } from 'node:worker_threads';

const WORKER_URL = new URL('./similarityWorker.mjs', import.meta.url);
// Con las imágenes ya reducidas cada comparación cuesta pocas decenas de ms:
// 6 hilos bastan y no saturan la CPU ni la memoria (cada hilo carga sharp).
const POOL_SIZE = Math.max(1, Math.min(6, (os.availableParallelism?.() || os.cpus().length) - 2));

const idle = [];
const all = [];
const queue = [];
const pending = new Map();
let nextJobId = 1;

function spawn() {
  const worker = new Worker(WORKER_URL);
  worker.unref(); // no mantiene vivo el proceso
  worker.on('message', ({ jobId, score, error }) => {
    const job = pending.get(jobId);
    pending.delete(jobId);
    if (job) (error ? job.reject(new Error(error)) : job.resolve(score));
    release(worker);
  });
  worker.on('error', (error) => {
    console.error('[similarity-pool] hilo caído:', error.message);
    const index = all.indexOf(worker);
    if (index >= 0) all.splice(index, 1);
    // Los trabajos en curso de ese hilo se rechazan y se repone el hilo
    for (const [jobId, job] of pending) {
      if (job.worker === worker) {
        pending.delete(jobId);
        job.reject(error);
      }
    }
    all.push(spawnIdle());
  });
  all.push(worker);
  return worker;
}

function spawnIdle() {
  const worker = spawn();
  all.pop(); // spawn ya lo añadió; evitamos duplicarlo
  idle.push(worker);
  return worker;
}

function release(worker) {
  const next = queue.shift();
  if (next) dispatch(worker, next);
  else idle.push(worker);
}

function dispatch(worker, job) {
  job.worker = worker;
  pending.set(job.jobId, job);
  worker.postMessage({ jobId: job.jobId, a: job.a, b: job.b });
}

function ensurePool() {
  while (all.length < POOL_SIZE) idle.push(spawn());
}

/** Similitud (0..1) entre dos imágenes dadas como Buffer, calculada en un hilo aparte. */
export function similarityInPool(a, b) {
  ensurePool();
  return new Promise((resolve, reject) => {
    const job = { jobId: nextJobId++, a, b, resolve, reject };
    const worker = idle.pop();
    if (worker) dispatch(worker, job);
    else queue.push(job);
  });
}

/** Arranca los hilos por adelantado para no pagar su inicio en la primera petición. */
export function warmSimilarityPool() {
  ensurePool();
  return POOL_SIZE;
}

export const poolSize = POOL_SIZE;

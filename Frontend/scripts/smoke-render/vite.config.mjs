import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { mergeConfig } from 'vite'
import base from '../../vite.config.js'

// Misma configuración que la app, sin copiar la carpeta public (música y fotos de ejemplo) a la salida de pruebas.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
export default mergeConfig(base, { root, publicDir: false })
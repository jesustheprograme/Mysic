import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const devUrl = 'http://localhost:5173'
const projectDirectory = fileURLToPath(new URL('..', import.meta.url))

try {
  const response = await fetch(devUrl, { signal: AbortSignal.timeout(1500) })
  if (response.ok) {
    console.log(`Reutilizando el servidor de desarrollo disponible en ${devUrl}`)
    process.exit(0)
  }
} catch {
  // No hay un servidor disponible; Vite se inicia a continuación.
}

const viteCli = join(projectDirectory, 'node_modules', 'vite', 'bin', 'vite.js')
const vite = spawn(process.execPath, [viteCli], {
  cwd: projectDirectory,
  env: process.env,
  stdio: 'inherit',
})

vite.on('error', (error) => {
  console.error(`No se pudo iniciar Vite: ${error.message}`)
  process.exit(1)
})

vite.on('exit', (code) => process.exit(code ?? 1))

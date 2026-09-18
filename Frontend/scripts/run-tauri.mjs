import { spawn } from 'node:child_process'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectDirectory = fileURLToPath(new URL('..', import.meta.url))
const tauriCli = join(projectDirectory, 'node_modules', '@tauri-apps', 'cli', 'tauri.js')
const pathKey = Object.keys(process.env).find((key) => key.toLowerCase() === 'path') ?? 'PATH'
const cargoDirectory = join(homedir(), '.cargo', 'bin')
const childEnvironment = {
  ...process.env,
  [pathKey]: `${cargoDirectory}${delimiter}${process.env[pathKey] ?? ''}`,
}

const tauri = spawn(process.execPath, [tauriCli, ...process.argv.slice(2)], {
  cwd: projectDirectory,
  env: childEnvironment,
  stdio: 'inherit',
})

tauri.on('error', (error) => {
  console.error(`No se pudo iniciar Tauri: ${error.message}`)
  process.exit(1)
})

tauri.on('exit', (code) => process.exit(code ?? 1))

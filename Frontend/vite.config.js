import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const projectRoot = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(projectRoot, './src'),
    },
  },
  build: {
    rolldownOptions: {
      output: {
        // React cambia poco entre despliegues: en un chunk propio se queda en caché del navegador
        // aunque cambie el código de la app. No se agrupa el resto de node_modules a propósito, para
        // no arrastrar a la carga inicial librerías que solo usan chunks lazy (p. ej. wavesurfer).
        manualChunks: (moduleId) => (
          /node_modules[\\/](?:react|react-dom|scheduler)[\\/]/.test(moduleId) ? 'react-vendor' : undefined
        ),
      },
    },
  },
  server: {
    allowedHosts: ['.nip.io'],
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
  },
})

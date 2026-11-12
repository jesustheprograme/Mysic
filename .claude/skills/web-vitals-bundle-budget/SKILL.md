---
name: web-vitals-bundle-budget
description: Rendimiento web y frontend - Core Web Vitals (LCP, INP, CLS), tamaño de paquetes JavaScript y CSS, presupuestos de bundle, code splitting, lazy loading, caché de Nginx, Lighthouse. Úsala cuando pidan "carga lenta", "reducir el bundle", "Lighthouse", "Core Web Vitals", "lazy loading", "code splitting" o revisar el tamaño de Frontend/dist. Use for Vite/React bundle analysis and web performance budgets.
---

# Rendimiento web: Core Web Vitals y presupuestos

Aplicación: React 19 + Vite en `Frontend/`. En escritorio corre dentro de WebView2 (Tauri); en web se sirve con Nginx.

## 1. Línea base (siempre primero)
```powershell
cd Frontend; npm run build      # anota el tamaño de cada chunk y del CSS
Get-ChildItem dist -Recurse -File | Measure-Object Length -Sum
```
Anota: JS inicial (bruto y gzip), CSS, número de archivos y el mayor chunk.

## 2. Presupuestos orientativos (ajústalos con el equipo)
- JS necesario para la primera pantalla: menos de 200 kB gzip.
- CSS inicial: menos de 100 kB gzip; sin fuentes que no se usen en la primera pantalla.
- Ninguna imagen decodificada mayor de 2 veces su tamaño en pantalla.
Falla el presupuesto: investiga primero qué entra en el chunk inicial.

## 3. Vitals en la app (sin herramientas externas)
```js
new PerformanceObserver((l) => l.getEntries().forEach((e) => console.log(e.entryType, e.startTime, e.value ?? e.duration)))
  .observe({ type: 'largest-contentful-paint', buffered: true })   // LCP
// 'layout-shift' (CLS, ignora hadRecentInput) y 'event' con durationThreshold 40 (aproxima INP)
```
- **LCP:** la imagen o bloque grande de la primera pantalla; usa tamaños correctos y `fetchpriority` solo en esa.
- **INP:** tareas largas en el hilo principal (más de 50 ms): divide el trabajo, memoiza, ventanea listas.
- **CLS:** reserva el tamaño de imágenes y tarjetas (`width`/`height`, `aspect-ratio`).

## 4. Qué suele dar más
1. `lazy()` en vistas pesadas y `manualChunks` para vendors; no cargues reproductor ni vistas secundarias al arrancar.
2. Imágenes al tamaño de su hueco (con DPR), `loading="lazy"` y `decoding="async"` fuera de la primera pantalla.
3. Listas largas con ventaneo (solo filas visibles) en lugar de pintar todo.
4. Quitar `will-change` y `backdrop-filter` repetidos por elemento.
5. Precarga por intención (cursor, foco) y caché con "mostrar lo guardado y refrescar por detrás".

## 5. Lighthouse (solo web, no aplica al WebView)
`npx @lhci/cli autorun` se descarga con `npx`: **pide permiso**. Úsalo contra `npm run preview`, nunca contra producción
con cuentas reales. En el escritorio la medida válida es la de la skill `mysic-perf-measurement`.

## 6. Nginx (producción)
Revisa `deploy/nginx/*.template`: compresión (gzip/brotli) para texto, `Cache-Control: immutable` para archivos con hash
y `no-cache` para `index.html`. No cambies Nginx en el servidor sin autorización explícita.

## Entrega
Tabla antes y después (JS, CSS, archivos, LCP si aplica), qué se cambió y qué no se pudo medir.

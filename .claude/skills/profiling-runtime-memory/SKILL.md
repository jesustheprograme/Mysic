---
name: profiling-runtime-memory
description: Perfilado de CPU y memoria de Node.js, del WebView (React) y de otros lenguajes - cuellos de botella, fugas de memoria, bucles ineficientes, complejidad algorítmica. Úsala cuando pidan "perfilar", "flamegraph", "fuga de memoria", "memory leak", "consume mucha RAM", "se bloquea el event loop", "optimizar un algoritmo lento". Use for CPU/heap profiling with node --cpu-prof, clinic.js, 0x, Chrome DevTools protocol, py-spy, line_profiler, memray.
---

# Perfilado de ejecución y memoria

Regla de oro: **medir, localizar, cambiar una cosa, volver a medir**. Nunca optimices por intuición.

## 1. Decide qué proceso
| Síntoma | Dónde mirar |
|---|---|
| App de escritorio pesada | Procesos de WebView2 por tipo (renderer, GPU). Usa la skill `mysic-perf-measurement` |
| API lenta o con picos | Proceso Node del backend (`Backend/server.js`) |
| Una función concreta lenta | Microbenchmark aislado (`node --test` con medición, o `hyperfine`) |

## 2. Node.js (backend y scripts)
```powershell
# CPU: genera un .cpuprofile que se abre en Chrome DevTools (pestaña Performance) o en speedscope
node --cpu-prof --cpu-prof-dir=.\prof server.js
# Heap: instantáneas y muestreo de asignaciones
node --heap-prof --heap-prof-dir=.\prof server.js
# Retraso del event loop (qué tan bloqueado está)
node -e "const {monitorEventLoopDelay}=require('perf_hooks');const h=monitorEventLoopDelay();h.enable();setInterval(()=>{console.log('p99',(h.percentile(99)/1e6).toFixed(1),'ms');h.reset()},2000)"
```
- `npx clinic doctor -- node server.js` diagnostica CPU, event loop, memoria y E/S; `npx 0x server.js` genera flamegraphs.
  Ambos se descargan con `npx`: **pregunta antes**, no están en las dependencias.
- Busca en el flamegraph las funciones **anchas** en la base (tiempo propio), no las altas.

## 3. WebView / React
- Memoria y DOM: conecta por CDP (`Performance.getMetrics`, `Runtime.getHeapUsage`, `HeapProfiler.collectGarbage`).
- Fuga = crecimiento sostenido tras recolectar basura al repetir un ciclo de navegación. Causas habituales: listeners sin
  retirar, `setInterval` sin limpiar, `Map` de módulo sin límite, `IntersectionObserver` o `ResizeObserver` sin `disconnect`.
- Coste de renderizado: React DevTools Profiler; revisa `memo`, identidad de props y listas largas (ventaneo).
- Capas de GPU: `backdrop-filter`, `will-change` y `filter: blur` repetidos por elemento.

## 4. Otros lenguajes (si el proyecto los usa)
- Python: `py-spy top|record` (sin parar el proceso), `line_profiler` (línea a línea), `memray run` (memoria).
- Rust (Tauri): `cargo flamegraph`, o contadores simples con `std::time::Instant`.

## 5. Complejidad algorítmica
- Mide con tamaños crecientes (100, 1.000, 10.000). Si el tiempo se cuadruplica al duplicar la entrada, es cuadrático.
- Casos ya vistos en este proyecto: sincronizar 4.000 favoritos con un bucle O(n²) (19,6 s) y pintar 900 tarjetas de golpe.

## Entrega
Resumen con: síntoma, medición antes y después (con muestra), causa, cambio, riesgo. Si no pudiste medir algo, dilo.

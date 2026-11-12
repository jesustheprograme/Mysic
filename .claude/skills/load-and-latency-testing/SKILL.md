---
name: load-and-latency-testing
description: Pruebas de latencia y de carga HTTP del backend de Mysic y comparación exacta de comandos - hyperfine, autocannon, wrk, vegeta, percentiles p50/p95/p99, ancho de banda del proxy de audio. Úsala cuando pidan "prueba de estrés", "load test", "cuántas peticiones aguanta", "comparar la velocidad de dos comandos", "benchmark" o "latencia de la API". Use for HTTP load testing and command benchmarking.
---

# Latencia y carga

## Reglas de seguridad (primero)
- **Nunca** lances carga contra producción (`myslc.duckdns.org`) sin autorización explícita del usuario. Prueba contra un
  backend local o de pruebas.
- Con el servidor público solo se hacen mediciones ligeras de una petición (unas pocas, espaciadas).
- No uses cuentas reales para generar carga ni guardes cookies o tokens en scripts o informes.

## Herramientas (todas se descargan: pide permiso antes de instalar)
| Necesidad | Herramienta | Nota para Windows |
|---|---|---|
| Comparar dos comandos o binarios | `hyperfine` | `winget install sharkdp.hyperfine` o scoop |
| Carga HTTP simple | `autocannon` | `npx autocannon -c 20 -d 15 <url>` (Node, sin instalar) |
| Carga HTTP de alto rendimiento | `wrk` o `vegeta` | `wrk` no existe en Windows nativo; usa `vegeta` o `autocannon` |

## Qué medir
- Latencia **p50, p95 y p99** (no solo la media), peticiones por segundo, errores y su código.
- Subir la concurrencia por pasos (5, 20, 50) hasta ver el punto donde p95 se dispara o aparecen 5xx.
- En el backend: memoria del proceso y retraso del event loop durante la prueba (ver skill `observability-metrics`).

## Latencia de una petición cruzada (cliente al VPS)
Mide el tiempo hasta cabeceras y hasta el último byte por separado; el ida y vuelta a este VPS ronda los 108 ms por petición,
así que cada petición secuencial extra cuesta eso como mínimo.

## Audio por el proxy (`/api/youtube/stream/:id`)
Todo el audio atraviesa el backend. Para estimar su coste:
- Bytes por canción (la pista medida pesaba 7,7 MB) por canciones por minuto por usuarios.
- Solicitudes simultáneas y conexiones abortadas al cambiar rápido de canción.
- Tiempo hasta el primer byte con la URL ya resuelta frente a en frío.
- Primer tramo en memoria (`prefetchStreamHead`): porcentaje de peticiones `bytes=0-` que salen de ahí.

## Comparar un cambio
Mismo método, misma máquina, misma red, mínimo 5 repeticiones, y alterna antes y después para no sesgar por la hora.
Informa media, mediana, desviación y el tamaño de la muestra.

## Entrega
Tabla con escenario, concurrencia, p50/p95/p99, req/s, errores; límites de lo medido y recomendación. Si la carga real de
producción no se pudo medir, dilo.

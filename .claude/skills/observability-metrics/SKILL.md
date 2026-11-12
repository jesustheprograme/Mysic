---
name: observability-metrics
description: Observabilidad y métricas del backend y del VPS de Mysic - CPU, memoria, event loop, latencia, errores, logs y salud del servicio (mysic-api, Nginx), al estilo de railway-metrics o un recolector de métricas de infraestructura. Úsala cuando pidan "cómo va el servidor", "métricas", "logs", "uso de CPU o memoria del VPS", "verificar el despliegue", "monitorizar" o "alertas". Use for read-only infrastructure and application metrics collection.
---

# Observabilidad y métricas (solo lectura por defecto)

Producción: backend Node (`mysic-api`, servicio de systemd) detrás de Nginx en `myslc.duckdns.org`; datos en `/srv/mysic/`.
Esta skill **recoge y explica métricas**; no cambia nada en el servidor.

## Antes de entrar en el servidor
- Hace falta acceso SSH que el usuario conceda (clave dedicada y usuario limitado). Sin acceso, usa solo lo público.
- No leas cookies, tokens, `.env` ni contenido de cuentas. Si un comando puede imprimirlos, no lo ejecutes.
- Reiniciar, desplegar o cambiar configuración exige autorización explícita, aunque el acceso exista.

## Sin acceso al servidor (público)
```powershell
# Salud y tiempos de una petición (pocas, espaciadas)
1..5 | % { $s=[Diagnostics.Stopwatch]::StartNew(); Invoke-WebRequest https://myslc.duckdns.org/api/health -UseBasicParsing | Out-Null; "$($s.ElapsedMilliseconds) ms" }
```
La primera suele tardar más (conexión TLS nueva). Informa también la mediana sin la primera.

## Con acceso (lectura)
| Qué | Comando |
|---|---|
| Estado del servicio | `systemctl status mysic-api --no-pager` |
| Errores recientes | `journalctl -u mysic-api --since "30 min ago" -p warning --no-pager` |
| CPU y memoria del proceso | `ps -o pid,pcpu,pmem,rss,etime,cmd -C node` |
| Memoria y carga del sistema | `free -m; uptime; df -h /srv` |
| Conexiones | `ss -s` |
| Nginx: errores | `tail -n 100 /var/log/nginx/error.log` |
| Nginx: latencias | `awk` sobre el access log si `$request_time` está en el formato; si no, propón añadirlo |

## Métricas de aplicación que vale la pena tener
- Retraso del event loop (`perf_hooks.monitorEventLoopDelay`): p99 por encima de 100 ms indica trabajo bloqueante.
- Memoria del proceso (`process.memoryUsage()`): rss y heapUsed en el tiempo; una subida sostenida sin bajar es fuga.
- Por ruta: latencia p50/p95, tasa de 4xx y 5xx. Para `/stream`: bytes servidos, abortos, tramos servidos desde memoria.
- Cachés (stream, tramo inicial, home, biblioteca): tamaño, aciertos y fallos.
Si hay que añadirlas, hazlo con un middleware mínimo y sin dependencias nuevas salvo que se demuestre necesario.

## Qué interpretar
- Comparar siempre antes y después de un despliegue (memoria a los 0, 10 y 60 minutos).
- Un pico aislado no es una tendencia: pide al menos varias muestras.
- Separa causa y síntoma: CPU alta puede venir del proxy de audio, de BotGuard (jsdom) o de una consulta lenta.

## Si el proyecto se mueve a una plataforma gestionada (Railway u otra)
Usa su panel y su CLI para métricas y logs de solo lectura; los pasos de esta skill (qué medir y cómo interpretar) no cambian.
Hoy el proyecto **no** usa Railway.

## Entrega
Instantánea con fecha y hora, valores, qué es normal y qué no, y qué no pudiste medir (por falta de acceso o de datos).

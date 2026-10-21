# YouTube Music en Mysic

Mysic usa `youtubei.js` para búsqueda, Inicio, Explorar, radio y recomendaciones.
Sin una sesión de YouTube, estas funciones siguen disponibles pero los resultados
son generales. Con una sesión configurada, YouTube genera el feed según esa cuenta.

## Activar la personalización

YouTube.js recomienda cookies para los clientes web de YouTube Music. El OAuth que
ofrece la librería está limitado al cliente de YouTube TV y no sustituye de forma
fiable una sesión de Music.

1. Abre una ventana privada y entra en `https://music.youtube.com`.
2. En las herramientas de desarrollo, copia la cabecera `Cookie` de una petición a
   YouTube Music.
3. Cierra la ventana privada para evitar que YouTube rote esas cookies.
4. Guarda el valor en el gestor de secretos del servidor como
   `YOUTUBE_COOKIE_BASE64` (recomendado) o `YOUTUBE_COOKIE`.
5. Reinicia el backend.

Para producir el valor Base64 en PowerShell:

```powershell
[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes('COOKIE_COMPLETA'))
```

Nunca expongas esta variable mediante Vite, archivos públicos o respuestas de la
API. Los endpoints de Mysic que devuelven datos personales de YouTube exigen una
sesión válida de Mysic.

> La sesión configurada pertenece al servidor. En un despliegue multiusuario todos
> los usuarios autorizados verían la personalización de esa misma cuenta. Para una
> cuenta distinta por usuario se necesita almacenamiento cifrado y aislamiento de
> sesiones de Innertube; no se debe guardar una cookie de YouTube en el navegador.

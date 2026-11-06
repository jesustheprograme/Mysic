# YouTube Music en Mysic

Mysic consulta YouTube Music mediante `youtubei.js`, un cliente no oficial de
Innertube, la API privada que usan las aplicaciones de YouTube. No hay que pagar
por una API ni crear una clave de Google Cloud para este flujo. Tener YouTube
Premium tampoco concede una API distinta.

Sin una cuenta vinculada siguen funcionando la búsqueda y los resultados
generales. Al vincular una sesión, Inicio, radios, recomendaciones y reproducción
usan la cuenta de YouTube Music del usuario autenticado en Mysic.

## Por qué no se usa el acceso normal con Google

La API oficial YouTube Data API v3 admite OAuth 2.0 para recursos de YouTube como
canales, playlists y suscripciones, pero no publica una API de YouTube Music ni el
feed privado de Inicio. El OAuth de `youtubei.js` está limitado al cliente de
YouTube para TV y no sustituye de forma fiable la sesión web de Music.

Para clientes web, YouTube.js recomienda autenticación mediante cookies:

- <https://ytjs.dev/guide/authentication>
- <https://ytjs.dev/guide/faq>
- <https://developers.google.com/youtube/v3/guides/authentication>

## Vincular una cuenta desde Mysic

1. Inicia sesión en Mysic y abre **Mysic Global**.
2. Pulsa **Conectar YouTube Music**.
3. Abre una ventana privada del navegador, entra en
   <https://music.youtube.com> e inicia sesión con la cuenta correcta.
4. Abre DevTools (`F12`) y selecciona **Red** y después **Fetch/XHR**.
5. Recarga la página y selecciona una solicitud `account_menu`, `browse` o
   `next` dirigida a `music.youtube.com`.
6. Haz clic derecho sobre ella, elige **Copiar > Copiar como cURL** y pega el
   resultado en Mysic.
7. Pulsa **Verificar y conectar**. Cuando Mysic confirme la conexión, cierra la
   ventana privada.

Mysic extrae la cookie y, si existen, `x-goog-authuser` y `x-goog-pageid`. Primero
comprueba la cuenta activa y el feed de Music. Después cifra esos datos con
AES-256-GCM, vinculados al ID del usuario, antes de guardarlos en MongoDB. La
solicitud cURL completa no se almacena en el navegador ni en la base de datos.

## Configuración del servidor

Define una clave independiente y estable en el gestor de secretos de producción:

```env
YOUTUBE_OAUTH_ENCRYPTION_KEY=una_clave_aleatoria_larga_y_estable
```

Si se omite, Mysic deriva la clave desde `JWT_SECRET`. Cambiar cualquiera de esas
claves hace ilegibles las vinculaciones existentes y obliga a conectar de nuevo.
La sesión solo debe enviarse a Mysic mediante HTTPS; nunca debe ponerse en Vite,
archivos públicos, logs ni respuestas de la API.

`YOUTUBE_COOKIE` y `YOUTUBE_COOKIE_BASE64` quedan solo como compatibilidad para una
cuenta global del servidor. No deben usarse en un despliegue multiusuario porque
todos compartirían la misma personalización.

## Riesgos y límites

- Es una integración no oficial y puede romperse cuando YouTube cambie Innertube.
- La cookie equivale a una sesión activa de Google/YouTube. Usa una cuenta
  secundaria si quieres reducir el impacto de una filtración o bloqueo.
- Cerrar sesión en Google, revocar sesiones o ciertos controles de seguridad puede
  invalidar la vinculación.
- El uso de APIs privadas, la extracción de audio, el bloqueo de anuncios y las
  descargas pueden incumplir los Términos de YouTube. Antes de distribuir o
  monetizar Mysic, revisa los términos y las políticas vigentes:
  <https://developers.google.com/youtube/terms/developer-policies>.
- La API oficial exige usar el reproductor y prohíbe separar audio, descargar o
  habilitar reproducción sin conexión sin aprobación previa. Para una aplicación
  pública que deba cumplir esas políticas, usa YouTube Data API + reproductor
  oficial y limita el alcance a las funciones autorizadas.

## Desvincular

Pulsa **YouTube Music conectado > Desvincular**. Mysic elimina de MongoDB la
sesión cifrada del usuario y descarta el cliente Innertube en memoria. Si también
quieres invalidarla del lado de Google, revoca las sesiones activas desde la
sección de seguridad de tu Cuenta de Google.

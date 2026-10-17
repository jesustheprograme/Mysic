# Mysic

Aplicación React/Vite con API Express, catálogo PostgreSQL, datos de usuario en MongoDB y autenticación por correo/contraseña o Google.

## Inicio rápido

No mezcles datos ni credenciales entre entornos. El repositorio es único, pero cada proceso debe usar el conjunto completo de un solo entorno:

| Recurso | Local | Producción |
| --- | --- | --- |
| PostgreSQL | `mysic_bd_local` | `mysic_bd` |
| MongoDB | `Mysic_local` | `Mysic` |
| Google OAuth | cliente web de localhost | cliente web del dominio publicado |
| Frontend | Vite en `http://localhost:5173` | archivos de `Frontend/dist` detrás de HTTPS |
| API | Express en `http://localhost:4000` | Express en `127.0.0.1:4000` detrás de Nginx |

Para levantar una copia nueva desde cero sigue, en orden, [la guía local](docs/local-development.md). Para publicar o actualizar el servidor sigue [la guía de producción](docs/production-deployment.md). Ambas incluyen comandos de verificación y criterios para detenerse si una dependencia falla.

## Alcance actual de pruebas

Mysic se ejecuta por ahora como entorno local de desarrollo. No necesita reverse proxy: Vite sirve el frontend en el puerto 5173 y Express expone la API en el puerto 4000. El catálogo y el streaming permanecen accesibles sin sesión para simplificar las pruebas de reproducción; antes de publicar el servicio en Internet se debe definir si esos endpoints serán públicos o requerirán autenticación.

Antes de una sesión de prueba ejecuta las verificaciones de cada módulo:

```powershell
cd Frontend
npm run check

cd ..\Backend
npm run check

cd ..\automa_mysic
npm run check
```

La aplicación Tauri todavía usa Node y la carpeta local `automa_mysic`; no se considera un instalador autónomo en esta etapa.

La preparación para publicar la versión web está detallada en [docs/production-deployment.md](docs/production-deployment.md): R2, PostgreSQL, MongoDB, OAuth, systemd, Nginx, HTTPS y pruebas finales.

## Automatización local con n8n

La pantalla **Importar música** permite preparar MP3 desde uno o varios enlaces autorizados mediante n8n, yt-dlp y FFmpeg. El permiso se calcula en el backend a partir de `MUSIC_IMPORT_ADMIN_EMAIL` y una cuenta Google verificada; la opción no aparece para los demás usuarios y la ruta directa vuelve a Inicio. La adquisición se ejecuta localmente, una URL a la vez, y siempre deja los archivos pendientes de análisis y aprobación humana antes de cualquier subida. Consulta [n8n/README.md](n8n/README.md) para instalar dependencias, crear las dos credenciales Header Auth, importar el workflow y usar el iniciador único de Windows.

## YouTube Music

La opción **YouTube Music** del sidebar abre una sección autónoma con búsqueda, sugerencias, páginas de artista y álbum, reproductor y descargas. Consume únicamente la API pública montada en `/api/youtube`; no usa Prisma, PostgreSQL, favoritos, playlists ni el catálogo de Mysic.

El código de `Backend/src/youtube/` y `Frontend/src/features/youtube/` se genera desde el repositorio `youtubei_Mysic` mediante `tools/migrar-a-mysic.mjs` y no se edita manualmente. Sus descargas y cachés se guardan en `Backend/data/youtube/`, ignorada por Git. Puedes cambiar esa ubicación con `YOUTUBE_DATA_DIR`.

El servidor necesita salida a Internet hacia YouTube, Discogs, MusicBrainz y Deezer. La API abre aunque YouTube no esté disponible y reintenta la conexión en segundo plano; las canciones descargadas siguen funcionando sin conexión.

La búsqueda global prioriza el primer contenido visible y completa las secciones secundarias progresivamente. Las consultas recientes se conservan en `Backend/data/youtube/cache/search/`, por lo que una búsqueda aprendida puede responder inmediatamente incluso después de reiniciar el backend; los datos anteriores se actualizan en segundo plano.

## Configuración resumida

1. Copia `Backend/.env.example` como `Backend/.env`. El ejemplo apunta deliberadamente a `mysic_bd_local` y `Mysic_local`.
2. Coloca un `MONGODB_URI` valido de Atlas y genera un `JWT_SECRET` de 32 caracteres o mas.
   `MUSIC_IMPORT_ADMIN_EMAIL` identifica el correo Google verificado con acceso a Importar música.
3. Copia `Frontend/.env.example` como `Frontend/.env`.
4. Para Google, crea clientes OAuth de tipo **Aplicacion web** separados para local y producción.
   - En local, usa el cliente local en `Backend/.env`: `GOOGLE_CLIENT_ID` y en `Frontend/.env.development.local`: `VITE_GOOGLE_CLIENT_ID`.
   - En producción, usa el cliente desplegado en `Backend/.env`: `GOOGLE_CLIENT_ID` y al compilar el frontend: `VITE_GOOGLE_CLIENT_ID`.
   - `Backend/.env`: `GOOGLE_CLIENT_IDS` puede incluir ambos IDs separados por comas. El primero no reemplaza `GOOGLE_CLIENT_ID`; ambos se aceptan.
   La aplicacion de escritorio abre el acceso seguro del dominio web y reutiliza el cliente OAuth web; no necesita un segundo cliente de escritorio.
5. En Google Cloud agrega los origenes JavaScript que uses, por ejemplo:
   - `http://localhost:5173`
   - `http://127.0.0.1:5173`
   - `http://localhost:5174`
   - `http://127.0.0.1:5174`
   - `http://tauri.localhost` (aplicacion de escritorio instalada)
   El navegador vuelve a la aplicacion mediante un callback local en `http://127.0.0.1:14523`; la credencial viaja directamente desde la pagina de Mysic al proceso local y esa URL no se registra como redireccion OAuth en Google.

No incluyas rutas como `/login` en los origenes autorizados. Si la contrasena de Atlas contiene caracteres especiales, codificalos en formato URL.

## Ejecución diaria local

```powershell
cd Backend
npm ci
npx prisma migrate deploy
npm run dev
```

En otra terminal:

```powershell
cd Frontend
npm ci
npm run dev
```

El backend usa por defecto `http://localhost:4000` y el frontend la URL que muestre Vite.

## API de autenticacion

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/google`
- `GET /api/auth/me`
- `POST /api/auth/logout`

La sesion se almacena en una cookie `HttpOnly`; las contrasenas se guardan con bcrypt y nunca se devuelven al navegador.

La variable `MUSIC_IMPORT_ADMIN_EMAIL` define la cuenta autorizada para importar música. Esa cuenta debe autenticarse con Google y tener el correo verificado; el frontend no decide quién es administrador por un valor editable del navegador.

## Catálogo musical desde FileZilla

PostgreSQL ignora las etiquetas ID3 de Navidrome. La estructura remota define artista, lanzamiento, título y orden dentro de cada carpeta física. Los recopilatorios pueden definir un orden independiente en `Backend/catalog/album-links.json`:

```text
/music/
  Artistas/
    Ado/
      Albums/
        Nombre del album/
          01 - Cancion.mp3
          02 - Otra cancion.mp3
      Singles/
        Nombre del sencillo/
          01 - Cancion.mp3
          02 - Otra cancion del mismo sencillo.mp3
```

Navidrome solo aporta el identificador usado para reproducir cada MP3. Configura `DATABASE_URL`, `NAVIDROME_*` y estas variables en `Backend/.env`:

```env
MUSIC_SSH_HOST=servidor
MUSIC_SSH_USER=usuario_ssh
MUSIC_SSH_KEY_PATH=C:\\Users\\usuario\\.ssh\\id_ed25519
MUSIC_SSH_ROOT=/music
```

Configura la instancia remota únicamente mediante `Backend/.env`:

```text
Host: <servidor>
Usuario SSH: <usuario>
Instancia: <nombre-de-instancia>
Clave local: <ruta-local-a-la-clave>
Raíz musical remota: /music
```

La clave privada no se guarda en el repositorio ni en esta documentación.

Después de subir o reorganizar canciones en FileZilla, revisa primero la vista previa:

```powershell
cd Backend
npm.cmd run music:filezilla
```

Si no aparece ninguna canción bajo `Sin ID de reproducción`, actualiza PostgreSQL:

```powershell
npm.cmd run music:filezilla:apply
```

El proceso puede repetirse después de cada cambio. No mueve, renombra ni elimina MP3. Los archivos fuera de `Artistas/` se omiten. El frontend consulta únicamente `/api/catalog`; las credenciales y la reproducción de Navidrome permanecen en el backend.

`Adoのベストアドバム` se muestra como una sola lista del 1 al 40. Solo `ロックスター` y `Hello Signals` tienen MP3 dentro de su carpeta; las otras 38 canciones se vinculan desde álbumes o sencillos sin copiar audio. Su orden no depende del nombre de los MP3 fuente: por ejemplo, la pista 06 (`unravel`) usa la pista 08 de `Ado's Utattemita Album`, y la pista 14 (`Episode X`) usa la pista 01 de su carpeta en `Singles/`. Tras cada cambio en FileZilla, `music:filezilla:apply` actualiza también estos enlaces.

## Imágenes desde Cloudinary

FileZilla/Oracle sigue siendo la fuente de los MP3. Las imágenes se leen de Cloudinary mediante su API de administración, sin copiar canciones ni duplicar carpetas en Oracle. Crea `Backend/.env.cloudinary` con `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` y `CLOUDINARY_FOLDER_MODE=dynamic` (o `fixed` si la cuenta usa carpetas antiguas). Este archivo queda ignorado por Git; nunca pongas el secreto en `Frontend/.env`.

Organiza las imágenes en la biblioteca de Cloudinary así:

```text
Artistas/
  Ado/
    Perfil/
      retrato1.jpg
      retrato2.jpg
    Albums/
      Nombre del album/
        portada.jpg
    Singles/
      Nombre del sencillo/
        portada.jpg
```

Las imágenes de `Perfil/` se muestran juntas en la página del artista. Cada carpeta de álbum o sencillo admite una portada; si contiene varias imágenes, se elige la que empiece por `cover` o `portada`, o la primera por nombre. Los nombres de artista y lanzamiento deben coincidir con los del catálogo musical.

Después de subir imágenes, revisa la vista previa y vincúlalas con:

```powershell
cd Backend
npm.cmd run music:cloudinary
npm.cmd run music:cloudinary:apply
```

Si una portada aparece como «Álbum todavía no catalogado», primero cataloga los MP3 de ese lanzamiento mediante `music:filezilla:apply` y vuelve a ejecutar `music:cloudinary:apply`. El proceso de imágenes no sube ni borra archivos en Cloudinary.

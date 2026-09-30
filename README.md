# Mysic

Aplicacion React con autenticacion mediante correo/contrasena o Google y sesiones persistentes en MongoDB.

## Automatización local con n8n

La pantalla **Importar música** permite preparar MP3 desde uno o varios enlaces autorizados mediante n8n, yt-dlp y FFmpeg. La adquisición se ejecuta localmente, una URL a la vez, y siempre deja los archivos pendientes de análisis y aprobación humana antes de cualquier subida. Consulta [n8n/README.md](n8n/README.md) para instalar dependencias, crear las dos credenciales Header Auth, importar el workflow y usar el iniciador único de Windows.

## Configuracion

1. Copia `Backend/.env.example` como `Backend/.env`.
2. Coloca un `MONGODB_URI` valido de Atlas y genera un `JWT_SECRET` de 32 caracteres o mas.
3. Copia `Frontend/.env.example` como `Frontend/.env`.
4. Para Google, crea un cliente OAuth de tipo **Aplicacion web** y usa el mismo ID en:
   - `Backend/.env`: `GOOGLE_CLIENT_ID`
   - `Frontend/.env`: `VITE_GOOGLE_CLIENT_ID`
   Para la aplicacion de escritorio crea tambien un cliente OAuth de tipo **Aplicacion de escritorio** y configura su ID en `VITE_GOOGLE_DESKTOP_CLIENT_ID`. Agregalo a `GOOGLE_CLIENT_IDS` en el backend junto al ID web.
5. En Google Cloud agrega los origenes JavaScript que uses, por ejemplo:
   - `http://localhost:5173`
   - `http://127.0.0.1:5173`
   - `http://localhost:5174`
   - `http://127.0.0.1:5174`
   - `http://tauri.localhost` (aplicacion de escritorio instalada)
   Para el flujo desktop con navegador del sistema, agrega tambien `http://127.0.0.1:14523` en **URIs de redireccionamiento autorizados** si reutilizas el cliente web. El cliente desktop de Google puede usar el mismo callback loopback sin registrar un puerto fijo.

No incluyas rutas como `/login` en los origenes autorizados. Si la contrasena de Atlas contiene caracteres especiales, codificalos en formato URL.

## Ejecucion

```powershell
cd Backend
npm install
npm run dev
```

En otra terminal:

```powershell
cd Frontend
npm install
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

Referencia de la instancia Oracle Cloud usada por este proyecto:

```text
Host: 155.181.37.222
Usuario SSH: ubuntu
Instancia: instance-20260908-0948
Clave local: C:\Users\JOSE.LAPTOP-SNQTVDID\Downloads\oraclekey.key
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

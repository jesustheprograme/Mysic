# Despliegue de Mysic

Esta guía parte de un servidor Linux con dominio propio. El frontend y la API se publican en el mismo dominio; el audio se entrega desde Cloudflare R2.

## 1. Recursos que debes crear

1. Un servidor Linux para Nginx, Node.js y los archivos compilados de React.
2. Una base PostgreSQL administrada con soporte para la extensión `pg_trgm`.
3. Una base MongoDB. El proyecto todavía usa MongoDB para usuarios, favoritos, playlists y vistas del spotlight.
4. Un bucket Cloudflare R2 para audio.
5. Un dominio para la aplicación, por ejemplo `music.example.com`.
6. Opcionalmente, un subdominio público para audio, por ejemplo `audio.example.com`.

## 2. Configuración de R2

1. Crea un bucket llamado, por ejemplo, `mysic-audio`.
2. Crea un token S3 limitado a lectura y escritura sobre ese bucket. No uses un token de cuenta global.
3. Decide el modo de entrega:
   - Catálogo público: conecta `audio.example.com` como Custom Domain del bucket y configura `AUDIO_CDN_BASE_URL=https://audio.example.com`.
   - Catálogo privado: deja `AUDIO_CDN_BASE_URL` vacío. La API generará URLs S3 temporales. Este modo protege mejor el audio, pero no usa el Custom Domain como CDN.
4. Configura CORS en el bucket para permitir `GET` y `HEAD` desde `https://music.example.com`. Permite la cabecera `Range` y expón `Accept-Ranges`, `Content-Length`, `Content-Range` y `Content-Type`.
5. Si usas el dominio público, crea una regla de caché para `audio.example.com/audio/*`. Los objetos se suben con `Cache-Control: public, max-age=31536000, immutable`.

Variables necesarias:

```dotenv
OBJECT_STORAGE_ENDPOINT=https://ACCOUNT_ID.r2.cloudflarestorage.com
OBJECT_STORAGE_REGION=auto
OBJECT_STORAGE_BUCKET=mysic-audio
OBJECT_STORAGE_ACCESS_KEY_ID=...
OBJECT_STORAGE_SECRET_ACCESS_KEY=...
AUDIO_CDN_BASE_URL=https://audio.example.com
AUDIO_URL_TTL_SECONDS=900
```

Para migrar los MP3 locales, primero ejecuta la vista previa y revisa cada destino:

```bash
cd Backend
npm run music:storage
npm run music:storage:apply
```

El comando actualiza PostgreSQL solamente después de que cada subida termina correctamente. No elimina los archivos locales.

## 3. Bases de datos y secretos

Mantén un solo repositorio, pero separa la configuración y los datos de desarrollo y producción. Como mínimo, cada entorno debe tener su propio `DATABASE_URL`, base o cluster MongoDB, cliente OAuth y credenciales de almacenamiento. No conectes el backend local a una base MongoDB de producción mientras usa un PostgreSQL local: las playlists pueden guardar referencias a entidades de catálogo que solo existen en uno de los dos PostgreSQL.

La convención de este proyecto es `mysic_bd_local`/`Mysic_local` en local y `mysic_bd`/`Mysic` en producción. En el frontend, guarda el cliente OAuth desplegado en `.env` y el cliente local únicamente en `.env.development.local`; Vite no debe usar el cliente local durante `npm run build`.

Copia `Backend/.env.example` como `Backend/.env` y completa al menos:

```dotenv
NODE_ENV=production
API_BIND_HOST=127.0.0.1
PORT=4000
# Nginx directo: 1. Cloudflare -> Nginx -> Express: normalmente 2.
TRUST_PROXY=1
FRONTEND_ORIGINS=https://music.example.com
DATABASE_URL=postgresql://...
MONGODB_URI=mongodb+srv://...
MONGODB_DB_NAME=Mysic
JWT_SECRET=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_IDS=...
MUSIC_IMPORT_ADMIN_EMAIL=jesusobregon2010@gmail.com
```

Genera `JWT_SECRET` con un generador criptográfico; debe tener al menos 32 caracteres y no debe guardarse en Git. Después aplica las migraciones:

```bash
cd Backend
npm ci
npx prisma migrate deploy
npm run check
```

La migración de rendimiento crea la extensión `pg_trgm`. Si el proveedor no permite `CREATE EXTENSION`, actívala desde su panel o solicita que la habiliten antes de ejecutar `prisma migrate deploy`.

## 4. Google OAuth

En Google Cloud Console:

1. Añade `https://music.example.com` a los orígenes JavaScript autorizados del cliente web.
2. La aplicacion Tauri abre `https://music.example.com/#/desktop-auth` en el navegador del sistema y reutiliza el cliente web autorizado.
3. Coloca el cliente web en `VITE_GOOGLE_CLIENT_ID` al compilar React y en `GOOGLE_CLIENT_ID` del backend.

La cuenta configurada en `MUSIC_IMPORT_ADMIN_EMAIL` debe iniciar sesión con Google y tener el correo verificado. El backend deriva el permiso de esa identidad validada; las cuentas de contraseña no verificadas no reciben acceso al importador.

La importación de archivos todavía ejecuta comandos IPC locales de Tauri. La navegación de la aplicación queda restringida por la sesión, pero un usuario con acceso al equipo y herramientas de desarrollo podría invocar esos comandos fuera de la interfaz. Antes de distribuir el cliente a usuarios no confiables, exige una capacidad de corta duración emitida por el backend y validada en Rust para cada comando privilegiado, o mueve esas operaciones a endpoints autenticados del backend; no incluyas credenciales de SSH/n8n en clientes distribuidos.

## 5. Verificación previa a cualquier cambio

Antes de migrar o reiniciar servicios, confirma explícitamente el destino. No continúes si algún valor termina en `_local`:

```bash
grep '^NODE_ENV=' Backend/.env
grep '^DATABASE_URL=' Backend/.env | sed 's#://[^@]*@#://***@#'
grep '^MONGODB_DB_NAME=' Backend/.env
grep '^FRONTEND_ORIGINS=' Backend/.env
```

Haz un respaldo de PostgreSQL y MongoDB con las herramientas del proveedor. Conserva además una copia de la versión web anterior para poder revertirla.

## 6. Compilar frontend

No configures `VITE_API_URL` para la versión web si Nginx publica `/api` en el mismo dominio.

```bash
cd Frontend
npm ci
VITE_GOOGLE_CLIENT_ID=CLIENTE_WEB_PRODUCCION.apps.googleusercontent.com npm run build
test -f dist/index.html
sudo mkdir -p /srv/mysic/frontend
sudo cp -R dist/. /srv/mysic/frontend/
```

## 7. API como servicio

Usa `deploy/systemd/mysic-api.service.template` como base:

1. Reemplaza `__SERVICE_USER__` y `__PROJECT_ROOT__`.
2. Guárdalo como `/etc/systemd/system/mysic-api.service`.
3. Ejecuta:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now mysic-api
sudo systemctl status mysic-api
curl http://127.0.0.1:4000/api/health/ready
```

## 8. Nginx y HTTPS

Usa `deploy/nginx/mysic.conf.template`:

1. Reemplaza `__DOMAIN__` y `__FRONTEND_ROOT__`.
2. Instala el archivo en `/etc/nginx/sites-available/mysic` y habilítalo en `sites-enabled`.
3. Obtén un certificado con Certbot o instala un certificado de origen de Cloudflare.
4. Verifica y recarga:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

Mantén el puerto 4000 cerrado en el firewall. Solo Nginx debe poder alcanzarlo por `127.0.0.1`.

## 9. DNS y Cloudflare

1. Crea el registro de `music.example.com` apuntando al servidor.
2. Activa el proxy de Cloudflare si lo usarás.
3. Mantén SSL/TLS en modo `Full (strict)`.
4. No uses el modo Flexible.
5. Configura una comprobación de disponibilidad contra `/api/health/ready`.
6. Si Cloudflare y Nginx quedan ambos delante de Express, verifica la IP observada por la API y usa el número exacto de saltos confiables en `TRUST_PROXY` —normalmente `2`. Restringe el acceso directo al origen para evitar cabeceras reenviadas falsificadas.

## 10. Verificación final

Comprueba:

```bash
curl -I https://music.example.com/
curl https://music.example.com/api/health
curl https://music.example.com/api/health/ready
curl -I -H 'Range: bytes=0-1023' https://music.example.com/api/catalog/media/ASSET_ID/stream
```

La última petición debe responder `206`, `Accept-Ranges: bytes` y un `Content-Range` válido. Prueba además registro, Google OAuth, favoritos, playlists, búsqueda, cambio automático de canción y reproducción desde una conexión móvil.

## 11. Secuencia para actualizaciones posteriores

Ejecuta una acción por vez y comprueba su salida:

```bash
git fetch origin
git switch Mysic_produc-demo_0.1
git pull --ff-only

cd Backend
npm ci
npx prisma migrate deploy
npm run check
sudo systemctl restart mysic-api
curl http://127.0.0.1:4000/api/health/ready

cd ../Frontend
npm ci
VITE_GOOGLE_CLIENT_ID=CLIENTE_WEB_PRODUCCION.apps.googleusercontent.com npm run build
sudo rsync -a --delete dist/ /srv/mysic/frontend/
sudo nginx -t
sudo systemctl reload nginx
```

Termina con las cuatro peticiones de la sección anterior. Si la API nueva no queda lista, revisa `journalctl -u mysic-api` y revierte el código/servicio antes de publicar el frontend nuevo. Las migraciones destructivas requieren un plan de reversión específico; no supongas que cambiar de commit deshace datos.

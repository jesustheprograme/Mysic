# Inicialización local de Mysic

Esta guía prepara una copia local sin tocar las bases ni las credenciales de producción. Ejecuta cada paso por separado y continúa solo cuando su verificación sea correcta.

## 1. Requisitos

Instala Git, Node.js con npm y PostgreSQL. Necesitas además acceso a MongoDB Atlas y un cliente OAuth 2.0 web exclusivo para localhost.

Comprueba las herramientas desde PowerShell:

```powershell
git --version
node --version
npm --version
psql --version
```

## 2. Obtener el código

```powershell
git clone https://github.com/jesustheprograme/Mysic.git
cd Mysic
git switch Mysic_produc-demo_0.1
```

Si ya tienes el repositorio:

```powershell
git fetch origin
git switch Mysic_produc-demo_0.1
git pull --ff-only
```

Verificación:

```powershell
git status --short --branch
```

La primera línea debe indicar `Mysic_produc-demo_0.1`.

## 3. Crear PostgreSQL local

Comprueba primero si la base existe:

```powershell
psql -U postgres -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='mysic_bd_local'"
```

Si no devuelve `1`, créala:

```powershell
psql -U postgres -d postgres -c "CREATE DATABASE mysic_bd_local"
```

No borres ni renombres `mysic_bd`: esa base queda reservada para producción.

## 4. Preparar MongoDB local

En Atlas usa el deployment local ya creado y la base `Mysic_local`. Crea un usuario limitado a ese deployment/base, autoriza la IP de desarrollo y copia su URI de conexión. No reutilices el usuario administrativo de producción.

La base puede aparecer vacía hasta el primer registro o inicio de sesión; MongoDB crea las colecciones al escribir el primer documento.

## 5. Configurar el backend

```powershell
Copy-Item Backend\.env.example Backend\.env
```

Edita `Backend/.env` y sustituye únicamente los marcadores. Como mínimo verifica:

```dotenv
NODE_ENV=development
API_BIND_HOST=0.0.0.0
PORT=4000
TRUST_PROXY=
FRONTEND_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
DATABASE_URL=postgresql://postgres:TU_PASSWORD@localhost:5432/mysic_bd_local?schema=public
MONGODB_URI=mongodb+srv://USUARIO:PASSWORD@HOST_LOCAL/?retryWrites=true&w=majority
MONGODB_DB_NAME=Mysic_local
JWT_SECRET=UNA_CADENA_ALEATORIA_DE_32_CARACTERES_O_MAS
GOOGLE_CLIENT_ID=CLIENTE_WEB_LOCAL.apps.googleusercontent.com
GOOGLE_CLIENT_IDS=CLIENTE_WEB_LOCAL.apps.googleusercontent.com
```

Reglas:

- Codifica los caracteres especiales del usuario o contraseña dentro de una URL.
- No copies `DATABASE_URL`, `MONGODB_URI`, `JWT_SECRET` ni el cliente principal de producción.
- `Backend/.env` está ignorado por Git; confirma que nunca se añadirá:

```powershell
git check-ignore Backend/.env
```

## 6. Configurar Google OAuth local

En el cliente web local de Google Cloud agrega estos orígenes JavaScript autorizados:

```text
http://localhost:5173
http://127.0.0.1:5173
```

No agregues `/login`, rutas ni parámetros. El ID usado por frontend y backend debe ser el mismo cliente local.

## 7. Configurar el frontend

```powershell
Copy-Item Frontend\.env.example Frontend\.env
@"
VITE_API_URL=http://localhost:4000/api
VITE_GOOGLE_CLIENT_ID=CLIENTE_WEB_LOCAL.apps.googleusercontent.com
"@ | Set-Content Frontend\.env.development.local
```

`Frontend/.env.development.local` tiene prioridad durante `npm run dev` y está ignorado por Git. No pongas secretos en variables `VITE_*`: Vite las entrega al navegador. El ID OAuth no es secreto, pero debe corresponder al entorno.

## 8. Instalar dependencias y migrar

```powershell
cd Backend
npm ci
npx prisma generate
npx prisma migrate deploy
npm run check

cd ..\Frontend
npm ci
npm run check

cd ..\automa_mysic
npm ci
npm run check

cd ..
```

Si una migración falla, no inicies la aplicación hasta corregir `DATABASE_URL`, permisos o la extensión requerida por PostgreSQL.

## 9. Iniciar la aplicación

Terminal 1:

```powershell
cd Backend
npm run dev
```

Terminal 2:

```powershell
cd Frontend
npm run dev
```

## 10. Verificar la ejecución

```powershell
Invoke-RestMethod http://localhost:4000/api/health
Invoke-RestMethod http://localhost:4000/api/health/ready
```

Abre `http://localhost:5173` y comprueba en este orden:

1. Registro o acceso con correo.
2. Acceso con el cliente Google local.
3. Creación de una playlist.
4. Recarga del navegador y persistencia de la sesión.
5. Consulta y reproducción de una canción disponible.

`/api/health/ready` debe responder correctamente antes de diagnosticar el frontend; valida conexiones reales a PostgreSQL y MongoDB.

## 11. Reinicio diario

En días posteriores no recrees bases ni reinstales dependencias salvo que cambien los lockfiles:

```powershell
git pull --ff-only
cd Backend
npx prisma migrate deploy
npm run dev
```

En otra terminal:

```powershell
cd Frontend
npm run dev
```

## 12. Qué no se comparte entre entornos

- PostgreSQL, MongoDB y sus usuarios.
- Cliente Google OAuth y orígenes permitidos.
- `JWT_SECRET`, cookies y sesiones.
- Credenciales de R2/Cloudinary, SSH y servicios externos.
- Archivos `.env`, respaldos, instaladores y paquetes de despliegue.

Sí se comparten el código, `package-lock.json`, el esquema Prisma y sus migraciones. Esta separación evita que una playlist local guarde identificadores de un catálogo PostgreSQL de producción incompatible.

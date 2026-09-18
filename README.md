# Mysic

Aplicacion React con autenticacion mediante correo/contrasena o Google y sesiones persistentes en MongoDB.

## Configuracion

1. Copia `Backend/.env.example` como `Backend/.env`.
2. Coloca un `MONGODB_URI` valido de Atlas y genera un `JWT_SECRET` de 32 caracteres o mas.
3. Copia `Frontend/.env.example` como `Frontend/.env`.
4. Para Google, crea un cliente OAuth de tipo **Aplicacion web** y usa el mismo ID en:
   - `Backend/.env`: `GOOGLE_CLIENT_ID`
   - `Frontend/.env`: `VITE_GOOGLE_CLIENT_ID`
5. En Google Cloud agrega los origenes JavaScript que uses, por ejemplo:
   - `http://localhost:5173`
   - `http://127.0.0.1:5173`
   - `http://localhost:5174`
   - `http://127.0.0.1:5174`

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

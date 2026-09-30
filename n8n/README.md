# Configurar n8n para Mysic

El workflow `mysic-acquisition-workflow.json` coordina el worker local. No descarga ni etiqueta archivos por sí mismo y no contiene secretos.

## 1. Instalar y preparar

```powershell
npm install -g n8n
Copy-Item .\automa_mysic\.env.example .\automa_mysic\.env
```

Edita `automa_mysic/.env` y reemplaza los dos tokens de ejemplo por valores largos y distintos. También deben estar instalados y disponibles en `PATH`: `node`, `python`, `yt-dlp`, `ffmpeg` y `ffprobe`.

Puedes generar cada token con:

```powershell
[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLower()
```

## 2. Crear las credenciales en n8n

Inicia temporalmente n8n con `n8n start`, abre `http://127.0.0.1:5678` y crea la cuenta local inicial. Después crea dos credenciales de tipo **Header Auth**:

1. `Mysic webhook token`
   - Name: `Authorization`
   - Value: `Bearer VALOR_DE_MYSIC_N8N_TOKEN`
2. `Mysic worker token`
   - Name: `Authorization`
   - Value: `Bearer VALOR_DE_ACQUISITION_WORKER_TOKEN`

Importa `n8n/mysic-acquisition-workflow.json`. Abre los tres nodos Webhook y selecciona `Mysic webhook token`; abre los cuatro nodos HTTP Request y selecciona `Mysic worker token`.

## 3. Verificar y activar

1. Ejecuta `scripts/start-mysic-automation.ps1 -SkipDesktop`.
2. En n8n, ejecuta el workflow manualmente y comprueba que no haya credenciales pendientes.
3. Activa el workflow. Mysic usa las URL de producción `/webhook/...`, por lo que debe estar activo.
4. Cierra el script con Ctrl+C.
5. En usos normales ejecuta `scripts/start-mysic-automation.ps1` para iniciar worker, n8n y Mysic juntos.

Los enlaces solo preparan archivos. La identificación, revisión, vista previa y subida siguen requiriendo las acciones correspondientes dentro de Mysic.

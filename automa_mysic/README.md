# Automa Mysic

Esta carpeta contiene el importador local de canciones. No necesita n8n ni OpenAI: identifica el MP3 con AcoustID/MusicBrainz, toma la portada de la carpeta exacta de Cloudinary, etiqueta el archivo y lo mueve a la biblioteca musical.

Opcionalmente, n8n y el worker local pueden preparar MP3 desde enlaces de contenido propio, libre o autorizado. Mysic nunca importa ni sube estos archivos automáticamente: primero aparecen como pendientes y conservan el flujo de revisión descrito abajo. La configuración completa está en `../n8n/README.md`.

## Preparar una canción

1. Coloca el MP3 dentro de `automa_mysic/asignar_metadatos/`.
2. Sube manualmente la portada a Cloudinary.
3. Edita `automa_mysic/asignar_metadatos/import.json`:

```json
{
  "imports": [
    {
      "file": "ado-show.mp3",
      "cloudinaryFolder": "Artistas/Ado/Singles/Show"
    }
  ]
}
```

MusicBrainz completa artista, título, lanzamiento, año, géneros y número de pista. `cloudinaryFolder` debe coincidir exactamente con la carpeta donde subiste la portada. Se prefiere una imagen llamada `portada` o `cover`; si no existe, se elige la primera imagen por nombre.

Cada canción conserva como máximo dos géneros. Se priorizan los géneros oficiales de MusicBrainz con más votos y solo se usan etiquetas libres para completar espacios faltantes. Ambos valores se escriben en las etiquetas ID3 del MP3.

Si ya conoces el recording ID de MusicBrainz puedes añadirlo para saltar AcoustID:

```json
{
  "imports": [{
    "file": "ado-show.mp3",
    "musicbrainzRecordingId": "ID-DE-LA-GRABACION",
    "cloudinaryFolder": "Artistas/Ado/Singles/Show"
  }]
}
```

## Ejecutar

Desde PowerShell:

```powershell
cd C:\Users\JOSE.LAPTOP-SNQTVDID\Desktop\MUSICAL\automa_mysic
npm install
npm run preview
npm run import -- --sync-catalog
```

Para iniciar el worker, n8n y la aplicación de escritorio con un solo script:

```powershell
cd C:\Users\JOSE.LAPTOP-SNQTVDID\Desktop\MUSICAL
.\scripts\start-mysic-automation.ps1
```

`npm run preview` verifica el manifiesto, identifica la canción y comprueba la portada sin mover ni modificar archivos. La aplicación de escritorio también inspecciona el destino SSH durante esta vista previa. `npm run import` procesa las canciones. La opción `--sync-catalog` ejecuta los sincronizadores existentes del backend para registrar la canción y enlazar la imagen en el catálogo.

## Configuración

El importador reutiliza `Backend/.env` para `MUSIC_LIBRARY_PATH` y `Backend/.env.cloudinary` para las credenciales de Cloudinary. Si no existe `MUSIC_LIBRARY_PATH`, usa `automa_mysic/biblioteca` como biblioteca local.

Para identificar automáticamente las canciones, añade a `Backend/.env`:

```env
FPCALC_PATH=C:\Program Files\MusicBrainz Picard\fpcalc.exe
PICARD_PATH=C:\Program Files\MusicBrainz Picard\picard.exe
METADATA_ENGINE=musicbrainz
ACOUSTID_API_KEY=tu_clave_de_AcoustID
ACOUSTID_MIN_SCORE=0.85
MUSICBRAINZ_USER_AGENT=AutomaMysic/1.0 (tu-correo-o-url)
```

`fpcalc.exe` viene con MusicBrainz Picard. Picard no necesita estar abierto. Si la coincidencia de AcoustID queda por debajo del umbral, la entrada falla y el MP3 permanece en `asignar_metadatos` para evitar etiquetar una canción incorrectamente.

Para utilizar directamente la selección de lanzamientos de Picard, cambia `METADATA_ENGINE=picard`. La automatización ejecuta `SCAN` y `SAVE_MATCHED` sobre una copia temporal, lee las etiquetas resultantes y descarta la copia. El MP3 original no se modifica durante el análisis.

Los archivos importados se organizan bajo `MUSIC_LIBRARY_PATH` como `Artistas/Artista/Albums/Album/01 - Canción.mp3` o `Artistas/Artista/Singles/Single/01 - Canción.mp3`. El botón **Eliminar** de la tabla borra tanto la fila como la copia todavía preparada en `asignar_metadatos`; nunca borra una canción ya movida a la biblioteca.

La aplicación calcula automáticamente esa misma carpeta para Cloudinary y para `MUSIC_SSH_ROOT`. Al importar desde la interfaz, crea la carpeta remota si falta y transmite el MP3 por SSH a un archivo temporal `.part`. Después verifica SHA-256 y lo renombra de forma atómica. Si el destino ya existe, la operación se detiene sin sobrescribirlo; si la subida falla, conserva el MP3 de entrada para reintentar.

Después de importar, el catálogo y las portadas se sincronizan incluso si el MP3 ya estaba marcado como procesado. La interfaz vuelve a consultar PostgreSQL inmediatamente, por lo que la canción aparece sin reiniciar Mysic.

Cuando MusicBrainz ofrece un alias latino oficial para un lanzamiento japonés, el álbum se guarda como `Título japonés (Romanización)`. Si ya contiene una romanización entre paréntesis o no existe un alias fiable, el título original se conserva.

El nombre de cada MP3 japonés sigue `NN - Título japonés (Romanización).mp3`. La romanización se obtiene, en orden, de los alias oficiales de la grabación, de la obra o del lanzamiento cuando la canción y el single comparten nombre. Si MusicBrainz no ofrece un alias fiable, la fila se bloquea para que se escriba la romanización manualmente; nunca se inventa una transliteración.

Después de procesar una entrada, se registra su hash en `asignar_metadatos/.state.json`. Puedes dejar las entradas en `import.json`: las ya procesadas se omitirán mientras no cambien.

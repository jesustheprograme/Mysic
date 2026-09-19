# Automa Mysic

Esta carpeta contiene el importador local de canciones. No necesita n8n ni OpenAI: identifica el MP3 con AcoustID/MusicBrainz, toma la portada de la carpeta exacta de Cloudinary, etiqueta el archivo y lo mueve a la biblioteca musical.

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

`npm run preview` verifica el manifiesto, identifica la canción y comprueba la portada sin mover ni modificar archivos. `npm run import` procesa las canciones. La opción `--sync-catalog` ejecuta los sincronizadores existentes del backend para registrar la canción y enlazar la imagen en el catálogo.

## Configuración

El importador reutiliza `Backend/.env` para `MUSIC_LIBRARY_PATH` y `Backend/.env.cloudinary` para las credenciales de Cloudinary. Si no existe `MUSIC_LIBRARY_PATH`, usa `automa_mysic/biblioteca` como biblioteca local.

Para identificar automáticamente las canciones, añade a `Backend/.env`:

```env
FPCALC_PATH=C:\Program Files\MusicBrainz Picard\fpcalc.exe
ACOUSTID_API_KEY=tu_clave_de_AcoustID
ACOUSTID_MIN_SCORE=0.85
MUSICBRAINZ_USER_AGENT=AutomaMysic/1.0 (tu-correo-o-url)
```

`fpcalc.exe` viene con MusicBrainz Picard. Picard no necesita estar abierto. Si la coincidencia de AcoustID queda por debajo del umbral, la entrada falla y el MP3 permanece en `asignar_metadatos` para evitar etiquetar una canción incorrectamente.

Después de procesar una entrada, se registra su hash en `asignar_metadatos/.state.json`. Puedes dejar las entradas en `import.json`: las ya procesadas se omitirán mientras no cambien.

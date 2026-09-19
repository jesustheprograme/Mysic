# Automa Mysic

Esta carpeta contiene el importador local de canciones. No necesita n8n ni OpenAI: lee `asignar_metadatos/import.json`, toma la portada de la carpeta exacta de Cloudinary, etiqueta el MP3 y lo mueve a la biblioteca musical.

## Preparar una canción

1. Coloca el MP3 dentro de `automa_mysic/asignar_metadatos/`.
2. Sube manualmente la portada a Cloudinary.
3. Edita `automa_mysic/asignar_metadatos/import.json`:

```json
{
  "imports": [
    {
      "file": "ado-show.mp3",
      "artist": "Ado",
      "title": "Show",
      "kind": "single",
      "releaseName": "Show",
      "year": 2023,
      "genres": ["J-Pop", "Rock"],
      "trackNumber": 1,
      "cloudinaryFolder": "Artistas/Ado/Singles/Show"
    }
  ]
}
```

`cloudinaryFolder` debe coincidir exactamente con la carpeta donde subiste la portada. Se prefiere una imagen llamada `portada` o `cover`; si no existe, se elige la primera imagen por nombre.

## Ejecutar

Desde PowerShell:

```powershell
cd C:\Users\JOSE.LAPTOP-SNQTVDID\Desktop\MUSICAL\automa_mysic
npm install
npm run preview
npm run import -- --sync-catalog
```

`npm run preview` verifica el manifiesto y la portada sin mover ni modificar archivos. `npm run import` procesa las canciones. La opción `--sync-catalog` ejecuta los sincronizadores existentes del backend para registrar la canción y enlazar la imagen en el catálogo.

## Configuración

El importador reutiliza `Backend/.env` para `MUSIC_LIBRARY_PATH` y `Backend/.env.cloudinary` para las credenciales de Cloudinary. Si no existe `MUSIC_LIBRARY_PATH`, usa `automa_mysic/biblioteca` como biblioteca local.

Después de procesar una entrada, se registra su hash en `asignar_metadatos/.state.json`. Puedes dejar las entradas en `import.json`: las ya procesadas se omitirán mientras no cambien.

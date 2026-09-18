# Diseno: importacion de musica con `import.json`

## Objetivo

Incorporar canciones nuevas al catalogo sin usar MusicBrainz Picard. La persona que administra el catalogo coloca el MP3 en una carpeta de entrada y completa un archivo `import.json`. Ese archivo es la fuente de verdad para los metadatos y para elegir una carpeta de Cloudinary que ya contiene la portada subida manualmente.

El proceso debe etiquetar el MP3, colocar el archivo en la estructura musical existente, asociar en la base de datos la imagen encontrada en la carpeta de Cloudinary y dejar la cancion disponible para el servicio de streaming.

## Alcance

- Se agregara una carpeta local `Asignar_metadatos` en el backend para los MP3 pendientes y su `import.json`.
- Cada entrada del JSON referira un MP3 por nombre de archivo y definira: artista, titulo, tipo (`album` o `single`), album cuando aplique, anio, generos y numero de pista.
- Cada entrada incluira `cloudinaryFolder`, una ruta elegida manualmente por la persona administradora. Ejemplos:
  - `Artistas/Ado/Albums/Zanmu`
  - `Artistas/Ado/Singles/Show`
- El importador verificara el JSON, la existencia del MP3 y que la carpeta de Cloudinary tenga una imagen. No creara carpetas ni subira portadas a Cloudinary.
- El importador escribira los metadatos en el MP3 y le incorporara la portada encontrada solo cuando el archivo no tenga una imagen propia.
- Segun el tipo, movera el resultado a la estructura que ya usa el proyecto:
  - `Artistas/<artista>/Albums/<album>/<pista> - <titulo>.mp3`
  - `Artistas/<artista>/Singles/<single>/<pista> - <titulo>.mp3`
- Reutilizara los sincronizadores existentes para registrar la cancion, el album y la imagen en la base de datos, preservando los flujos actuales de FileZilla/Oracle y Cloudinary.

## Formato de `import.json`

El archivo contendra una lista de importaciones. Ejemplo:

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

Para un album, `releaseName` sera el nombre del album y todos sus temas podran apuntar a la misma carpeta de Cloudinary.

## Flujo

1. La persona administradora descarga el MP3 en `Backend/Asignar_metadatos/`.
2. Completa o agrega su entrada en `Backend/Asignar_metadatos/import.json` y sube manualmente la portada a la carpeta de Cloudinary seleccionada.
3. El comando de importacion lee y valida cada entrada.
4. Obtiene la imagen de Cloudinary usando la carpeta indicada; da prioridad a archivos llamados `portada` o `cover` y, si no existen, usa la primera imagen disponible.
5. Escribe etiquetas ID3: artista, titulo, album, fecha, generos, numero de pista y portada cuando falte.
6. Mueve el MP3 a la estructura final y sincroniza catalogo, enlace del album y portada para que el frontend la use.
7. Guarda un resultado por entrada: procesada, omitida o fallida, con una razon clara. Las entradas exitosas no se repiten en ejecuciones posteriores.

## Errores y protecciones

- JSON invalido, campos obligatorios ausentes, archivo inexistente o formato no MP3: la entrada falla sin tocar otros archivos.
- Carpeta de Cloudinary inexistente o sin imagen: la cancion queda en `Asignar_metadatos` y no se etiqueta ni mueve.
- Destino ya ocupado: se rechaza la entrada para evitar sobrescribir una cancion existente.
- Fallo durante la escritura de etiquetas: el archivo original se conserva y no se registra como procesado.
- No se descarga ni se busca automaticamente una portada: la seleccion manual de Cloudinary es un requisito intencional del flujo.

## Componentes previstos

- Un lector y validador de `import.json`.
- Un servicio de consulta de carpetas Cloudinary que reutiliza la configuracion existente.
- Un servicio de etiquetas MP3 e insercion condicionada de portada.
- Un comando nuevo de importacion que coordina las etapas y llama a las sincronizaciones existentes cuando corresponde.
- Pruebas unitarias para JSON, rutas de destino, seleccion de portada y casos de error; una prueba de integracion con servicios externos simulados.

## Criterios de aceptacion

- Una entrada valida con una carpeta Cloudinary valida deja la cancion organizada, etiquetada y asociada a esa portada en el catalogo.
- Una misma carpeta de Cloudinary puede ser elegida para todas las pistas de un album.
- Una entrada con una carpeta equivocada no mueve, no etiqueta y no altera el catalogo.
- Una cancion con portada integrada conserva su imagen; una sin portada recibe la que fue elegida por la carpeta Cloudinary.
- El formato de carpetas y las sincronizaciones actuales siguen funcionando como antes.

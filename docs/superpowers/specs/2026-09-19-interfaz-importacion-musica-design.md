# Diseno: interfaz simple para importar musica con MusicBrainz

## Objetivo

Crear una interfaz local, simple y funcional dentro de la app Mysic para importar MP3 sin editar `import.json` a mano. La persona administradora podra arrastrar canciones, ver los metadatos detectados por MusicBrainz, elegir la carpeta exacta de Cloudinary que contiene la portada y ejecutar la importacion final.

La automatizacion debe conservar el flujo actual de `automa_mysic`: AcoustID/fpcalc identifica la cancion, MusicBrainz completa los metadatos, Cloudinary aporta la portada desde la carpeta elegida manualmente, el MP3 se etiqueta y luego se mueve a la biblioteca musical.

## Contexto actual

- `automa_mysic` ya contiene el importador local y la carpeta `automa_mysic/asignar_metadatos`.
- `automa_mysic/run-import.js` ya puede hacer vista previa con `--dry-run` y procesamiento real con `--sync-catalog`.
- `automa_mysic/musicbrainz.js` ya usa `fpcalc`, AcoustID y MusicBrainz.
- `automa_mysic/import-music.js` ya valida entradas, arma rutas finales y selecciona portada por carpeta Cloudinary.
- El frontend existente usa React, Vite y Tauri. Tauri es el puente adecuado para copiar archivos locales y ejecutar el importador desde una app de escritorio.

## Alcance

Se agregara una pantalla administrativa llamada `Importar musica` dentro del frontend existente. La pantalla aparecera en la navegacion lateral y estara pensada para uso local de administracion, no para usuarios finales del streaming.

La primera version sera deliberadamente pequena:

- Arrastrar o seleccionar uno o varios archivos `.mp3`.
- Copiar esos archivos a `automa_mysic/asignar_metadatos`.
- Guardar el estado pendiente de la interfaz sin romper el `import.json` actual.
- Crear o actualizar `automa_mysic/asignar_metadatos/import.json` solo con entradas listas para vista previa o importacion.
- Ejecutar identificacion con AcoustID/MusicBrainz y mostrar los resultados.
- Permitir escribir una carpeta Cloudinary por cancion.
- Permitir aplicar una carpeta Cloudinary a todas las canciones seleccionadas.
- Ejecutar una vista previa antes de importar.
- Ejecutar la importacion final con sincronizacion del catalogo.
- Mostrar resultados por cancion: lista, procesada, omitida o fallida.

No se agregara busqueda automatica de portadas ni subida automatica a Cloudinary. La portada sigue siendo responsabilidad manual: el usuario la busca, la sube a Cloudinary y luego pega o elige la carpeta que debe usarse.

## Flujo de usuario

1. El usuario abre `Importar musica` desde la app de escritorio.
2. El usuario arrastra archivos `.mp3` o usa un selector de archivos.
3. La app valida que sean MP3 y los copia a `automa_mysic/asignar_metadatos`.
4. La app guarda filas pendientes en `automa_mysic/asignar_metadatos/.ui-state.json` con:
   - `file`
   - `metadataSource: "musicbrainz"`
   - estado de la fila
   - metadatos detectados cuando existan
5. La app ejecuta el analisis de metadatos para cada archivo.
6. La pantalla muestra una tabla con:
   - archivo original
   - artista
   - titulo
   - album o single
   - ano
   - generos
   - numero de pista
   - MusicBrainz recording ID
   - confianza de AcoustID cuando este disponible
   - carpeta Cloudinary elegida
   - estado
7. El usuario pega la carpeta Cloudinary de cada cancion o usa una accion para aplicar la misma carpeta a varias canciones.
8. La app genera `import.json` con las filas que ya tienen `cloudinaryFolder`.
9. La app ejecuta `preview` para confirmar que la carpeta Cloudinary tiene una imagen valida.
10. Si todo esta correcto, el usuario pulsa `Importar`.
11. La app procesa los MP3, escribe metadatos, incrusta portada si falta, mueve los archivos a la biblioteca, sincroniza el catalogo y muestra el resumen final.

## Diseno de interfaz

La pantalla tendra tres zonas principales:

- Zona de entrada: dropzone compacta, boton de seleccionar MP3 y contador de archivos pendientes.
- Tabla de revision: filas densas con metadatos detectados, campo editable de Cloudinary, estado y mensajes de error.
- Barra de acciones: botones para analizar, vista previa, importar y limpiar completados.

Estados visibles:

- `Pendiente`: el archivo fue agregado pero todavia no se analizo.
- `Analizando`: se esta ejecutando fpcalc/AcoustID/MusicBrainz.
- `Listo`: hay metadatos y carpeta Cloudinary valida.
- `Falta carpeta`: MusicBrainz encontro la cancion pero falta elegir carpeta.
- `Error`: algo impide continuar, con mensaje claro.
- `Procesado`: la cancion ya se importo.
- `Omitido`: la cancion ya estaba procesada o no requiere accion.

La UI debe ser sobria y de trabajo: tabla escaneable, controles compactos, nada de pagina tipo marketing. Debe seguir el estilo oscuro existente de Mysic.

## Arquitectura

### Frontend React

Se agregara una feature en `Frontend/src/features/music-import/`:

- `MusicImportView.jsx`: pantalla principal.
- `musicImportApi.js`: cliente pequeno para llamar comandos Tauri.
- `music-import.css`: estilos locales de la pantalla.

`DiscoveryView.jsx` agregara la ruta `import` y renderizara `MusicImportView`. `AppSidebar.jsx` agregara un item de navegacion con icono de importacion.

### Puente Tauri

Se agregaran comandos en `Frontend/src-tauri/src/lib.rs` para ejecutar operaciones locales:

- `stage_music_files(paths: Vec<String>)`
  - valida extensiones
  - copia los MP3 a `automa_mysic/asignar_metadatos`
  - evita sobrescribir nombres existentes usando sufijos seguros
  - devuelve la lista de archivos preparados

- `analyze_music_import()`
  - ejecuta el analisis de `automa_mysic`
  - devuelve JSON con metadatos por archivo

- `save_music_import(entries)`
  - recibe filas ya revisadas desde la UI
  - escribe `.ui-state.json`
  - escribe `import.json` solo con filas completas

- `preview_music_import()`
  - ejecuta `node run-import.js --dry-run`
  - devuelve el resumen JSON existente

- `apply_music_import()`
  - ejecuta `node run-import.js --sync-catalog`
  - devuelve el resumen JSON final

Los comandos no expondran secretos al frontend. Solo devuelven resultados operativos.

### Adaptacion de `automa_mysic`

El importador actual se mantendra como fuente de verdad. Se agregara una capa pequena para que la UI pueda usarlo mejor:

- Un modulo CLI auxiliar, por ejemplo `automa_mysic/ui-import.js`, para preparar entradas y analizar metadatos sin hacer importacion final.
- Funciones reutilizables para:
  - leer el manifest
  - leer y escribir `.ui-state.json`
  - escribir entradas nuevas
  - resolver MusicBrainz por archivo
  - devolver datos estructurados para la tabla

`run-import.js` seguira siendo el comando final de preview/import.

## Datos

La UI usara `.ui-state.json` para filas todavia incompletas. Ese archivo puede tener `cloudinaryFolder` vacio porque no lo consume el importador final.

`import.json` seguira usando este formato minimo y solo recibira filas completas:

```json
{
  "imports": [
    {
      "file": "cancion.mp3",
      "metadataSource": "musicbrainz",
      "cloudinaryFolder": "Artistas/Nombre/Albums/Album"
    }
  ]
}
```

La UI podra guardar overrides solo si el usuario edita campos manualmente:

```json
{
  "file": "cancion.mp3",
  "metadataSource": "musicbrainz",
  "artistOverride": "Artista corregido",
  "titleOverride": "Titulo corregido",
  "releaseNameOverride": "Album corregido",
  "kindOverride": "album",
  "cloudinaryFolder": "Artistas/Nombre/Albums/Album"
}
```

La primera version puede mostrar los metadatos detectados como solo lectura y limitar la edicion manual a `cloudinaryFolder`. Los overrides quedan previstos para correcciones posteriores si hace falta.

## Errores y protecciones

- Archivo que no termina en `.mp3`: no se agrega.
- Nombre repetido en `asignar_metadatos`: se crea un nombre unico para no pisar archivos.
- `FPCALC_PATH` ausente: la fila queda en error con instrucciones de configurar fpcalc.
- `ACOUSTID_API_KEY` ausente: la fila queda en error con instrucciones de configurar la clave.
- Coincidencia con baja confianza: la fila no se importa automaticamente.
- Carpeta Cloudinary vacia o incorrecta: `preview` falla para esa fila y no mueve el MP3.
- Error al escribir tags: se conserva el archivo original y se muestra el motivo.
- Fallo en sincronizacion del catalogo: la UI muestra que el MP3 fue procesado pero que queda pendiente revisar catalogo.

La importacion final nunca debe sobrescribir canciones existentes en la biblioteca.

## Pruebas

### `automa_mysic`

- Probar escritura segura de entradas agregadas desde la UI.
- Probar que el analisis devuelve metadatos estructurados sin mover archivos.
- Probar archivo no MP3, duplicados y manifest vacio.
- Mantener las pruebas existentes de MusicBrainz, seleccion de portada e importacion.

### Tauri/Rust

- Probar normalizacion de rutas y copia segura en funciones puras donde sea posible.
- Verificar que los comandos convierten fallos del proceso Node en errores legibles para la UI.

### Frontend

- Probar estados de la tabla y validacion de Cloudinary folder.
- Probar que `Importar` queda deshabilitado si hay filas sin carpeta o con errores.
- Ejecutar `npm run test`, `npm run typecheck` y `npm run build` del frontend.

## Criterios de aceptacion

- El usuario puede abrir una pantalla `Importar musica` en la app.
- El usuario puede agregar MP3 sin tocar manualmente `import.json`.
- La app usa AcoustID/MusicBrainz para mostrar artista, titulo, album/single, ano, generos y pista.
- La app permite escribir la carpeta Cloudinary que debe usarse para la portada.
- La vista previa detecta si esa carpeta tiene portada valida.
- La importacion final etiqueta y mueve la cancion usando el flujo actual.
- El catalogo se sincroniza despues de importar.
- Los errores se muestran por cancion y no rompen toda la tanda.
- La solucion funciona sin n8n y sin abrir MusicBrainz Picard.

## Fuera de alcance por ahora

- Subir portadas automaticamente a Cloudinary.
- Buscar portadas en internet.
- Elegir carpeta Cloudinary desde un navegador remoto de carpetas.
- Editar todos los metadatos manualmente desde la UI.
- Crear un sistema multiusuario de administracion musical.
- Reemplazar el importador CLI actual.

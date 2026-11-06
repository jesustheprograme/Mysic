//! Copias locales del audio descargado.
//!
//! La interfaz baja una canción del servidor y la entrega por trozos a este módulo, que la guarda en
//! el disco del usuario. Después se reproduce desde ahí por el protocolo propio `mysicaudio`, sin
//! volver a cruzar internet y sin conexión.
//!
//! Decisiones de diseño:
//!  - Escritura atómica: se escribe `<id>.m4a.part`, se confirma con `fsync`, se comprueba el tamaño y
//!    solo entonces se renombra a `<id>.m4a`. Una caída a mitad nunca deja un archivo a medias válido.
//!  - Sin saturar: tope de espacio total y por archivo, llevado en memoria (no se recorre el directorio
//!    en cada trozo) y comandos fuera del hilo de la interfaz.
//!  - Metadatos en un archivo `<id>.json` por canción: sin un índice global que pueda corromperse.
//!  - El id se valida estrictamente (11 caracteres de YouTube): imposible salir del directorio.
//!  - `Range` con respuestas acotadas: el reproductor pide lo que necesita, no se carga el archivo entero.

use std::collections::HashMap;
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use serde::Serialize;
use serde_json::Value;
use tauri::http::{header, Method, Request as HttpRequest, Response as HttpResponse, StatusCode};
use tauri::ipc::{InvokeBody, Request};
use tauri::State;

pub const SCHEME: &str = "mysicaudio";

/// Espacio total que pueden ocupar las copias locales.
const MAX_TOTAL_BYTES: u64 = 2 * 1024 * 1024 * 1024;
/// Una canción de audio rara vez supera 30 MB; esto frena descargas fuera de control.
const MAX_FILE_BYTES: u64 = 256 * 1024 * 1024;
/// Trozo máximo aceptado por llamada de escritura.
const MAX_CHUNK_BYTES: usize = 8 * 1024 * 1024;
/// Respuesta máxima por petición `Range` de reproducción.
const MAX_RESPONSE_BYTES: u64 = 2 * 1024 * 1024;

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LocalItem {
    pub id: String,
    pub size: u64,
    pub meta: Value,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Usage {
    pub used: u64,
    pub cap: u64,
}

#[derive(Debug, PartialEq)]
pub enum BeginOutcome {
    Started,
    Exists,
}

struct Session {
    file: File,
    written: u64,
    meta: Value,
}

struct Inner {
    dir: PathBuf,
    cap: u64,
    used: AtomicU64,
    sessions: Mutex<HashMap<String, Arc<Mutex<Session>>>>,
}

#[derive(Clone)]
pub struct LocalAudio(Arc<Inner>);

/// Los ids de YouTube tienen 11 caracteres de `[A-Za-z0-9_-]`. Cualquier otra cosa se rechaza.
pub fn is_valid_id(id: &str) -> bool {
    id.len() == 11 && id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
}

fn check_id(id: &str) -> Result<(), String> {
    if is_valid_id(id) {
        Ok(())
    } else {
        Err("Identificador de canción no válido.".to_string())
    }
}

#[derive(Debug, PartialEq)]
pub enum RangeRequest {
    /// Sin cabecera `Range` o una forma que no se interpreta: archivo completo.
    Whole,
    /// Bytes `start..=end`, ya acotados al tamaño y a `MAX_RESPONSE_BYTES`.
    Partial { start: u64, end: u64 },
    /// El inicio queda fuera del archivo.
    Unsatisfiable,
}

/// Interpreta `Range: bytes=a-b`, `bytes=a-` y `bytes=-n` (un solo rango).
pub fn parse_range(header: Option<&str>, len: u64, max_chunk: u64) -> RangeRequest {
    let Some(spec) = header.and_then(|value| value.trim().strip_prefix("bytes=")) else {
        return RangeRequest::Whole;
    };
    if len == 0 || spec.contains(',') {
        return RangeRequest::Whole;
    }
    let Some((from, to)) = spec.split_once('-') else {
        return RangeRequest::Whole;
    };

    let (start, end) = if from.is_empty() {
        // Sufijo: los últimos `n` bytes.
        let Ok(n) = to.trim().parse::<u64>() else { return RangeRequest::Whole };
        if n == 0 {
            return RangeRequest::Unsatisfiable;
        }
        (len - n.min(len), len - 1)
    } else {
        let Ok(start) = from.trim().parse::<u64>() else { return RangeRequest::Whole };
        if start >= len {
            return RangeRequest::Unsatisfiable;
        }
        let end = match to.trim() {
            "" => len - 1,
            value => match value.parse::<u64>() {
                Ok(end) if end >= start => end.min(len - 1),
                _ => return RangeRequest::Whole,
            },
        };
        (start, end)
    };

    let end = end.min(start.saturating_add(max_chunk).saturating_sub(1));
    RangeRequest::Partial { start, end }
}

fn saturating_sub_atomic(counter: &AtomicU64, amount: u64) {
    let _ = counter.fetch_update(Ordering::SeqCst, Ordering::SeqCst, |current| Some(current.saturating_sub(amount)));
}

impl LocalAudio {
    pub fn open(dir: PathBuf) -> Self {
        Self::with_cap(dir, MAX_TOTAL_BYTES)
    }

    fn with_cap(dir: PathBuf, cap: u64) -> Self {
        let _ = fs::create_dir_all(&dir);
        let mut used = 0u64;
        if let Ok(entries) = fs::read_dir(&dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                match path.extension().and_then(|extension| extension.to_str()) {
                    // Restos de una descarga interrumpida: nunca son archivos válidos.
                    Some("part") | Some("tmp") => {
                        let _ = fs::remove_file(&path);
                    }
                    Some("m4a") => used += entry.metadata().map(|meta| meta.len()).unwrap_or(0),
                    _ => {}
                }
            }
        }
        Self(Arc::new(Inner { dir, cap, used: AtomicU64::new(used), sessions: Mutex::new(HashMap::new()) }))
    }

    fn audio_path(&self, id: &str) -> PathBuf {
        self.0.dir.join(format!("{id}.m4a"))
    }

    fn part_path(&self, id: &str) -> PathBuf {
        self.0.dir.join(format!("{id}.m4a.part"))
    }

    fn meta_path(&self, id: &str) -> PathBuf {
        self.0.dir.join(format!("{id}.json"))
    }

    pub fn usage(&self) -> Usage {
        Usage { used: self.0.used.load(Ordering::SeqCst), cap: self.0.cap }
    }

    pub fn begin(&self, id: &str, meta: Value) -> Result<BeginOutcome, String> {
        check_id(id)?;
        if self.audio_path(id).exists() {
            return Ok(BeginOutcome::Exists);
        }
        if self.0.used.load(Ordering::SeqCst) >= self.0.cap {
            return Err("No hay espacio disponible para más descargas locales.".to_string());
        }
        let file = OpenOptions::new()
            .create(true)
            .truncate(true)
            .write(true)
            .open(self.part_path(id))
            .map_err(|error| format!("No se pudo crear el archivo local: {error}"))?;

        let mut sessions = self.0.sessions.lock().map_err(|_| "Estado interno bloqueado.".to_string())?;
        if let Some(previous) = sessions.insert(id.to_string(), Arc::new(Mutex::new(Session { file, written: 0, meta }))) {
            // Un intento anterior sin cerrar: se libera el espacio que tenía reservado.
            if let Ok(previous) = previous.lock() {
                saturating_sub_atomic(&self.0.used, previous.written);
            }
        }
        Ok(BeginOutcome::Started)
    }

    pub fn append(&self, id: &str, bytes: &[u8]) -> Result<u64, String> {
        check_id(id)?;
        if bytes.len() > MAX_CHUNK_BYTES {
            return Err("El trozo recibido es demasiado grande.".to_string());
        }
        let session = self
            .0
            .sessions
            .lock()
            .map_err(|_| "Estado interno bloqueado.".to_string())?
            .get(id)
            .cloned()
            .ok_or_else(|| "No hay una descarga local en curso para esta canción.".to_string())?;
        let mut session = session.lock().map_err(|_| "Estado interno bloqueado.".to_string())?;

        let length = bytes.len() as u64;
        if session.written + length > MAX_FILE_BYTES {
            return Err("El archivo supera el tamaño máximo permitido.".to_string());
        }
        // El espacio se reserva antes de escribir: dos descargas simultáneas nunca superan el tope juntas.
        if self.0.used.fetch_add(length, Ordering::SeqCst) + length > self.0.cap {
            saturating_sub_atomic(&self.0.used, length);
            return Err("No hay espacio disponible para más descargas locales.".to_string());
        }
        if let Err(error) = session.file.write_all(bytes) {
            saturating_sub_atomic(&self.0.used, length);
            return Err(format!("No se pudo escribir en disco: {error}"));
        }
        session.written += length;
        Ok(session.written)
    }

    /// Descarta una descarga en curso y devuelve el espacio reservado.
    fn discard(&self, id: &str, written: u64) {
        let _ = fs::remove_file(self.part_path(id));
        saturating_sub_atomic(&self.0.used, written);
    }

    pub fn commit(&self, id: &str, expected_size: Option<u64>) -> Result<LocalItem, String> {
        check_id(id)?;
        let session = self
            .0
            .sessions
            .lock()
            .map_err(|_| "Estado interno bloqueado.".to_string())?
            .remove(id)
            .ok_or_else(|| "No hay una descarga local en curso para esta canción.".to_string())?;

        let (written, meta) = {
            let mut session = session.lock().map_err(|_| "Estado interno bloqueado.".to_string())?;
            session.file.flush().and_then(|_| session.file.sync_all()).map_err(|error| error.to_string())?;
            (session.written, session.meta.clone())
        };
        // Se suelta el manejador antes de renombrar (Windows no renombra archivos abiertos).
        drop(session);

        if written == 0 {
            self.discard(id, written);
            return Err("La descarga llegó vacía.".to_string());
        }
        if let Some(expected) = expected_size.filter(|expected| *expected > 0) {
            if expected != written {
                self.discard(id, written);
                return Err(format!("Descarga incompleta: {written} de {expected} bytes."));
            }
        }

        if let Err(error) = fs::rename(self.part_path(id), self.audio_path(id)) {
            self.discard(id, written);
            return Err(format!("No se pudo finalizar el archivo local: {error}"));
        }

        let meta_tmp = self.0.dir.join(format!("{id}.json.tmp"));
        let saved = serde_json::to_vec(&meta)
            .map_err(|error| error.to_string())
            .and_then(|bytes| fs::write(&meta_tmp, bytes).map_err(|error| error.to_string()))
            .and_then(|_| fs::rename(&meta_tmp, self.meta_path(id)).map_err(|error| error.to_string()));
        if let Err(error) = saved {
            // Sin metadatos el archivo no se puede listar: se deshace para no dejar basura invisible.
            let _ = fs::remove_file(self.audio_path(id));
            saturating_sub_atomic(&self.0.used, written);
            return Err(format!("No se pudieron guardar los datos de la canción: {error}"));
        }

        Ok(LocalItem { id: id.to_string(), size: written, meta })
    }

    pub fn abort(&self, id: &str) -> Result<(), String> {
        check_id(id)?;
        let removed = self.0.sessions.lock().map_err(|_| "Estado interno bloqueado.".to_string())?.remove(id);
        let written = removed.and_then(|session| session.lock().ok().map(|session| session.written)).unwrap_or(0);
        self.discard(id, written);
        Ok(())
    }

    pub fn remove(&self, id: &str) -> Result<(), String> {
        check_id(id)?;
        let size = fs::metadata(self.audio_path(id)).map(|meta| meta.len()).unwrap_or(0);
        let _ = fs::remove_file(self.audio_path(id));
        let _ = fs::remove_file(self.meta_path(id));
        saturating_sub_atomic(&self.0.used, size);
        Ok(())
    }

    pub fn list(&self) -> Vec<LocalItem> {
        let Ok(entries) = fs::read_dir(&self.0.dir) else { return Vec::new() };
        let mut items = Vec::new();
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|extension| extension.to_str()) != Some("json") {
                continue;
            }
            let Some(id) = path.file_stem().and_then(|stem| stem.to_str()).filter(|id| is_valid_id(id)) else { continue };
            let Ok(size) = fs::metadata(self.audio_path(id)).map(|meta| meta.len()) else { continue };
            let Ok(meta) = fs::read(&path).map_err(|_| ()).and_then(|bytes| serde_json::from_slice::<Value>(&bytes).map_err(|_| ())) else {
                continue;
            };
            items.push(LocalItem { id: id.to_string(), size, meta });
        }
        items
    }

    fn read_range(&self, id: &str, start: u64, length: u64) -> std::io::Result<Vec<u8>> {
        let mut file = File::open(self.audio_path(id))?;
        file.seek(SeekFrom::Start(start))?;
        let mut buffer = vec![0u8; length as usize];
        file.read_exact(&mut buffer)?;
        Ok(buffer)
    }
}

fn response(status: StatusCode, headers: &[(&str, String)], body: Vec<u8>) -> HttpResponse<Vec<u8>> {
    let mut builder = HttpResponse::builder()
        .status(status)
        .header(header::ACCEPT_RANGES, "bytes")
        .header(header::CACHE_CONTROL, "no-store")
        // El elemento <audio> puede cargarse con crossOrigin (para el analizador de espectro).
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .header(header::ACCESS_CONTROL_EXPOSE_HEADERS, "Content-Length, Content-Range, Accept-Ranges")
        .header("Cross-Origin-Resource-Policy", "cross-origin");
    for (name, value) in headers {
        builder = builder.header(*name, value.as_str());
    }
    builder.body(body).unwrap_or_else(|_| HttpResponse::new(Vec::new()))
}

/// Atiende una petición del protocolo `mysicaudio://<id>`.
pub fn respond(audio: &LocalAudio, request: &HttpRequest<Vec<u8>>) -> HttpResponse<Vec<u8>> {
    if request.method() == Method::OPTIONS {
        return response(StatusCode::NO_CONTENT, &[(header::ACCESS_CONTROL_ALLOW_HEADERS.as_str(), "Range".to_string())], Vec::new());
    }
    if request.method() != Method::GET && request.method() != Method::HEAD {
        return response(StatusCode::METHOD_NOT_ALLOWED, &[], Vec::new());
    }

    let id = request.uri().path().trim_matches('/');
    if !is_valid_id(id) {
        return response(StatusCode::NOT_FOUND, &[], Vec::new());
    }
    let Ok(metadata) = fs::metadata(audio.audio_path(id)) else {
        return response(StatusCode::NOT_FOUND, &[], Vec::new());
    };
    let len = metadata.len();
    let content_type = ("Content-Type", "audio/mp4".to_string());
    let range_header = request.headers().get(header::RANGE).and_then(|value| value.to_str().ok());
    let head_only = request.method() == Method::HEAD;

    match parse_range(range_header, len, MAX_RESPONSE_BYTES) {
        RangeRequest::Unsatisfiable => response(
            StatusCode::RANGE_NOT_SATISFIABLE,
            &[("Content-Range", format!("bytes */{len}"))],
            Vec::new(),
        ),
        RangeRequest::Whole => {
            if head_only || len > MAX_RESPONSE_BYTES * 4 {
                // Un archivo grande sin `Range` no se carga entero en memoria: solo se anuncia su tamaño.
                return response(StatusCode::OK, &[content_type, ("Content-Length", len.to_string())], Vec::new());
            }
            match audio.read_range(id, 0, len) {
                Ok(body) => response(StatusCode::OK, &[content_type, ("Content-Length", len.to_string())], body),
                Err(_) => response(StatusCode::INTERNAL_SERVER_ERROR, &[], Vec::new()),
            }
        }
        RangeRequest::Partial { start, end } => {
            let length = end - start + 1;
            let headers = [
                content_type,
                ("Content-Range", format!("bytes {start}-{end}/{len}")),
                ("Content-Length", length.to_string()),
            ];
            if head_only {
                return response(StatusCode::PARTIAL_CONTENT, &headers, Vec::new());
            }
            match audio.read_range(id, start, length) {
                Ok(body) => response(StatusCode::PARTIAL_CONTENT, &headers, body),
                Err(_) => response(StatusCode::INTERNAL_SERVER_ERROR, &[], Vec::new()),
            }
        }
    }
}

// ---- Comandos (fuera del hilo de la interfaz) ----

async fn blocking<T, F>(work: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|error| format!("La tarea de disco falló: {error}"))?
}

#[tauri::command]
pub async fn local_audio_list(state: State<'_, LocalAudio>) -> Result<Vec<LocalItem>, String> {
    let audio = state.inner().clone();
    blocking(move || Ok(audio.list())).await
}

#[tauri::command]
pub async fn local_audio_usage(state: State<'_, LocalAudio>) -> Result<Usage, String> {
    Ok(state.usage())
}

/// Devuelve "started" o "exists" (ya hay copia local: no hace falta descargar de nuevo).
#[tauri::command]
pub async fn local_audio_begin(id: String, meta: Value, state: State<'_, LocalAudio>) -> Result<String, String> {
    let audio = state.inner().clone();
    blocking(move || {
        audio.begin(&id, meta).map(|outcome| match outcome {
            BeginOutcome::Started => "started".to_string(),
            BeginOutcome::Exists => "exists".to_string(),
        })
    })
    .await
}

/// Cuerpo binario crudo (sin JSON ni base64) y el id en la cabecera `x-id`.
#[tauri::command]
pub async fn local_audio_append(request: Request<'_>, state: State<'_, LocalAudio>) -> Result<u64, String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("Se esperaba un cuerpo binario.".to_string());
    };
    let id = request
        .headers()
        .get("x-id")
        .and_then(|value| value.to_str().ok())
        .ok_or_else(|| "Falta la cabecera x-id.".to_string())?
        .to_string();
    let bytes = bytes.clone();
    let audio = state.inner().clone();
    blocking(move || audio.append(&id, &bytes)).await
}

#[tauri::command]
pub async fn local_audio_commit(id: String, expected_size: Option<u64>, state: State<'_, LocalAudio>) -> Result<LocalItem, String> {
    let audio = state.inner().clone();
    blocking(move || audio.commit(&id, expected_size)).await
}

#[tauri::command]
pub async fn local_audio_abort(id: String, state: State<'_, LocalAudio>) -> Result<(), String> {
    let audio = state.inner().clone();
    blocking(move || audio.abort(&id)).await
}

#[tauri::command]
pub async fn local_audio_remove(id: String, state: State<'_, LocalAudio>) -> Result<(), String> {
    let audio = state.inner().clone();
    blocking(move || audio.remove(&id)).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::AtomicUsize;

    static COUNTER: AtomicUsize = AtomicUsize::new(0);
    const ID: &str = "dQw4w9WgXcQ";
    const OTHER: &str = "abcdefghijk";

    fn temp_store(cap: u64) -> (LocalAudio, PathBuf) {
        let dir = std::env::temp_dir().join(format!(
            "mysic-local-audio-test-{}-{}",
            std::process::id(),
            COUNTER.fetch_add(1, Ordering::SeqCst)
        ));
        let _ = fs::remove_dir_all(&dir);
        (LocalAudio::with_cap(dir.clone(), cap), dir)
    }

    fn download(store: &LocalAudio, id: &str, payload: &[u8], expected: Option<u64>) -> Result<LocalItem, String> {
        store.begin(id, serde_json::json!({ "title": "Prueba", "id": id }))?;
        // Trozos pequeños en archivos pequeños (varias escrituras) y grandes en los grandes (rapidez).
        let size = if payload.len() > 100_000 { 64 * 1024 } else { 7 };
        for chunk in payload.chunks(size) {
            store.append(id, chunk)?;
        }
        store.commit(id, expected)
    }

    fn get(store: &LocalAudio, uri: &str, range: Option<&str>) -> HttpResponse<Vec<u8>> {
        let mut builder = HttpRequest::builder().method(Method::GET).uri(uri);
        if let Some(range) = range {
            builder = builder.header(header::RANGE, range);
        }
        respond(store, &builder.body(Vec::new()).unwrap())
    }

    #[test]
    fn ids_are_validated_strictly() {
        assert!(is_valid_id(ID));
        assert!(is_valid_id("a-_B1c2D3e4"));
        for bad in ["", "short", "dQw4w9WgXcQ1", "../../etc/pa", "dQw4w9Wg/cQ", "dQw4w9Wg.cQ", "dQw4w9Wg cQ", "dQw4w9WgXc\u{e9}"] {
            assert!(!is_valid_id(bad), "debía rechazar {bad:?}");
        }
    }

    #[test]
    fn parse_range_covers_common_player_requests() {
        const MAX: u64 = 1000;
        assert_eq!(parse_range(None, 5000, MAX), RangeRequest::Whole);
        assert_eq!(parse_range(Some("bytes=0-"), 5000, MAX), RangeRequest::Partial { start: 0, end: 999 });
        assert_eq!(parse_range(Some("bytes=100-199"), 5000, MAX), RangeRequest::Partial { start: 100, end: 199 });
        assert_eq!(parse_range(Some("bytes=4900-"), 5000, MAX), RangeRequest::Partial { start: 4900, end: 4999 });
        assert_eq!(parse_range(Some("bytes=4900-9999"), 5000, MAX), RangeRequest::Partial { start: 4900, end: 4999 });
        assert_eq!(parse_range(Some("bytes=-500"), 5000, MAX), RangeRequest::Partial { start: 4500, end: 4999 });
        assert_eq!(parse_range(Some("bytes=-9000"), 5000, 10_000), RangeRequest::Partial { start: 0, end: 4999 });
        assert_eq!(parse_range(Some("bytes=5000-"), 5000, MAX), RangeRequest::Unsatisfiable);
        assert_eq!(parse_range(Some("bytes=-0"), 5000, MAX), RangeRequest::Unsatisfiable);
        assert_eq!(parse_range(Some("bytes=0-1,5-9"), 5000, MAX), RangeRequest::Whole);
        assert_eq!(parse_range(Some("bytes=abc-"), 5000, MAX), RangeRequest::Whole);
        assert_eq!(parse_range(Some("bytes=50-10"), 5000, MAX), RangeRequest::Whole);
        assert_eq!(parse_range(Some("items=0-9"), 5000, MAX), RangeRequest::Whole);
        assert_eq!(parse_range(Some("bytes=0-"), 0, MAX), RangeRequest::Whole);
    }

    #[test]
    fn full_download_lifecycle_lists_serves_and_removes() {
        let (store, dir) = temp_store(1 << 20);
        let payload: Vec<u8> = (0..=255u8).cycle().take(1000).collect();

        let item = download(&store, ID, &payload, Some(1000)).unwrap();
        assert_eq!(item.size, 1000);
        assert_eq!(store.usage().used, 1000);
        assert_eq!(store.list(), vec![item]);
        assert!(dir.join(format!("{ID}.m4a")).exists());
        assert!(!dir.join(format!("{ID}.m4a.part")).exists(), "no debe quedar el .part");

        assert_eq!(store.begin(ID, Value::Null).unwrap(), BeginOutcome::Exists);

        store.remove(ID).unwrap();
        assert!(store.list().is_empty());
        assert_eq!(store.usage().used, 0);
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn size_mismatch_or_empty_download_is_discarded() {
        let (store, dir) = temp_store(1 << 20);
        let error = download(&store, ID, &[1u8; 500], Some(900)).unwrap_err();
        assert!(error.contains("incompleta"), "{error}");
        assert!(store.list().is_empty());
        assert_eq!(store.usage().used, 0, "el espacio reservado debe liberarse");
        assert!(!dir.join(format!("{ID}.m4a")).exists());

        store.begin(ID, Value::Null).unwrap();
        assert!(store.commit(ID, None).unwrap_err().contains("vacía"));
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn space_cap_is_enforced_across_concurrent_downloads() {
        let (store, dir) = temp_store(1000);
        store.begin(ID, Value::Null).unwrap();
        store.begin(OTHER, Value::Null).unwrap();
        assert_eq!(store.append(ID, &[0u8; 600]).unwrap(), 600);
        // La segunda descarga ya no cabe junto a la primera.
        assert!(store.append(OTHER, &[0u8; 600]).unwrap_err().contains("espacio"));
        assert_eq!(store.usage().used, 600, "un intento rechazado no debe consumir espacio");
        store.abort(OTHER).unwrap();
        store.abort(ID).unwrap();
        assert_eq!(store.usage().used, 0);
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn abort_removes_partial_file_and_releases_space() {
        let (store, dir) = temp_store(1 << 20);
        store.begin(ID, Value::Null).unwrap();
        store.append(ID, &[1u8; 300]).unwrap();
        assert!(dir.join(format!("{ID}.m4a.part")).exists());
        store.abort(ID).unwrap();
        assert!(!dir.join(format!("{ID}.m4a.part")).exists());
        assert_eq!(store.usage().used, 0);
        assert!(store.append(ID, &[1u8]).is_err(), "sin sesión no se puede escribir");
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn restarting_a_download_releases_the_previous_reservation() {
        let (store, dir) = temp_store(1 << 20);
        store.begin(ID, Value::Null).unwrap();
        store.append(ID, &[1u8; 400]).unwrap();
        store.begin(ID, Value::Null).unwrap();
        assert_eq!(store.usage().used, 0);
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn leftovers_are_cleaned_and_usage_is_recomputed_on_open() {
        let (store, dir) = temp_store(1 << 20);
        download(&store, ID, &[7u8; 321], None).unwrap();
        fs::write(dir.join(format!("{OTHER}.m4a.part")), [0u8; 50]).unwrap();
        fs::write(dir.join(format!("{OTHER}.json.tmp")), b"{}").unwrap();

        let reopened = LocalAudio::with_cap(dir.clone(), 1 << 20);
        assert_eq!(reopened.usage().used, 321);
        assert!(!dir.join(format!("{OTHER}.m4a.part")).exists());
        assert!(!dir.join(format!("{OTHER}.json.tmp")).exists());
        assert_eq!(reopened.list().len(), 1);
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn protocol_serves_ranges_and_rejects_bad_requests() {
        let (store, dir) = temp_store(1 << 20);
        let payload: Vec<u8> = (0..=255u8).cycle().take(5000).collect();
        download(&store, ID, &payload, Some(5000)).unwrap();
        let uri = format!("http://mysicaudio.localhost/{ID}");

        let partial = get(&store, &uri, Some("bytes=100-199"));
        assert_eq!(partial.status(), StatusCode::PARTIAL_CONTENT);
        assert_eq!(partial.body().as_slice(), &payload[100..200]);
        assert_eq!(partial.headers()[header::CONTENT_RANGE], "bytes 100-199/5000");
        assert_eq!(partial.headers()[header::CONTENT_LENGTH], "100");
        assert_eq!(partial.headers()[header::ACCESS_CONTROL_ALLOW_ORIGIN], "*");

        let suffix = get(&store, &uri, Some("bytes=-10"));
        assert_eq!(suffix.body().as_slice(), &payload[4990..]);

        let whole = get(&store, &uri, None);
        assert_eq!(whole.status(), StatusCode::OK);
        assert_eq!(whole.body().len(), 5000);

        assert_eq!(get(&store, &uri, Some("bytes=9999-")).status(), StatusCode::RANGE_NOT_SATISFIABLE);
        assert_eq!(get(&store, &format!("http://mysicaudio.localhost/{OTHER}"), None).status(), StatusCode::NOT_FOUND);
        assert_eq!(get(&store, "http://mysicaudio.localhost/..%2F..%2Fsecret", None).status(), StatusCode::NOT_FOUND);
        assert_eq!(get(&store, "http://mysicaudio.localhost/", None).status(), StatusCode::NOT_FOUND);

        let post = respond(&store, &HttpRequest::builder().method(Method::POST).uri(&uri).body(Vec::new()).unwrap());
        assert_eq!(post.status(), StatusCode::METHOD_NOT_ALLOWED);
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn open_ended_range_is_capped_so_the_whole_file_is_never_loaded() {
        let (store, dir) = temp_store(64 * 1024 * 1024);
        let big = vec![9u8; (MAX_RESPONSE_BYTES as usize) * 2 + 123];
        download(&store, ID, &big, None).unwrap();
        let response = get(&store, &format!("http://mysicaudio.localhost/{ID}"), Some("bytes=0-"));
        assert_eq!(response.status(), StatusCode::PARTIAL_CONTENT);
        assert_eq!(response.body().len() as u64, MAX_RESPONSE_BYTES);
        let _ = fs::remove_dir_all(dir);
    }
}

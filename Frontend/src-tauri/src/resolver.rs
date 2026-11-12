//! Resolución del audio de YouTube en el propio equipo del usuario.
//!
//! Por qué existe: resolver en el servidor obliga a usar una IP de centro de datos (YouTube exige un PO token y
//! liga las URLs a la IP que las pidió), así que todo el audio pasaba por el VPS (+0,5 s por canción y ancho de
//! banda propio). Desde la IP del usuario el cliente `VISIONOS` entrega la URL directa en ~80 ms, sin PO token ni
//! descifrado, y la URL sirve más allá de 1 MB.
//!
//! Cómo se usa: la interfaz pone como fuente del `<audio>` `http://mysicstream.localhost/<videoId>`; este módulo
//! resuelve (con caché), pide a YouTube tramos acotados y responde `206` con las cabeceras CORS que necesita el
//! analizador de audio. Los tramos acotados evitan el límite de ~2x tiempo real que YouTube aplica a `bytes=X-`.
//! Si algo falla responde un error y la interfaz cae al servidor (`/stream/:id`).
//!
//! El perfil del cliente (nombre, versión, agente) es dato, no código: viene de `client-config.json` (ver
//! `set_client_config`) y, si falta, de los valores por defecto de abajo.

use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::http::{header, Method, Request as HttpRequest, Response as HttpResponse, StatusCode};

pub const SCHEME: &str = "mysicstream";
const PLAYER_URL: &str = "https://www.youtube.com/youtubei/v1/player?prettyPrint=false&alt=json";
const SW_DATA_URL: &str = "https://www.youtube.com/sw.js_data";
/// Primer tramo (para que el sonido empiece pronto) y tramos siguientes.
const FIRST_CHUNK: u64 = 256 * 1024;
const CHUNK: u64 = 2 * 1024 * 1024;
const VISITOR_TTL_SECS: u64 = 12 * 3600;
/// Una URL se renueva con este margen antes de caducar.
const URL_SAFETY_SECS: u64 = 10 * 60;
const CACHE_MAX: usize = 200;
const FALLBACK_URL_LIFETIME_SECS: u64 = 5 * 3600;
/// Primer tramo ya descargado de las pistas preparadas (al pasar el cursor o ser la siguiente de la cola).
const HEAD_MAX: usize = 12;
const HEAD_TTL_SECS: u64 = 180;

fn now_secs() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

/// Perfil del cliente de YouTube. Es dato: se puede actualizar sin sacar un instalador nuevo.
#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", default)]
pub struct ClientConfig {
    pub client_name: String,
    pub client_version: String,
    /// Número del cliente para la cabecera `x-youtube-client-name`.
    pub client_id: String,
    pub os_name: String,
    pub os_version: String,
    pub device_make: String,
    pub device_model: String,
    pub user_agent: String,
    pub platform: String,
}

impl Default for ClientConfig {
    fn default() -> Self {
        Self {
            client_name: "VISIONOS".into(),
            client_version: "1.02".into(),
            client_id: "101".into(),
            os_name: "visionOS".into(),
            os_version: "26.5.23O471".into(),
            device_make: "Apple".into(),
            device_model: "RealityDevice17,1".into(),
            user_agent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15".into(),
            platform: "MOBILE".into(),
        }
    }
}

impl ClientConfig {
    /// Una configuración remota solo se acepta si todos los campos son texto corto, imprimible y no vacío.
    pub fn is_valid(&self) -> bool {
        [
            &self.client_name,
            &self.client_version,
            &self.client_id,
            &self.os_name,
            &self.os_version,
            &self.device_make,
            &self.device_model,
            &self.user_agent,
            &self.platform,
        ]
        .iter()
        .all(|field| !field.trim().is_empty() && field.len() <= 300 && field.chars().all(|c| !c.is_control()))
            && self.client_id.chars().all(|c| c.is_ascii_digit())
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ResolveError {
    Network(String),
    Visitor(String),
    LoginRequired,
    Unavailable(String),
    NoAudio,
    Parse(String),
}

impl ResolveError {
    /// Código estable que la interfaz puede registrar.
    pub fn code(&self) -> &'static str {
        match self {
            Self::Network(_) => "NETWORK",
            Self::Visitor(_) => "VISITOR_UNAVAILABLE",
            Self::LoginRequired => "LOGIN_REQUIRED",
            Self::Unavailable(_) => "UNAVAILABLE",
            Self::NoAudio => "NO_AUDIO",
            Self::Parse(_) => "PARSE",
        }
    }
}

#[derive(Clone, Debug)]
pub struct Resolved {
    pub url: String,
    pub mime_type: String,
    pub content_length: Option<u64>,
    pub itag: u64,
    pub bitrate: u64,
    pub expires_at: u64,
}

/// Lo que la interfaz recibe de `resolve_audio` (nunca la URL: va ligada a la IP y solo la usa este módulo).
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedInfo {
    pub mime_type: String,
    pub content_length: Option<u64>,
    pub itag: u64,
    pub bitrate: u64,
    pub expires_at: u64,
}

impl From<&Resolved> for ResolvedInfo {
    fn from(value: &Resolved) -> Self {
        Self {
            mime_type: value.mime_type.clone(),
            content_length: value.content_length,
            itag: value.itag,
            bitrate: value.bitrate,
            expires_at: value.expires_at,
        }
    }
}

// ---------- Funciones puras (con pruebas) ----------

/// `visitorData` de la respuesta de `/sw.js_data` (JSPB con prefijo `)]}'`): `[0][2][0][0][13]`.
pub fn parse_visitor(text: &str) -> Result<String, ResolveError> {
    let body = text.strip_prefix(")]}'").ok_or_else(|| ResolveError::Visitor("formato inesperado".into()))?;
    let data: Value = serde_json::from_str(body).map_err(|error| ResolveError::Visitor(error.to_string()))?;
    data.pointer("/0/2/0/0/13")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
        .ok_or_else(|| ResolveError::Visitor("sin visitorData".into()))
}

/// Instante (segundos) en que caduca una URL de googlevideo (`expire=`).
pub fn expire_from_url(url: &str) -> Option<u64> {
    let query = url.split_once('?')?.1;
    query.split('&').find_map(|pair| pair.strip_prefix("expire=")?.parse().ok())
}

/// Mejor formato de solo audio con URL directa: itag 140 (AAC en mp4, el más compatible) y, si no hay, el de mayor
/// bitrate entre mp4 y webm.
pub fn pick_audio_format(response: &Value) -> Option<Resolved> {
    let formats = response.pointer("/streamingData/adaptiveFormats")?.as_array()?;
    let mut candidates: Vec<(&Value, u64, u64)> = formats
        .iter()
        .filter_map(|format| {
            let mime = format.get("mimeType")?.as_str()?;
            format.get("url")?.as_str()?;
            if !(mime.starts_with("audio/mp4") || mime.starts_with("audio/webm")) {
                return None;
            }
            let itag = format.get("itag").and_then(Value::as_u64).unwrap_or(0);
            let bitrate = format.get("bitrate").and_then(Value::as_u64).unwrap_or(0);
            Some((format, itag, bitrate))
        })
        .collect();
    candidates.sort_by_key(|(_, itag, bitrate)| (u8::from(*itag != 140), std::cmp::Reverse(*bitrate)));
    let (format, itag, bitrate) = candidates.into_iter().next()?;
    let url = format.get("url")?.as_str()?.to_owned();
    Some(Resolved {
        mime_type: format.get("mimeType")?.as_str()?.to_owned(),
        content_length: format.get("contentLength").and_then(Value::as_str).and_then(|v| v.parse().ok()),
        itag,
        bitrate,
        expires_at: expire_from_url(&url).unwrap_or_else(|| now_secs() + FALLBACK_URL_LIFETIME_SECS),
        url,
    })
}

/// Resultado de leer `playabilityStatus` de la respuesta.
pub fn check_playability(response: &Value) -> Result<(), ResolveError> {
    let status = response.pointer("/playabilityStatus/status").and_then(Value::as_str).unwrap_or("");
    match status {
        "OK" => Ok(()),
        "LOGIN_REQUIRED" => Err(ResolveError::LoginRequired),
        other => {
            let reason = response.pointer("/playabilityStatus/reason").and_then(Value::as_str).unwrap_or("");
            Err(ResolveError::Unavailable(format!("{other} {reason}").trim().to_owned()))
        }
    }
}

/// Tramo `[start, end]` (ambos incluidos) que se pide a YouTube para una petición `Range` del reproductor.
/// El primer tramo es pequeño para empezar pronto; los demás, de hasta `CHUNK`. `None` si el rango no es válido.
pub fn plan_range(header_value: Option<&str>, total: Option<u64>) -> Option<(u64, u64)> {
    let spec = header_value.map(str::trim).filter(|value| !value.is_empty()).unwrap_or("bytes=0-");
    let spec = spec.strip_prefix("bytes=")?;
    if spec.contains(',') {
        return None; // varios rangos: no los usa ningún reproductor
    }
    let (from, to) = spec.split_once('-')?;
    let (start, requested_end) = if from.is_empty() {
        let suffix: u64 = to.parse().ok().filter(|n| *n > 0)?;
        let total = total?;
        (total.saturating_sub(suffix), Some(total.saturating_sub(1)))
    } else {
        (from.parse().ok()?, if to.is_empty() { None } else { Some(to.parse::<u64>().ok()?) })
    };
    if let Some(total) = total {
        if start >= total {
            return None;
        }
    }
    let limit = if start == 0 { FIRST_CHUNK } else { CHUNK };
    let mut end = start.saturating_add(limit - 1);
    if let Some(requested) = requested_end {
        if requested < start {
            return None;
        }
        end = end.min(requested);
    }
    if let Some(total) = total {
        end = end.min(total - 1);
    }
    Some((start, end))
}

/// ¿El tramo [start, end] pedido se puede servir del primer tramo guardado (de len bytes)? Devuelve cuántos bytes
/// entregar desde el principio. Solo para peticiones que empiezan en 0 y caben dentro de lo guardado.
pub fn head_slice_len(len: usize, start: u64, end: u64) -> Option<usize> {
    if start != 0 || len == 0 {
        return None;
    }
    let wanted = usize::try_from(end).ok()?.checked_add(1)?;
    (wanted <= len).then_some(wanted)
}

/// Tamaño total que indica una respuesta `Content-Range: bytes a-b/total`.
pub fn total_from_content_range(value: &str) -> Option<u64> {
    value.rsplit_once('/')?.1.trim().parse().ok()
}

fn valid_video_id(id: &str) -> bool {
    id.len() == 11 && id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

// ---------- Resolución ----------

pub struct Resolver {
    http: reqwest::Client,
    config: Mutex<ClientConfig>,
    visitor: Mutex<Option<(String, u64)>>,
    cache: Mutex<HashMap<String, Resolved>>,
    heads: Mutex<HashMap<String, Head>>,
    heads_pending: Mutex<HashSet<String>>,
}

struct Head {
    body: Vec<u8>,
    total: u64,
    mime_type: String,
    at: u64,
}

impl Resolver {
    pub fn new() -> Self {
        let http = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(8))
            .timeout(Duration::from_secs(20))
            .build()
            .expect("cliente HTTP del resolvedor");
        Self { http, config: Mutex::new(ClientConfig::default()), visitor: Mutex::new(None), cache: Mutex::new(HashMap::new()), heads: Mutex::new(HashMap::new()), heads_pending: Mutex::new(HashSet::new()) }
    }

    pub fn set_config(&self, config: ClientConfig) -> bool {
        if !config.is_valid() {
            return false;
        }
        let mut current = self.config.lock().unwrap();
        if *current != config {
            *current = config;
            // Otro perfil de cliente: lo resuelto antes y el visitante ya no valen.
            self.cache.lock().unwrap().clear();
            self.heads.lock().unwrap().clear();
            *self.visitor.lock().unwrap() = None;
        }
        true
    }

    fn config(&self) -> ClientConfig {
        self.config.lock().unwrap().clone()
    }

    pub async fn visitor_data(&self, force: bool) -> Result<String, ResolveError> {
        if !force {
            if let Some((value, at)) = self.visitor.lock().unwrap().as_ref() {
                if now_secs().saturating_sub(*at) < VISITOR_TTL_SECS {
                    return Ok(value.clone());
                }
            }
        }
        let config = self.config();
        let response = self
            .http
            .get(SW_DATA_URL)
            .header("Accept-Language", "en-US")
            .header("User-Agent", &config.user_agent)
            .header("Accept", "*/*")
            .header("Referer", "https://www.youtube.com/sw.js")
            .header("Cookie", "PREF=tz=America.Lima;VISITOR_INFO1_LIVE=abcdefghijk;")
            .send()
            .await
            .map_err(|error| ResolveError::Network(error.to_string()))?;
        if !response.status().is_success() {
            return Err(ResolveError::Visitor(format!("HTTP {}", response.status())));
        }
        let text = response.text().await.map_err(|error| ResolveError::Network(error.to_string()))?;
        let value = parse_visitor(&text)?;
        *self.visitor.lock().unwrap() = Some((value.clone(), now_secs()));
        Ok(value)
    }

    fn cached(&self, id: &str) -> Option<Resolved> {
        let cache = self.cache.lock().unwrap();
        cache.get(id).filter(|entry| entry.expires_at > now_secs() + URL_SAFETY_SECS).cloned()
    }

    fn remember(&self, id: &str, resolved: &Resolved) {
        let mut cache = self.cache.lock().unwrap();
        cache.insert(id.to_owned(), resolved.clone());
        while cache.len() > CACHE_MAX {
            // Sale primero lo que antes caduca.
            let oldest = cache.iter().min_by_key(|(_, entry)| entry.expires_at).map(|(key, _)| key.clone());
            match oldest {
                Some(key) => cache.remove(&key),
                None => break,
            };
        }
    }

    pub fn forget(&self, id: &str) {
        self.cache.lock().unwrap().remove(id);
        self.heads.lock().unwrap().remove(id);
    }

    /// Primer tramo guardado de una pista preparada, si sirve para esa petición.
    fn head_chunk(&self, id: &str, range_header: Option<&str>) -> Option<Chunk> {
        let mut heads = self.heads.lock().unwrap();
        if heads.get(id).is_some_and(|head| now_secs().saturating_sub(head.at) > HEAD_TTL_SECS) {
            heads.remove(id);
        }
        let head = heads.get(id)?;
        let (start, end) = plan_range(range_header, Some(head.total))?;
        let take = head_slice_len(head.body.len(), start, end)?;
        Some(Chunk { start: 0, end: take as u64 - 1, total: head.total, mime_type: head.mime_type.clone(), body: head.body[..take].to_vec() })
    }

    /// Descarga por adelantado el primer tramo de una pista (se llama al prepararla). No hace nada si ya está o va en curso.
    pub async fn prefetch_head(&self, id: &str) {
        if self.heads.lock().unwrap().get(id).is_some_and(|head| now_secs().saturating_sub(head.at) <= HEAD_TTL_SECS) {
            return;
        }
        if !self.heads_pending.lock().unwrap().insert(id.to_owned()) {
            return;
        }
        if let Ok(chunk) = self.fetch_network(id, Some("bytes=0-")).await {
            if chunk.start == 0 {
                let mut heads = self.heads.lock().unwrap();
                heads.insert(id.to_owned(), Head { body: chunk.body, total: chunk.total, mime_type: chunk.mime_type, at: now_secs() });
                while heads.len() > HEAD_MAX {
                    let oldest = heads.iter().min_by_key(|(_, head)| head.at).map(|(key, _)| key.clone());
                    match oldest {
                        Some(key) => heads.remove(&key),
                        None => break,
                    };
                }
            }
        }
        self.heads_pending.lock().unwrap().remove(id);
    }

    async fn request_player(&self, id: &str, visitor: &str) -> Result<Value, ResolveError> {
        let config = self.config();
        let body = json!({
            "videoId": id,
            "racyCheckOk": true,
            "contentCheckOk": true,
            "context": {
                "client": {
                    "hl": "en",
                    "gl": "US",
                    "visitorData": visitor,
                    "clientName": config.client_name,
                    "clientVersion": config.client_version,
                    "osName": config.os_name,
                    "osVersion": config.os_version,
                    "userAgent": config.user_agent,
                    "platform": config.platform,
                    "deviceMake": config.device_make,
                    "deviceModel": config.device_model,
                },
                "user": { "lockedSafetyMode": false },
                "request": { "useSsl": true },
            },
        });
        let response = self
            .http
            .post(PLAYER_URL)
            .header("User-Agent", &config.user_agent)
            .header("Origin", "https://www.youtube.com")
            .header("X-Goog-Visitor-Id", visitor)
            .header("X-Youtube-Client-Name", &config.client_id)
            .header("X-Youtube-Client-Version", &config.client_version)
            .json(&body)
            .send()
            .await
            .map_err(|error| ResolveError::Network(error.to_string()))?;
        if !response.status().is_success() {
            return Err(ResolveError::Unavailable(format!("HTTP {}", response.status())));
        }
        response.json().await.map_err(|error| ResolveError::Parse(error.to_string()))
    }

    /// URL de audio de un vídeo (con caché). `fresh` ignora la caché (URL caducada o rechazada).
    pub async fn resolve(&self, id: &str, fresh: bool) -> Result<Resolved, ResolveError> {
        if !valid_video_id(id) {
            return Err(ResolveError::Unavailable("id de vídeo no válido".into()));
        }
        if !fresh {
            if let Some(hit) = self.cached(id) {
                return Ok(hit);
            }
        }
        let mut visitor = self.visitor_data(false).await?;
        let mut response = self.request_player(id, &visitor).await?;
        // YouTube pide "confirmar que no eres un bot" cuando el visitante ya no vale: se renueva una vez.
        if matches!(check_playability(&response), Err(ResolveError::LoginRequired)) {
            visitor = self.visitor_data(true).await?;
            response = self.request_player(id, &visitor).await?;
        }
        check_playability(&response)?;
        let resolved = pick_audio_format(&response).ok_or(ResolveError::NoAudio)?;
        self.remember(id, &resolved);
        Ok(resolved)
    }

    /// Un tramo de bytes del audio: del primer tramo guardado si la pista estaba preparada, o de YouTube.
    async fn fetch_chunk(&self, id: &str, range_header: Option<&str>) -> Result<Chunk, ResolveError> {
        if let Some(chunk) = self.head_chunk(id, range_header) {
            return Ok(chunk);
        }
        self.fetch_network(id, range_header).await
    }

    /// Tramo pedido a YouTube (con un reintento con URL nueva si rechaza la anterior).
    async fn fetch_network(&self, id: &str, range_header: Option<&str>) -> Result<Chunk, ResolveError> {
        let mut resolved = self.resolve(id, false).await?;
        for attempt in 0..2 {
            let (start, end) = plan_range(range_header, resolved.content_length)
                .ok_or_else(|| ResolveError::Unavailable("rango no válido".into()))?;
            let response = self
                .http
                .get(&resolved.url)
                .header("User-Agent", self.config().user_agent)
                .header("Range", format!("bytes={start}-{end}"))
                .send()
                .await
                .map_err(|error| ResolveError::Network(error.to_string()))?;
            let status = response.status().as_u16();
            if (status == 403 || status == 410) && attempt == 0 {
                self.forget(id);
                resolved = self.resolve(id, true).await?;
                continue;
            }
            if status != 206 {
                return Err(ResolveError::Unavailable(format!("origen HTTP {status}")));
            }
            let total = response
                .headers()
                .get(header::CONTENT_RANGE)
                .and_then(|value| value.to_str().ok())
                .and_then(total_from_content_range)
                .or(resolved.content_length)
                .ok_or_else(|| ResolveError::Parse("sin tamaño total".into()))?;
            let body = response.bytes().await.map_err(|error| ResolveError::Network(error.to_string()))?;
            if body.is_empty() {
                return Err(ResolveError::Unavailable("tramo vacío".into()));
            }
            let end = start + body.len() as u64 - 1;
            return Ok(Chunk { start, end, total, mime_type: resolved.mime_type.clone(), body: body.to_vec() });
        }
        Err(ResolveError::Unavailable("origen rechazó la URL renovada".into()))
    }
}

struct Chunk {
    start: u64,
    end: u64,
    total: u64,
    mime_type: String,
    body: Vec<u8>,
}

// ---------- Protocolo `mysicstream://` ----------

fn reply(status: StatusCode, origin: &str, extra: &[(&str, String)], body: Vec<u8>) -> HttpResponse<Vec<u8>> {
    let mut builder = HttpResponse::builder()
        .status(status)
        .header(header::ACCEPT_RANGES, "bytes")
        .header(header::CACHE_CONTROL, "no-store")
        // Con credenciales (crossOrigin = use-credentials) no vale "*": hay que devolver el origen exacto.
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, origin)
        .header(header::ACCESS_CONTROL_ALLOW_CREDENTIALS, "true")
        .header(header::VARY, "Origin")
        .header(header::ACCESS_CONTROL_EXPOSE_HEADERS, "Content-Length, Content-Range, Accept-Ranges, X-Mysic-Error")
        .header("Cross-Origin-Resource-Policy", "cross-origin");
    for (name, value) in extra {
        builder = builder.header(*name, value.as_str());
    }
    builder.body(body).unwrap_or_else(|_| HttpResponse::new(Vec::new()))
}

pub async fn respond(resolver: &Resolver, request: HttpRequest<Vec<u8>>) -> HttpResponse<Vec<u8>> {
    let origin = request
        .headers()
        .get(header::ORIGIN)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("*")
        .to_owned();
    if request.method() == Method::OPTIONS {
        return reply(StatusCode::NO_CONTENT, &origin, &[(header::ACCESS_CONTROL_ALLOW_HEADERS.as_str(), "Range".to_string())], Vec::new());
    }
    if request.method() != Method::GET && request.method() != Method::HEAD {
        return reply(StatusCode::METHOD_NOT_ALLOWED, &origin, &[], Vec::new());
    }
    let id = request.uri().path().trim_start_matches('/').to_owned();
    if !valid_video_id(&id) {
        return reply(StatusCode::NOT_FOUND, &origin, &[], Vec::new());
    }
    let range = request.headers().get(header::RANGE).and_then(|value| value.to_str().ok()).map(str::to_owned);
    match resolver.fetch_chunk(&id, range.as_deref()).await {
        Ok(chunk) => reply(
            StatusCode::PARTIAL_CONTENT,
            &origin,
            &[
                ("Content-Type", chunk.mime_type),
                ("Content-Range", format!("bytes {}-{}/{}", chunk.start, chunk.end, chunk.total)),
                ("Content-Length", chunk.body.len().to_string()),
            ],
            if request.method() == Method::HEAD { Vec::new() } else { chunk.body },
        ),
        Err(error) => {
            // La interfaz ve un error de medio y pasa al servidor; el código queda en la cabecera para depurar.
            let status = match error {
                ResolveError::Unavailable(_) | ResolveError::NoAudio | ResolveError::LoginRequired => StatusCode::NOT_FOUND,
                _ => StatusCode::BAD_GATEWAY,
            };
            reply(status, &origin, &[("X-Mysic-Error", error.code().to_string())], Vec::new())
        }
    }
}

// ---------- Comandos ----------

#[tauri::command]
pub async fn resolve_audio(
    resolver: tauri::State<'_, Arc<Resolver>>,
    video_id: String,
    fresh: Option<bool>,
) -> Result<ResolvedInfo, String> {
    let resolved = resolver.resolve(&video_id, fresh.unwrap_or(false)).await.map_err(|error| error.code().to_string())?;
    // Preparar una pista también descarga su primer tramo: el clic posterior no espera a abrir la conexión.
    let background = resolver.inner().clone();
    tauri::async_runtime::spawn(async move { background.prefetch_head(&video_id).await });
    Ok(ResolvedInfo::from(&resolved))
}

/// Aplica el perfil de cliente que llegó de `client-config.json`. Devuelve false si no es válido (se queda el actual).
#[tauri::command]
pub fn set_client_config(resolver: tauri::State<'_, Arc<Resolver>>, config: Value) -> bool {
    serde_json::from_value::<ClientConfig>(config).map(|parsed| resolver.set_config(parsed)).unwrap_or(false)
}

/// Obtiene el visitante de YouTube por adelantado (al abrir la aplicación) para que la primera canción no lo espere.
#[tauri::command]
pub async fn warm_resolver(resolver: tauri::State<'_, Arc<Resolver>>) -> Result<(), String> {
    resolver.visitor_data(false).await.map(|_| ()).map_err(|error| error.code().to_string())
}

#[tauri::command]
pub fn forget_audio(resolver: tauri::State<'_, Arc<Resolver>>, video_id: String) {
    resolver.forget(&video_id);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn format(itag: u64, mime: &str, bitrate: u64, url: Option<&str>) -> Value {
        let mut value = json!({ "itag": itag, "mimeType": mime, "bitrate": bitrate, "contentLength": "5000000" });
        if let Some(url) = url {
            value["url"] = json!(url);
        }
        value
    }

    #[test]
    fn visitor_se_lee_de_la_respuesta_jspb() {
        let mut device = vec![Value::Null; 14];
        device[13] = json!("VISITANTE");
        let text = format!(")]}}'{}", json!([[null, null, [[device]]]]));
        assert_eq!(parse_visitor(&text), Ok("VISITANTE".to_string()));
        assert!(parse_visitor("sin prefijo").is_err());
        assert!(parse_visitor(")]}'[[null,null,[]]]").is_err());
    }

    #[test]
    fn caducidad_de_la_url() {
        assert_eq!(expire_from_url("https://x.googlevideo.com/videoplayback?a=1&expire=1794477203&ei=z"), Some(1794477203));
        assert_eq!(expire_from_url("https://x.googlevideo.com/videoplayback?a=1"), None);
        assert_eq!(expire_from_url("sin consulta"), None);
    }

    #[test]
    fn prefiere_el_itag_140_y_si_no_el_de_mayor_bitrate() {
        let url = "https://x/videoplayback?expire=2000000000";
        let response = json!({ "streamingData": { "adaptiveFormats": [
            format(251, "audio/webm; codecs=\"opus\"", 151_000, Some(url)),
            format(140, "audio/mp4; codecs=\"mp4a.40.2\"", 131_000, Some(url)),
            format(137, "video/mp4; codecs=\"avc1\"", 900_000, Some(url)),
        ] } });
        assert_eq!(pick_audio_format(&response).unwrap().itag, 140);
        let sin_140 = json!({ "streamingData": { "adaptiveFormats": [
            format(249, "audio/webm; codecs=\"opus\"", 50_000, Some(url)),
            format(251, "audio/webm; codecs=\"opus\"", 151_000, Some(url)),
        ] } });
        let elegido = pick_audio_format(&sin_140).unwrap();
        assert_eq!((elegido.itag, elegido.expires_at, elegido.content_length), (251, 2_000_000_000, Some(5_000_000)));
    }

    #[test]
    fn sin_url_directa_o_sin_audio_no_hay_formato() {
        let cifrado = json!({ "streamingData": { "adaptiveFormats": [format(140, "audio/mp4", 1, None)] } });
        assert!(pick_audio_format(&cifrado).is_none());
        assert!(pick_audio_format(&json!({})).is_none());
        let solo_video = json!({ "streamingData": { "adaptiveFormats": [format(137, "video/mp4", 1, Some("https://x"))] } });
        assert!(pick_audio_format(&solo_video).is_none());
    }

    #[test]
    fn estado_de_reproduccion() {
        assert_eq!(check_playability(&json!({ "playabilityStatus": { "status": "OK" } })), Ok(()));
        assert_eq!(check_playability(&json!({ "playabilityStatus": { "status": "LOGIN_REQUIRED" } })), Err(ResolveError::LoginRequired));
        let bloqueado = check_playability(&json!({ "playabilityStatus": { "status": "UNPLAYABLE", "reason": "No disponible" } }));
        assert_eq!(bloqueado, Err(ResolveError::Unavailable("UNPLAYABLE No disponible".into())));
        assert!(check_playability(&json!({})).is_err());
    }

    #[test]
    fn el_primer_tramo_es_pequeno_y_los_demas_grandes() {
        assert_eq!(plan_range(Some("bytes=0-"), Some(10_000_000)), Some((0, FIRST_CHUNK - 1)));
        assert_eq!(plan_range(None, Some(10_000_000)), Some((0, FIRST_CHUNK - 1)));
        assert_eq!(plan_range(Some("bytes=262144-"), Some(10_000_000)), Some((262_144, 262_144 + CHUNK - 1)));
    }

    #[test]
    fn el_tramo_respeta_rango_cerrado_y_tamano_total() {
        assert_eq!(plan_range(Some("bytes=100-199"), Some(10_000_000)), Some((100, 199)));
        assert_eq!(plan_range(Some("bytes=9999000-"), Some(10_000_000)), Some((9_999_000, 9_999_999)));
        assert_eq!(plan_range(Some("bytes=0-"), Some(1000)), Some((0, 999)));
        assert_eq!(plan_range(Some("bytes=-500"), Some(10_000)), Some((9500, 9999)));
        // Sin tamaño conocido solo se puede acotar por tramo.
        assert_eq!(plan_range(Some("bytes=1000-"), None), Some((1000, 1000 + CHUNK - 1)));
    }

    #[test]
    fn rangos_no_validos() {
        for header in ["bytes=5-1", "bytes=0-1,5-9", "items=0-1", "bytes=abc-", "bytes=-0"] {
            assert_eq!(plan_range(Some(header), Some(10_000)), None, "{header}");
        }
        assert_eq!(plan_range(Some("bytes=10000-"), Some(10_000)), None);
        assert_eq!(plan_range(Some("bytes=-500"), None), None);
    }

    #[test]
    fn el_primer_tramo_guardado_solo_sirve_peticiones_desde_el_principio_que_caben() {
        assert_eq!(head_slice_len(262_144, 0, 262_143), Some(262_144));
        assert_eq!(head_slice_len(262_144, 0, 499), Some(500));
        assert_eq!(head_slice_len(262_144, 0, 262_144), None, "pide más de lo guardado");
        assert_eq!(head_slice_len(262_144, 1, 100), None, "un salto va a la red");
        assert_eq!(head_slice_len(0, 0, 0), None);
    }

    #[test]
    fn tamano_total_desde_content_range() {
        assert_eq!(total_from_content_range("bytes 0-262143/7720635"), Some(7_720_635));
        assert_eq!(total_from_content_range("bytes 0-1/*"), None);
        assert_eq!(total_from_content_range("sin barra"), None);
    }

    #[test]
    fn ids_de_video() {
        assert!(valid_video_id("OJqSKKslH8g"));
        assert!(valid_video_id("a-b_c1234ZZ"));
        for id in ["", "corto", "..%2F..%2Fsecret", "OJqSKKslH8g/", "OJqSKKslH8 "] {
            assert!(!valid_video_id(id), "{id}");
        }
    }

    #[test]
    fn la_configuracion_remota_solo_se_acepta_si_es_valida() {
        assert!(ClientConfig::default().is_valid());
        let mut vacia = ClientConfig::default();
        vacia.client_name = " ".into();
        assert!(!vacia.is_valid());
        let mut con_control = ClientConfig::default();
        con_control.user_agent = "Mozilla\nX-Injected: 1".into();
        assert!(!con_control.is_valid());
        let mut id_raro = ClientConfig::default();
        id_raro.client_id = "10a".into();
        assert!(!id_raro.is_valid());
        let parcial: ClientConfig = serde_json::from_value(json!({ "clientVersion": "1.03" })).unwrap();
        assert_eq!(parcial.client_version, "1.03");
        assert_eq!(parcial.client_name, "VISIONOS", "lo que falta usa el valor por defecto");
        let resolver = Resolver::new();
        assert!(!resolver.set_config(vacia));
        assert!(resolver.set_config(parcial));
    }
}

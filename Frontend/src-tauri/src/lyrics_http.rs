//! Peticiones HTTP de los proveedores de letras, hechas desde el equipo del usuario.
//!
//! Por qué aquí y no en la página: varios proveedores (Netease, QQ, Kugou, Boidu…) no envían cabeceras CORS o exigen
//! `Referer`, así que el navegador no puede llamarlos. Y por qué no en el servidor de Mysic: desde la IP del usuario
//! responden en 0,3-3 s sin cargar el VPS. La interfaz (src/features/lyrics/sources) decide qué pedir y cómo leerlo;
//! este módulo solo hace la petición, y únicamente a los dominios de la lista: no es un proxy abierto.

use std::collections::HashMap;
use std::sync::OnceLock;
use std::time::Duration;

use serde::{Deserialize, Serialize};

const ALLOWED_HOSTS: &[&str] = &[
    "lyrics-api.boidu.dev",
    "lyricsplus.binimum.org",
    "unison.betterlyrics.org",
    "music.163.com",
    "c.y.qq.com",
    "songsearch.kugou.com",
    "krcs.kugou.com",
    "lyrics.kugou.com",
    "lrclib.net",
    // Traducción de la letra (sources/translate.js): solo el texto de la letra.
    "translate.googleapis.com",
];
const MAX_BODY_BYTES: usize = 2 * 1024 * 1024;
const USER_AGENT: &str = "Mysic/1.0 (lyrics client)";

fn client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .user_agent(USER_AGENT)
            .connect_timeout(Duration::from_secs(5))
            .timeout(Duration::from_secs(8))
            // Conexiones reutilizadas: la segunda canción ya no paga el apretón de manos TLS con cada proveedor.
            .pool_idle_timeout(Duration::from_secs(120))
            .build()
            .expect("cliente HTTP de letras")
    })
}

#[derive(Debug, Deserialize)]
pub struct LyricsHttpRequest {
    url: String,
    #[serde(default)]
    method: Option<String>,
    #[serde(default)]
    headers: HashMap<String, String>,
    /// Cuerpo de un POST de formulario (`application/x-www-form-urlencoded`), ya codificado.
    #[serde(default)]
    form: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct LyricsHttpResponse {
    status: u16,
    body: String,
}

fn allowed(url: &reqwest::Url) -> bool {
    url.scheme() == "https" && url.host_str().is_some_and(|host| ALLOWED_HOSTS.contains(&host))
}

#[tauri::command]
pub async fn lyrics_http(request: LyricsHttpRequest) -> Result<LyricsHttpResponse, String> {
    let url = reqwest::Url::parse(&request.url).map_err(|_| "URL_INVALID".to_string())?;
    if !allowed(&url) {
        return Err("HOST_NOT_ALLOWED".to_string());
    }
    let post = request.method.as_deref().is_some_and(|method| method.eq_ignore_ascii_case("POST"));
    let mut builder = if post { client().post(url) } else { client().get(url) };
    for (name, value) in &request.headers {
        // Solo cabeceras inofensivas: el agente de usuario lo pone el cliente.
        if matches!(name.to_ascii_lowercase().as_str(), "referer" | "accept" | "content-type") {
            builder = builder.header(name, value);
        }
    }
    if let Some(form) = request.form {
        builder = builder.header("content-type", "application/x-www-form-urlencoded").body(form);
    }
    let response = builder.send().await.map_err(|error| {
        if error.is_timeout() { "TIMEOUT".to_string() } else { "NETWORK".to_string() }
    })?;
    let status = response.status().as_u16();
    let bytes = response.bytes().await.map_err(|_| "NETWORK".to_string())?;
    if bytes.len() > MAX_BODY_BYTES {
        return Err("TOO_LARGE".to_string());
    }
    Ok(LyricsHttpResponse { status, body: String::from_utf8_lossy(&bytes).into_owned() })
}

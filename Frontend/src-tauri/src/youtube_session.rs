use std::collections::BTreeMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;

use serde::Serialize;
use tauri::webview::PageLoadEvent;
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

const LOGIN_WINDOW_LABEL: &str = "youtube-music-login";
const SESSION_EVENT: &str = "youtube-music-session";
const SESSION_ERROR_EVENT: &str = "youtube-music-session-error";
const GOOGLE_LOGIN_URL: &str =
    "https://accounts.google.com/ServiceLogin?service=youtube&continue=https%3A%2F%2Fmusic.youtube.com%2F";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CapturedSession {
    cookie: String,
    account_index: u8,
}

#[derive(Clone, Serialize)]
struct SessionError {
    message: String,
}

fn is_youtube_domain(domain: Option<&str>) -> bool {
    domain
        .map(|value| value.trim_start_matches('.').to_ascii_lowercase())
        .is_some_and(|value| value == "youtube.com" || value.ends_with(".youtube.com"))
}

fn collect_youtube_session(window: &WebviewWindow) -> Result<CapturedSession, String> {
    let cookies = window
        .cookies()
        .map_err(|_| "No se pudo leer la sesión segura de YouTube Music.".to_string())?;
    let mut values = BTreeMap::new();
    for cookie in cookies {
        if is_youtube_domain(cookie.domain()) && !cookie.value().is_empty() {
            values.insert(cookie.name().to_string(), cookie.value().to_string());
        }
    }

    if !values.contains_key("SAPISID") {
        if let Some(value) = values.get("__Secure-3PAPISID").cloned() {
            values.insert("SAPISID".to_string(), value);
        }
    }
    if !values.contains_key("SAPISID") {
        return Err("YouTube Music todavía no confirmó una sesión activa.".to_string());
    }

    Ok(CapturedSession {
        cookie: values
            .into_iter()
            .map(|(name, value)| format!("{name}={value}"))
            .collect::<Vec<_>>()
            .join("; "),
        account_index: 0,
    })
}

fn capture_after_music_load(
    window: WebviewWindow,
    capture_started: Arc<AtomicBool>,
    capture_completed: Arc<AtomicBool>,
) {
    if capture_started.swap(true, Ordering::AcqRel) {
        return;
    }
    thread::spawn(move || {
        let app = window.app_handle().clone();
        for attempt in 0..8 {
            if attempt > 0 {
                thread::sleep(Duration::from_millis(500));
            }
            if let Ok(session) = collect_youtube_session(&window) {
                capture_completed.store(true, Ordering::Release);
                if let Some(main_window) = app.get_webview_window("main") {
                    let _ = main_window.emit(SESSION_EVENT, session);
                }
                let _ = window.close();
                return;
            }
        }
        capture_started.store(false, Ordering::Release);
        if let Some(main_window) = app.get_webview_window("main") {
            let _ = main_window.emit(
                SESSION_ERROR_EVENT,
                SessionError {
                    message: "No se encontró una sesión activa. Termina el acceso en la ventana de YouTube Music e inténtalo nuevamente.".to_string(),
                },
            );
        }
    });
}

#[tauri::command]
pub async fn open_youtube_music_login(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(LOGIN_WINDOW_LABEL) {
        window.show().map_err(|error| error.to_string())?;
        window.set_focus().map_err(|error| error.to_string())?;
        window.reload().map_err(|error| error.to_string())?;
        return Ok(());
    }

    let capture_started = Arc::new(AtomicBool::new(false));
    let capture_completed = Arc::new(AtomicBool::new(false));
    let login_url = GOOGLE_LOGIN_URL
        .parse()
        .map_err(|error| format!("Dirección de acceso no válida: {error}"))?;

    let completed_on_load = capture_completed.clone();
    let window = WebviewWindowBuilder::new(&app, LOGIN_WINDOW_LABEL, WebviewUrl::External(login_url))
        .title("Iniciar sesión en YouTube Music")
        .inner_size(620.0, 820.0)
        .min_inner_size(440.0, 640.0)
        .center()
        .resizable(true)
        .on_page_load(move |window, payload| {
            if payload.event() != PageLoadEvent::Finished {
                return;
            }
            let is_music_home = payload
                .url()
                .host_str()
                .is_some_and(|host| host.eq_ignore_ascii_case("music.youtube.com"));
            if is_music_home {
                capture_after_music_load(window, capture_started.clone(), completed_on_load.clone());
            }
        })
        .build()
        .map_err(|error| format!("No se pudo abrir el acceso de YouTube Music: {error}"))?;

    let close_app = app.clone();
    window.on_window_event(move |event| {
        if matches!(event, tauri::WindowEvent::Destroyed)
            && !capture_completed.load(Ordering::Acquire)
        {
            if let Some(main_window) = close_app.get_webview_window("main") {
                let _ = main_window.emit(
                    SESSION_ERROR_EVENT,
                    SessionError {
                        message: "Se cerró el acceso antes de completar la sesión de YouTube Music."
                            .to_string(),
                    },
                );
            }
        }
    });

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::is_youtube_domain;

    #[test]
    fn limits_cookie_capture_to_youtube_domains() {
        assert!(is_youtube_domain(Some(".youtube.com")));
        assert!(is_youtube_domain(Some("music.youtube.com")));
        assert!(!is_youtube_domain(Some("youtube.com.example.test")));
        assert!(!is_youtube_domain(Some("google.com")));
        assert!(!is_youtube_domain(None));
    }
}

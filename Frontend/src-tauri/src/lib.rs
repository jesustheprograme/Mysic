use std::path::PathBuf;
use std::process::Command;

use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

mod audio_session;
mod local_audio;
mod lyrics_http;
mod resolver;
mod spotify_link;
mod taskbar;
mod youtube_session;

fn automa_mysic_dir() -> PathBuf {
    let exe = std::env::current_exe().unwrap_or_default();
    let mut dir = exe.parent().unwrap_or(&exe).to_path_buf();
    for _ in 0..12 {
        if dir.join("automa_mysic").exists() {
            return dir.join("automa_mysic");
        }
        if !dir.pop() {
            break;
        }
    }
    let current = std::env::current_dir().unwrap_or_default();
    let project = current.parent().unwrap_or(&current).to_path_buf();
    project.join("automa_mysic")
}

fn run_node_script(script: &str, args: &[String]) -> Result<String, String> {
    let automa_dir = automa_mysic_dir();
    let script_path = automa_dir.join(script);

    let output = Command::new("node")
        .arg(&script_path)
        .args(args)
        .current_dir(&automa_dir)
        .output()
        .map_err(|e| format!("No se pudo ejecutar {}: {}", script, e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if !output.status.success() {
        let msg = if stderr.is_empty() {
            stdout.trim().to_string()
        } else {
            stderr.trim().to_string()
        };
        return Err(msg);
    }

    Ok(stdout.trim().to_string())
}

#[tauri::command]
fn pick_music_files() -> Result<Vec<String>, String> {
    let result = rfd::FileDialog::new()
        .add_filter("MP3 files", &["mp3"])
        .pick_files()
        .map(|paths| {
            paths
                .into_iter()
                .map(|p| p.to_string_lossy().to_string())
                .collect()
        })
        .unwrap_or_default();
    Ok(result)
}

#[tauri::command]
fn stage_music_files(paths: Vec<String>) -> Result<Vec<String>, String> {
    let mut args = vec!["stage".to_string()];
    args.extend(paths);
    let raw = run_node_script("ui-import.js", &args)?;
    let result: serde_json::Value =
        serde_json::from_str(&raw).map_err(|e| format!("No se pudo procesar respuesta: {}", e))?;
    result
        .get("staged")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect()
        })
        .ok_or_else(|| "No se encontraron archivos staged".to_string())
}

#[tauri::command]
fn analyze_music_import() -> Result<String, String> {
    run_node_script("ui-import.js", &["analyze".to_string()])
}

#[tauri::command]
fn read_music_import_state() -> Result<String, String> {
    let automa_dir = automa_mysic_dir();
    let state_path = automa_dir.join("asignar_metadatos").join(".ui-state.json");
    let content =
        std::fs::read_to_string(&state_path).map_err(|e| format!("No se leyó estado: {}", e))?;
    Ok(content)
}

#[tauri::command]
fn save_music_import(state_json: String) -> Result<String, String> {
    let automa_dir = automa_mysic_dir();
    let state_path = automa_dir.join("asignar_metadatos").join(".ui-state.json");
    std::fs::create_dir_all(state_path.parent().unwrap()).map_err(|e| format!("{}", e))?;
    std::fs::write(&state_path, &state_json).map_err(|e| format!("No se guardo estado: {}", e))?;
    Ok("ok".to_string())
}

#[tauri::command]
fn remove_music_import(file: String) -> Result<String, String> {
    run_node_script("ui-import.js", &["remove".to_string(), file])
}

#[tauri::command]
fn create_music_acquisition(urls: Vec<String>, rights_confirmed: bool) -> Result<String, String> {
    let payload = serde_json::json!({
        "urls": urls,
        "rightsConfirmed": rights_confirmed,
    });
    run_node_script(
        "acquisition-client.js",
        &["create".to_string(), payload.to_string()],
    )
}

#[tauri::command]
fn read_music_acquisition(job_id: String) -> Result<String, String> {
    run_node_script("acquisition-client.js", &["status".to_string(), job_id])
}

#[tauri::command]
fn cancel_music_acquisition(job_id: String) -> Result<String, String> {
    run_node_script("acquisition-client.js", &["cancel".to_string(), job_id])
}

#[tauri::command]
fn preview_music_import() -> Result<String, String> {
    run_node_script("ui-import.js", &["import-json".to_string()])?;
    run_node_script(
        "run-import.js",
        &["--dry-run".to_string(), "--remote-preview".to_string()],
    )
}

#[tauri::command]
fn apply_music_import() -> Result<String, String> {
    run_node_script("ui-import.js", &["import-json".to_string()])?;
    run_node_script(
        "run-import.js",
        &["--sync-catalog".to_string(), "--upload-remote".to_string()],
    )
}

/// Quita al mini reproductor los estilos de ventana con barra de título. Tauri hace las ventanas sin decoración
/// conservando `WS_CAPTION` y el marco (para el ajuste a los bordes de Windows); al redimensionar o cambiar la región
/// visible, Windows llegaba a pintar un instante la barra nativa ("Mysic Mini Player") encima de la tarjeta.
/// Sin esos estilos no hay barra que pintar. El arrastre sigue funcionando (es el de Tauri, no el del marco).
#[cfg(windows)]
fn strip_native_caption(hwnd: windows::Win32::Foundation::HWND) {
    use windows::Win32::UI::WindowsAndMessaging::{
        GetWindowLongPtrW, SetWindowLongPtrW, SetWindowPos, GWL_STYLE, SWP_FRAMECHANGED, SWP_NOACTIVATE, SWP_NOMOVE,
        SWP_NOSIZE, SWP_NOZORDER, WS_POPUP,
    };
    unsafe {
        let style = GetWindowLongPtrW(hwnd, GWL_STYLE) as u32;
        let next = (style & !CAPTION_STYLES) | WS_POPUP.0;
        if next == style {
            return;
        }
        SetWindowLongPtrW(hwnd, GWL_STYLE, next as isize);
        // El cambio de marco solo se aplica con SWP_FRAMECHANGED.
        let _ = SetWindowPos(hwnd, None, 0, 0, 0, 0, SWP_FRAMECHANGED | SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE);
    }
}

#[cfg(windows)]
const CAPTION_STYLES: u32 = windows::Win32::UI::WindowsAndMessaging::WS_CAPTION.0
    | windows::Win32::UI::WindowsAndMessaging::WS_THICKFRAME.0
    | windows::Win32::UI::WindowsAndMessaging::WS_SYSMENU.0
    | windows::Win32::UI::WindowsAndMessaging::WS_MINIMIZEBOX.0
    | windows::Win32::UI::WindowsAndMessaging::WS_MAXIMIZEBOX.0;

/// Guardia del mini reproductor: Tauri vuelve a poner sus estilos (con `WS_CAPTION`) cada vez que cambia una propiedad
/// de la ventana, por ejemplo "siempre encima" al fijarla o al abrirla, y entonces Windows pintaba la barra de título
/// nativa, que se veía al aclararse la tarjeta. Aquí se quitan la barra y el marco de cualquier cambio de estilo antes
/// de aplicarse, venga de donde venga.
#[cfg(windows)]
unsafe extern "system" fn mini_player_no_caption(
    hwnd: windows::Win32::Foundation::HWND,
    message: u32,
    wparam: windows::Win32::Foundation::WPARAM,
    lparam: windows::Win32::Foundation::LPARAM,
    _id: usize,
    _data: usize,
) -> windows::Win32::Foundation::LRESULT {
    use windows::Win32::UI::Shell::DefSubclassProc;
    use windows::Win32::UI::WindowsAndMessaging::{GWL_STYLE, STYLESTRUCT, WM_STYLECHANGING, WS_POPUP};
    if message == WM_STYLECHANGING && wparam.0 as i32 == GWL_STYLE.0 && lparam.0 != 0 {
        let change = &mut *(lparam.0 as *mut STYLESTRUCT);
        change.styleNew = (change.styleNew & !CAPTION_STYLES) | WS_POPUP.0;
    }
    DefSubclassProc(hwnd, message, wparam, lparam)
}

#[tauri::command]
fn set_mini_player_bounds(
    app: tauri::AppHandle,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    clip_y: i32,
    clip_height: u32,
) -> Result<(), String> {
    let window = app
        .get_webview_window("mini-player")
        .ok_or_else(|| "mini player window not found".to_string())?;

    #[cfg(windows)]
    {
        use windows::Win32::{
            Foundation::RECT,
            Graphics::Gdi::{CreateRoundRectRgn, DeleteObject, SetWindowRgn, HGDIOBJ},
            UI::WindowsAndMessaging::{GetWindowRect, SetWindowPos, SWP_NOACTIVATE, SWP_NOZORDER},
        };

        let hwnd = window.hwnd().map_err(|error| error.to_string())?;
        strip_native_caption(hwnd);
        unsafe {
            let mut current_bounds = RECT::default();
            GetWindowRect(hwnd, &mut current_bounds).map_err(|error| error.to_string())?;

            let bounds_changed = current_bounds.left != x
                || current_bounds.top != y
                || current_bounds.right - current_bounds.left != width as i32
                || current_bounds.bottom - current_bounds.top != height as i32;

            // Primero la región visible y después el tamaño: así nunca se ve, ni un instante, la ventana entera sin
            // recortar (antes se movía primero y la región llegaba después).
            // Exclude the transparent CSS padding from the native window region.
            // WebView2 can paint that padding white when a transparent window loses focus.
            let scale = width as f64 / 380.0;
            let inset = (8.0 * scale).round() as i32;
            let corner_diameter = (32.0 * scale).round() as i32;
            let clip_top = clip_y.max(0);
            let clip_bottom = clip_y.saturating_add(clip_height as i32).min(height as i32);
            let region = CreateRoundRectRgn(
                inset,
                clip_top.saturating_add(inset),
                (width as i32).saturating_sub(inset),
                clip_bottom.saturating_sub(inset),
                corner_diameter,
                corner_diameter,
            );
            if region.0.is_null() {
                return Err("failed to create mini player window region".to_string());
            }
            if SetWindowRgn(hwnd, Some(region), true) == 0 {
                let _ = DeleteObject(HGDIOBJ(region.0));
                return Err("failed to apply mini player window region".to_string());
            }

            if bounds_changed {
                SetWindowPos(
                    hwnd,
                    None,
                    x,
                    y,
                    width as i32,
                    height as i32,
                    SWP_NOACTIVATE | SWP_NOZORDER,
                )
                .map_err(|error| error.to_string())?;
            }
        }
    }

    #[cfg(not(windows))]
    {
        use tauri::{PhysicalPosition, PhysicalSize};

        window
            .set_size(PhysicalSize::new(width, height))
            .map_err(|error| error.to_string())?;
        window
            .set_position(PhysicalPosition::new(x, y))
            .map_err(|error| error.to_string())?;
    }

    Ok(())
}

#[tauri::command]
async fn open_mini_player(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("mini-player") {
        window.show().map_err(|error| error.to_string())?;
        window.set_focus().map_err(|error| error.to_string())?;
        return Ok(());
    }

    #[cfg(debug_assertions)]
    let mini_player_url = WebviewUrl::External(
        "http://localhost:5173/#/mini-player"
            .parse()
            .map_err(|error| format!("invalid mini player dev URL: {error}"))?,
    );
    #[cfg(not(debug_assertions))]
    let mini_player_url = WebviewUrl::App("index.html".into());

    WebviewWindowBuilder::new(&app, "mini-player", mini_player_url)
        .initialization_script("window.__MYSIC_MINI_PLAYER__ = true;")
        .title("Mysic Mini Player")
        .inner_size(380.0, 500.0)
        .min_inner_size(380.0, 500.0)
        .max_inner_size(380.0, 500.0)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        // Windows draws an opaque-looking frame around transparent windows when
        // the native shadow is enabled. The card already provides its own shadow.
        .shadow(false)
        .visible(false)
        .build()
        .map_err(|error| error.to_string())?;

    // Sin barra de título nativa desde el principio (antes de mostrarse por primera vez) y para siempre: la guardia
    // impide que Tauri la vuelva a poner.
    // Windows solo deja instalar la guardia desde el hilo que creó la ventana (el principal); este comando es
    // asíncrono y corre en otro hilo, así que se hace allí. El HWND viaja como número (no es Send).
    #[cfg(windows)]
    if let Some(window) = app.get_webview_window("mini-player") {
        if let Ok(hwnd) = window.hwnd() {
            let raw = hwnd.0 as isize;
            app.run_on_main_thread(move || {
                let hwnd = windows::Win32::Foundation::HWND(raw as *mut core::ffi::c_void);
                unsafe {
                    let _ = windows::Win32::UI::Shell::SetWindowSubclass(hwnd, Some(mini_player_no_caption), 1, 0);
                }
                strip_native_caption(hwnd);
            })
            .map_err(|error| error.to_string())?;
        }
    }

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_oauth::init())
        .plugin(tauri_plugin_opener::init())
        // Copias locales de audio: se guardan en el disco del usuario y se sirven por `mysicaudio://`
        // (con soporte de Range) fuera del hilo de la interfaz.
        .setup(|app| {
            let dir = app.path().app_local_data_dir()?.join("audio");
            app.manage(local_audio::LocalAudio::open(dir));
            app.manage(std::sync::Arc::new(resolver::Resolver::new()));
            // El mezclador de volumen de Windows muestra "Mysic" y su icono en vez de "Microsoft Edge WebView2".
            audio_session::start();
            Ok(())
        })
        .register_asynchronous_uri_scheme_protocol(local_audio::SCHEME, |context, request, responder| {
            let audio = context.app_handle().state::<local_audio::LocalAudio>().inner().clone();
            tauri::async_runtime::spawn_blocking(move || responder.respond(local_audio::respond(&audio, &request)));
        })
        // Audio de YouTube resuelto en este equipo y servido por tramos (ver resolver.rs).
        .register_asynchronous_uri_scheme_protocol(resolver::SCHEME, |context, request, responder| {
            let resolver = context.app_handle().state::<std::sync::Arc<resolver::Resolver>>().inner().clone();
            tauri::async_runtime::spawn(async move { responder.respond(resolver::respond(&resolver, request).await) });
        })
        .invoke_handler(tauri::generate_handler![
            local_audio::local_audio_list,
            local_audio::local_audio_usage,
            local_audio::local_audio_begin,
            local_audio::local_audio_append,
            local_audio::local_audio_commit,
            local_audio::local_audio_abort,
            local_audio::local_audio_remove,
            pick_music_files,
            stage_music_files,
            analyze_music_import,
            read_music_import_state,
            save_music_import,
            remove_music_import,
            create_music_acquisition,
            read_music_acquisition,
            cancel_music_acquisition,
            preview_music_import,
            apply_music_import,
            open_mini_player,
            set_mini_player_bounds,
            taskbar::set_taskbar_playback,
            resolver::resolve_audio,
            resolver::set_client_config,
            resolver::fetch_client_config,
            resolver::warm_resolver,
            resolver::forget_audio,
            spotify_link::spotify_link_info,
            lyrics_http::lyrics_http,
        youtube_session::open_youtube_music_login,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Mysic");
}

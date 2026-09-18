use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

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
        unsafe {
            let mut current_bounds = RECT::default();
            GetWindowRect(hwnd, &mut current_bounds).map_err(|error| error.to_string())?;

            let bounds_changed = current_bounds.left != x
                || current_bounds.top != y
                || current_bounds.right - current_bounds.left != width as i32
                || current_bounds.bottom - current_bounds.top != height as i32;
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

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_oauth::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            open_mini_player,
            set_mini_player_bounds
        ])
        .run(tauri::generate_context!())
        .expect("error while running Mysic");
}

//! Botones de la miniatura de la barra de tareas de Windows (anterior, reproducir/pausar, siguiente y
//! "me gusta"). La interfaz envía el estado con `set_taskbar_playback` y recibe las pulsaciones como
//! el evento `taskbar-control` ("previous" | "toggle" | "next" | "like").
//!
//! Todo lo nativo ocurre en el hilo de la ventana principal: la barra de tareas solo admite llamadas
//! desde el hilo que posee la ventana.

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackState {
    /// Hay una canción cargada (si no, los botones se desactivan).
    pub has_track: bool,
    pub playing: bool,
    pub liked: bool,
    /// La canción admite "me gusta" (si no, ese botón se desactiva).
    pub can_like: bool,
}

#[tauri::command]
pub fn set_taskbar_playback(app: tauri::AppHandle, state: PlaybackState) -> Result<(), String> {
    #[cfg(windows)]
    {
        let handle = app.clone();
        app.run_on_main_thread(move || native::apply(&handle, state))
            .map_err(|error| error.to_string())?;
    }
    #[cfg(not(windows))]
    {
        let _ = (app, state);
    }
    Ok(())
}

#[cfg(windows)]
mod native {
    use std::cell::RefCell;
    use std::sync::OnceLock;

    use tauri::{Emitter, Manager};
    use windows::core::w;
    use windows::Win32::Foundation::{COLORREF, HWND, LPARAM, LRESULT, RECT, WPARAM};
    use windows::Win32::Graphics::Gdi::{
        CreateBitmap, CreateCompatibleDC, CreateDIBSection, CreateFontW, DeleteDC, DeleteObject, DrawTextW, GdiFlush,
        SelectObject, SetBkMode, SetTextColor, ANTIALIASED_QUALITY, BITMAPINFO, BITMAPINFOHEADER, CLIP_DEFAULT_PRECIS,
        DEFAULT_CHARSET, DIB_RGB_COLORS, DT_CENTER, DT_NOCLIP, DT_SINGLELINE, DT_VCENTER, HGDIOBJ, OUT_DEFAULT_PRECIS,
        TRANSPARENT,
    };
    use windows::Win32::System::Com::{CoCreateInstance, CLSCTX_INPROC_SERVER};
    use windows::Win32::System::Registry::{RegGetValueW, HKEY_CURRENT_USER, RRF_RT_REG_DWORD};
    use windows::Win32::UI::HiDpi::GetDpiForWindow;
    use windows::Win32::UI::Shell::{
        DefSubclassProc, ITaskbarList3, SetWindowSubclass, TaskbarList, THBF_DISABLED, THBF_ENABLED, THBN_CLICKED,
        THB_FLAGS, THB_ICON, THB_TOOLTIP, THUMBBUTTON, THUMBBUTTONFLAGS,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        CreateIconIndirect, DestroyIcon, RegisterWindowMessageW, HICON, ICONINFO, WM_COMMAND,
    };

    use super::PlaybackState;

    const ID_PREVIOUS: u32 = 1;
    const ID_TOGGLE: u32 = 2;
    const ID_NEXT: u32 = 3;
    const ID_LIKE: u32 = 4;
    const SUBCLASS_ID: usize = 0x4D59_5349; // "MYSI"

    // Glifos de "Segoe MDL2 Assets" (incluida en Windows 10 y 11).
    const GLYPH_PREVIOUS: u16 = 0xE892;
    const GLYPH_PLAY: u16 = 0xE768;
    const GLYPH_PAUSE: u16 = 0xE769;
    const GLYPH_NEXT: u16 = 0xE893;
    const GLYPH_HEART: u16 = 0xEB51;
    const GLYPH_HEART_FILL: u16 = 0xEB52;
    /// Color del corazón marcado (el mismo verde que en la aplicación).
    const LIKED_COLOR: (u8, u8, u8) = (0x3D, 0xDC, 0x84);

    struct Icons {
        light_theme: bool,
        size: i32,
        previous: HICON,
        play: HICON,
        pause: HICON,
        next: HICON,
        heart: HICON,
        heart_fill: HICON,
    }

    impl Icons {
        fn all(&self) -> [HICON; 6] {
            [self.previous, self.play, self.pause, self.next, self.heart, self.heart_fill]
        }
    }

    #[derive(Default)]
    struct Bar {
        taskbar: Option<ITaskbarList3>,
        icons: Option<Icons>,
        /// Los botones ya están añadidos a la ventana actual de la barra de tareas.
        added: bool,
        subclassed: bool,
        state: PlaybackState,
        /// Mensaje que Windows envía al (re)crear el botón de la barra (por ejemplo, al reiniciar el Explorador).
        button_created_message: u32,
    }

    thread_local! {
        static BAR: RefCell<Bar> = RefCell::new(Bar::default());
    }
    static APP: OnceLock<tauri::AppHandle> = OnceLock::new();

    /// Aplica el estado a los botones; la primera vez los crea. Debe ejecutarse en el hilo de la ventana.
    pub fn apply(app: &tauri::AppHandle, state: PlaybackState) {
        let _ = APP.set(app.clone());
        let Some(window) = app.get_webview_window("main") else { return };
        let Ok(hwnd) = window.hwnd() else { return };
        BAR.with(|bar| {
            let mut bar = bar.borrow_mut();
            bar.state = state;
            // Un fallo aquí (por ejemplo, sin Explorador) no debe afectar a la reproducción.
            let _ = unsafe { sync(&mut bar, hwnd) };
        });
    }

    unsafe fn sync(bar: &mut Bar, hwnd: HWND) -> windows::core::Result<()> {
        if !bar.subclassed {
            bar.button_created_message = RegisterWindowMessageW(w!("TaskbarButtonCreated"));
            bar.subclassed = SetWindowSubclass(hwnd, Some(subclass_proc), SUBCLASS_ID, 0).as_bool();
        }
        if bar.taskbar.is_none() {
            let taskbar: ITaskbarList3 = CoCreateInstance(&TaskbarList, None, CLSCTX_INPROC_SERVER)?;
            taskbar.HrInit()?;
            bar.taskbar = Some(taskbar);
        }

        // Los iconos siguen el tema de la barra (claro u oscuro) y la escala de la pantalla.
        let light_theme = taskbar_uses_light_theme();
        let size = (16 * GetDpiForWindow(hwnd).max(96) as i32 + 48) / 96;
        if bar.icons.as_ref().is_none_or(|icons| icons.light_theme != light_theme || icons.size != size) {
            let fresh = build_icons(size, light_theme);
            if let Some(old) = bar.icons.replace(fresh) {
                // Primero se sustituyen en la barra (abajo) y después se liberan los anteriores.
                let buttons = buttons_for(bar);
                if bar.added {
                    let _ = bar.taskbar.as_ref().unwrap().ThumbBarUpdateButtons(hwnd, &buttons);
                }
                for icon in old.all() {
                    let _ = DestroyIcon(icon);
                }
            }
        }

        let buttons = buttons_for(bar);
        let taskbar = bar.taskbar.as_ref().unwrap();
        if bar.added {
            taskbar.ThumbBarUpdateButtons(hwnd, &buttons)?;
        } else {
            taskbar.ThumbBarAddButtons(hwnd, &buttons)?;
            bar.added = true;
        }
        Ok(())
    }

    fn buttons_for(bar: &Bar) -> [THUMBBUTTON; 4] {
        let icons = bar.icons.as_ref().expect("los iconos se crean antes que los botones");
        let state = bar.state;
        let enabled = |on: bool| if on { THBF_ENABLED } else { THBF_DISABLED };
        [
            button(ID_PREVIOUS, icons.previous, "Anterior", enabled(state.has_track)),
            button(
                ID_TOGGLE,
                if state.playing { icons.pause } else { icons.play },
                if state.playing { "Pausar" } else { "Reproducir" },
                enabled(state.has_track),
            ),
            button(ID_NEXT, icons.next, "Siguiente", enabled(state.has_track)),
            button(
                ID_LIKE,
                if state.liked { icons.heart_fill } else { icons.heart },
                if state.liked { "Quitar me gusta" } else { "Me gusta" },
                enabled(state.has_track && state.can_like),
            ),
        ]
    }

    fn button(id: u32, icon: HICON, tip: &str, flags: THUMBBUTTONFLAGS) -> THUMBBUTTON {
        let mut tooltip = [0u16; 260];
        for (slot, unit) in tooltip.iter_mut().zip(tip.encode_utf16().take(259)) {
            *slot = unit;
        }
        THUMBBUTTON { dwMask: THB_ICON | THB_TOOLTIP | THB_FLAGS, iId: id, iBitmap: 0, hIcon: icon, szTip: tooltip, dwFlags: flags }
    }

    unsafe extern "system" fn subclass_proc(
        hwnd: HWND,
        message: u32,
        wparam: WPARAM,
        lparam: LPARAM,
        _id: usize,
        _data: usize,
    ) -> LRESULT {
        if message == WM_COMMAND && ((wparam.0 >> 16) & 0xFFFF) as u32 == THBN_CLICKED {
            let control = match (wparam.0 & 0xFFFF) as u32 {
                ID_PREVIOUS => Some("previous"),
                ID_TOGGLE => Some("toggle"),
                ID_NEXT => Some("next"),
                ID_LIKE => Some("like"),
                _ => None,
            };
            if let (Some(control), Some(app)) = (control, APP.get()) {
                let _ = app.emit_to("main", "taskbar-control", control);
                return LRESULT(0);
            }
        }
        // El Explorador recreó el botón de la barra: hay que volver a añadir los botones de la miniatura.
        let recreated = BAR.with(|bar| {
            bar.try_borrow_mut().is_ok_and(|mut bar| {
                if message != 0 && message == bar.button_created_message {
                    bar.added = false;
                    let _ = sync(&mut bar, hwnd);
                    true
                } else {
                    false
                }
            })
        });
        if recreated {
            return LRESULT(0);
        }
        DefSubclassProc(hwnd, message, wparam, lparam)
    }

    /// ¿La barra de tareas usa el tema claro? (entonces los iconos van en oscuro)
    fn taskbar_uses_light_theme() -> bool {
        let mut value: u32 = 0;
        let mut size = std::mem::size_of::<u32>() as u32;
        let status = unsafe {
            RegGetValueW(
                HKEY_CURRENT_USER,
                w!("Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize"),
                w!("SystemUsesLightTheme"),
                RRF_RT_REG_DWORD,
                None,
                Some((&mut value as *mut u32).cast()),
                Some(&mut size),
            )
        };
        status.is_ok() && value == 1
    }

    unsafe fn build_icons(size: i32, light_theme: bool) -> Icons {
        let base = if light_theme { (0x1A, 0x1A, 0x1A) } else { (0xFF, 0xFF, 0xFF) };
        Icons {
            light_theme,
            size,
            previous: glyph_icon(GLYPH_PREVIOUS, size, base),
            play: glyph_icon(GLYPH_PLAY, size, base),
            pause: glyph_icon(GLYPH_PAUSE, size, base),
            next: glyph_icon(GLYPH_NEXT, size, base),
            heart: glyph_icon(GLYPH_HEART, size, base),
            heart_fill: glyph_icon(GLYPH_HEART_FILL, size, LIKED_COLOR),
        }
    }

    /// Dibuja un glifo de la fuente de iconos del sistema como icono con transparencia.
    /// GDI no escribe el canal alfa: se pinta en blanco sobre negro y la intensidad pasa a ser el alfa.
    unsafe fn glyph_icon(glyph: u16, size: i32, color: (u8, u8, u8)) -> HICON {
        let dc = CreateCompatibleDC(None);
        let info = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: size,
                biHeight: -size, // de arriba abajo
                biPlanes: 1,
                biBitCount: 32,
                ..Default::default()
            },
            ..Default::default()
        };
        let mut bits: *mut core::ffi::c_void = std::ptr::null_mut();
        let Ok(bitmap) = CreateDIBSection(Some(dc), &info, DIB_RGB_COLORS, &mut bits, None, 0) else {
            let _ = DeleteDC(dc);
            return HICON::default();
        };
        let previous_bitmap = SelectObject(dc, HGDIOBJ(bitmap.0));
        let font = CreateFontW(
            -(size * 13 / 16),
            0,
            0,
            0,
            400,
            0,
            0,
            0,
            DEFAULT_CHARSET,
            OUT_DEFAULT_PRECIS,
            CLIP_DEFAULT_PRECIS,
            ANTIALIASED_QUALITY,
            0,
            w!("Segoe MDL2 Assets"),
        );
        let previous_font = SelectObject(dc, HGDIOBJ(font.0));
        SetBkMode(dc, TRANSPARENT);
        SetTextColor(dc, COLORREF(0x00FF_FFFF));
        let mut rect = RECT { left: 0, top: 0, right: size, bottom: size };
        let mut text = [glyph];
        DrawTextW(dc, &mut text, &mut rect, DT_CENTER | DT_VCENTER | DT_SINGLELINE | DT_NOCLIP);
        let _ = GdiFlush();

        let pixels = std::slice::from_raw_parts_mut(bits.cast::<u8>(), (size * size * 4) as usize);
        for pixel in pixels.chunks_exact_mut(4) {
            let alpha = pixel[0].max(pixel[1]).max(pixel[2]) as u32;
            // BGRA con alfa premultiplicado.
            pixel[0] = (color.2 as u32 * alpha / 255) as u8;
            pixel[1] = (color.1 as u32 * alpha / 255) as u8;
            pixel[2] = (color.0 as u32 * alpha / 255) as u8;
            pixel[3] = alpha as u8;
        }

        SelectObject(dc, previous_font);
        SelectObject(dc, previous_bitmap);
        let mask = CreateBitmap(size, size, 1, 1, None);
        let icon = CreateIconIndirect(&ICONINFO { fIcon: true.into(), xHotspot: 0, yHotspot: 0, hbmMask: mask, hbmColor: bitmap })
            .unwrap_or_default();
        let _ = DeleteObject(HGDIOBJ(mask.0));
        let _ = DeleteObject(HGDIOBJ(bitmap.0));
        let _ = DeleteObject(HGDIOBJ(font.0));
        let _ = DeleteDC(dc);
        icon
    }
}

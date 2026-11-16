//! Nombre e icono de Mysic en el mezclador de volumen de Windows.
//!
//! El sonido no lo emite `mysic.exe` sino un proceso hijo de WebView2, así que Windows muestra la sesión de audio
//! como "Microsoft Edge WebView2" con su icono. Aquí se buscan las sesiones de audio de los procesos descendientes
//! de la app y se les pone el nombre "Mysic" y el icono del ejecutable. La sesión solo existe cuando empieza a sonar
//! algo (y puede recrearse), por eso se revisa cada pocos segundos en un hilo aparte, nunca en el de la interfaz.

#[cfg(windows)]
pub fn start() {
    use std::time::Duration;

    std::thread::Builder::new()
        .name("mysic-audio-session".into())
        .spawn(|| unsafe {
            use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};

            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
            let exe = std::env::current_exe().unwrap_or_default();
            let icon = format!("{},0", exe.display());
            loop {
                // Con la sesión ya etiquetada basta con revisar de vez en cuando (por si se recrea).
                let tagged = imp::tag_sessions(&icon).unwrap_or(0);
                std::thread::sleep(Duration::from_secs(if tagged > 0 { 20 } else { 3 }));
            }
        })
        .ok();
}

#[cfg(not(windows))]
pub fn start() {}

#[cfg(windows)]
mod imp {
    use std::collections::{HashMap, HashSet};

    use windows::core::{Interface, Result, GUID, HSTRING};
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::Media::Audio::{
        eMultimedia, eRender, IAudioSessionControl2, IAudioSessionManager2, IMMDeviceEnumerator, MMDeviceEnumerator,
    };
    use windows::Win32::System::Com::{CoCreateInstance, CoTaskMemFree, CLSCTX_ALL};
    use windows::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS,
    };

    const NAME: &str = "Mysic";

    /// Ids de esta app y de todos sus procesos descendientes (el navegador WebView2 y sus procesos de audio).
    unsafe fn own_process_tree() -> HashSet<u32> {
        let mut parents: HashMap<u32, u32> = HashMap::new();
        if let Ok(snapshot) = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) {
            let mut entry = PROCESSENTRY32W { dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32, ..Default::default() };
            if Process32FirstW(snapshot, &mut entry).is_ok() {
                loop {
                    parents.insert(entry.th32ProcessID, entry.th32ParentProcessID);
                    if Process32NextW(snapshot, &mut entry).is_err() {
                        break;
                    }
                }
            }
            let _ = CloseHandle(snapshot);
        }
        let root = std::process::id();
        let mut tree = HashSet::from([root]);
        // Los ids de proceso se reutilizan: se sube por la cadena de padres con un tope para no entrar en un ciclo.
        for (&pid, _) in parents.iter() {
            let mut current = pid;
            for _ in 0..16 {
                if current == root {
                    tree.insert(pid);
                    break;
                }
                match parents.get(&current) {
                    Some(&parent) if parent != current && parent != 0 => current = parent,
                    _ => break,
                }
            }
        }
        tree
    }

    /// Pone nombre e icono a las sesiones de audio de la app. Devuelve cuántas sesiones propias hay.
    pub unsafe fn tag_sessions(icon: &str) -> Result<usize> {
        let enumerator: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
        let device = enumerator.GetDefaultAudioEndpoint(eRender, eMultimedia)?;
        let manager: IAudioSessionManager2 = device.Activate(CLSCTX_ALL, None)?;
        let sessions = manager.GetSessionEnumerator()?;
        let count = sessions.GetCount()?;
        if count == 0 {
            return Ok(0);
        }
        let tree = own_process_tree();
        let name = HSTRING::from(NAME);
        let icon = HSTRING::from(icon);
        let mut own = 0;
        for index in 0..count {
            let Ok(control) = sessions.GetSession(index) else { continue };
            let Ok(control2) = control.cast::<IAudioSessionControl2>() else { continue };
            let Ok(pid) = control2.GetProcessId() else { continue };
            if !tree.contains(&pid) {
                continue;
            }
            own += 1;
            // Solo se escribe si hace falta: cada cambio se notifica a quien escucha el mezclador.
            let current = control
                .GetDisplayName()
                .map(|text| {
                    let value = text.to_string().unwrap_or_default();
                    CoTaskMemFree(Some(text.0 as *const _));
                    value
                })
                .unwrap_or_default();
            if current != NAME {
                let _ = control.SetDisplayName(&name, &GUID::zeroed());
                let _ = control.SetIconPath(&icon, &GUID::zeroed());
            }
        }
        Ok(own)
    }
}

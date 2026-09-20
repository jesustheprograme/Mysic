use std::path::PathBuf;
use std::process::Command;

use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

fn automa_mysic_dir() -> PathBuf {
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
    use tauri::api::dialog::FileDialog;
    let result = FileDialog::new()
        .add_filter("MP3 files", &["mp3"])
        .pick_files()
        .map_err(|e| format!("Error al abrir dialogo: {}", e))?;

    let paths: Vec<String> = result
        .into_iter()
        .map(|p| p.to_string_lossy().to_string())
        .collect();
    Ok(paths)
}

#[tauri::command]
fn stage_music_files(paths: Vec<String>) -> Result<Vec<String>, String> {
    let automa_dir = automa_mysic_dir();
    let inbox = automa_dir.join("asignar_metadatos");
    std::fs::create_dir_all(&inbox).map_err(|e| format!("No se pudo crear inbox: {}", e))?;

    let mut staged = Vec::new();
    for source in paths {
        let source_path = PathBuf::from(&source);
        if source_path.extension().and_then(|s| s.to_str()) != Some("mp3") {
            continue;
        }
        let file_name = source_path.file_name().unwrap().to_string_lossy().to_string();
        let mut dest = inbox.join(&file_name);

        if dest.exists() {
            let stem = source_path.file_stem().unwrap().to_string_lossy().to_string();
            let ext = source_path.extension().unwrap_or_default().to_string_lossy().to_string();
            let mut counter = 1;
            loop {
                let candidate = inbox.join(format!("{} ({}){}.mp3", stem, counter, ext));
                if !candidate.exists() {
                    dest = candidate;
                    break;
                }
                counter += 1;
            }
        }

        std::fs::copy(&source_path, &dest).map_err(|e| format!("No se copio {}: {}", source, e))?;
        staged.push(dest.file_name().unwrap().to_string_lossy().to_string());
    }
    Ok(staged)
}

#[tauri::command]
fn analyze_music_import() -> Result<String, String> {
    run_node_script("ui-import.js", &["analyze".to_string()])
}

#[tauri::command]
fn read_music_import_state() -> Result<String, String> {
    let automa_dir = automa_mysic_dir();
    let state_path = automa_dir.join("asignar_metadatos").join(".ui-state.json");
    let content = std::fs::read_to_string(&state_path)
        .map_err(|e| format!("No se leyó estado: {}", e))?;
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
fn preview_music_import() -> Result<String, String> {
    run_node_script("run-import.js", &["--dry-run".to_string()])
}

#[tauri::command]
fn apply_music_import() -> Result<String, String> {
    run_node_script("run-import.js", &["--sync-catalog".to_string()])
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_oauth::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            pick_music_files,
            stage_music_files,
            analyze_music_import,
            read_music_import_state,
            save_music_import,
            preview_music_import,
            apply_music_import,
            open_mini_player,
            set_mini_player_bounds
        ])
        .run(tauri::generate_context!())
        .expect("error while running Mysic");
}

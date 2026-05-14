// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::path::Path;
use base64::{Engine as _, engine::general_purpose};
use rfd::FileDialog;

// 🔥 1. Native File Picker
#[tauri::command]
async fn os_pick_file() -> Result<Option<String>, String> {
    let file = FileDialog::new()
        .set_title("Select a File")
        .pick_file();
        
    Ok(file.map(|path| path.to_string_lossy().into_owned()))
}

// 🔥 2. Native Directory Picker
#[tauri::command]
async fn os_pick_directory() -> Result<Option<String>, String> {
    let dir = FileDialog::new()
        .set_title("Select a Directory")
        .pick_folder();
        
    Ok(dir.map(|path| path.to_string_lossy().into_owned()))
}

// 🔥 3. Open File with Default OS Application
#[tauri::command]
async fn os_open_file(file_path: String) -> Result<bool, String> {
    match open::that(&file_path) {
        Ok(_) => Ok(true),
        Err(e) => Err(format!("Failed to open file: {}", e)),
    }
}

// 🔥 4. Read File and Convert to Base64 (For the web frontend)
#[tauri::command]
async fn os_get_base64(file_path: String) -> Result<Option<String>, String> {
    let path = Path::new(&file_path);
    
    if !path.exists() {
        return Err("File does not exist".into());
    }

    let buffer = fs::read(path).map_err(|e| e.to_string())?;
    let b64 = general_purpose::STANDARD.encode(&buffer);

    // Determine the MIME type dynamically based on the extension
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
    let mime_type = match ext.as_str() {
        "svg" => "image/svg+xml",
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "pdf" => "application/pdf",
        _ => "application/octet-stream", 
    };

    Ok(Some(format!("data:{};base64,{}", mime_type, b64)))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init()) // Enables shell features if needed
        // 🔥 5. Register the handlers so the React frontend can invoke them!
        .invoke_handler(tauri::generate_handler![
            os_pick_file,
            os_pick_directory,
            os_open_file,
            os_get_base64
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

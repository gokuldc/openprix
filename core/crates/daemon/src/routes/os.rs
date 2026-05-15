use axum::{
    Json,
    extract::Query,
    http::{StatusCode, header},
    response::IntoResponse,
};
use base64::{Engine as _, engine::general_purpose};
use serde::Deserialize;
use std::{fs, path::Path};

// Assuming you have a standard ApiResponse struct in your routes module
use crate::routes::ApiResponse;

#[derive(Deserialize)]
pub struct DownloadQuery {
    pub path: String,
}

#[derive(Deserialize)]
pub struct OpenPayload {
    pub path: String,
}

#[derive(Deserialize)]
pub struct UploadPayload {
    pub filename: String,
    pub base64: String,
    #[serde(rename = "targetFolder")]
    pub target_folder: Option<String>, // 🔥 The dynamic folder target from React
}

#[derive(Deserialize)]
pub struct ScaffoldPayload {
    #[serde(rename = "rootPath")]
    pub root_path: String,
    #[serde(rename = "projectFolderName")]
    pub project_folder_name: String,
    #[serde(rename = "templateFolders")]
    pub template_folders: Vec<String>,
}

// ----------------------------------------------------------------------------
// 1. SCAFFOLD PROJECT DIRECTORY
// ----------------------------------------------------------------------------
pub async fn scaffold_project(Json(payload): Json<ScaffoldPayload>) -> Json<ApiResponse<String>> {
    let base_dir = Path::new(&payload.root_path).join(&payload.project_folder_name);

    // Create the master project folder
    if let Err(e) = fs::create_dir_all(&base_dir) {
        return Json(ApiResponse {
            success: false,
            data: None,
            error: Some(format!("Failed to create root folder: {}", e)),
        });
    }

    // Loop through the template array and generate the subdirectories
    for folder in payload.template_folders {
        let sub_path = base_dir.join(folder);
        let _ = fs::create_dir_all(&sub_path); // Ignore minor errors if folder already exists
    }

    // Return the absolute path so React can save it to the project database
    Json(ApiResponse {
        success: true,
        data: Some(base_dir.to_string_lossy().to_string()),
        error: None,
    })
}

// ----------------------------------------------------------------------------
// 2. UPLOAD FILE TO HOST
// ----------------------------------------------------------------------------
pub async fn upload_file(Json(payload): Json<UploadPayload>) -> Json<ApiResponse<String>> {
    let b64_clean = if let Some(idx) = payload.base64.find(',') {
        &payload.base64[idx + 1..]
    } else {
        &payload.base64
    };

    // 🔥 Determine where to save the file
    let upload_dir = match &payload.target_folder {
        Some(path) => Path::new(path).to_path_buf(), // Use the Scaffolded Host Folder
        None => {
            // Fallback to internal storage if the project isn't scaffolded yet
            let home = std::env::var("USERPROFILE")
                .or_else(|_| std::env::var("HOME"))
                .unwrap_or_else(|_| ".".to_string());
            Path::new(&home).join(".openprix").join("uploads")
        }
    };

    if let Err(e) = fs::create_dir_all(&upload_dir) {
        return Json(ApiResponse {
            success: false,
            data: None,
            error: Some(format!("Directory access failed: {}", e)),
        });
    }

    // Add timestamp to prevent overwriting files with the exact same name
    use std::time::{SystemTime, UNIX_EPOCH};
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis();
    let safe_name = format!(
        "{}_{}",
        ts,
        payload.filename.replace(
            |c: char| !c.is_alphanumeric() && c != '.' && c != '-' && c != '_',
            ""
        )
    );
    let filepath = upload_dir.join(&safe_name);

    match general_purpose::STANDARD.decode(b64_clean) {
        Ok(bytes) => {
            if let Err(e) = fs::write(&filepath, &bytes) {
                return Json(ApiResponse {
                    success: false,
                    data: None,
                    error: Some(format!("Write failed: {}", e)),
                });
            }
            // Return the absolute path as a simple string
            Json(ApiResponse {
                success: true,
                data: Some(filepath.to_string_lossy().to_string()),
                error: None,
            })
        }
        Err(_) => Json(ApiResponse {
            success: false,
            data: None,
            error: Some("Base64 decode failed".into()),
        }),
    }
}

// ----------------------------------------------------------------------------
// 3. DOWNLOAD / PREVIEW FILE (For Site Gallery & Docs)
// ----------------------------------------------------------------------------
pub async fn download_file(Query(query): Query<DownloadQuery>) -> impl IntoResponse {
    let path = Path::new(&query.path);

    if let Ok(bytes) = fs::read(path) {
        let mime = mime_guess::from_path(path)
            .first_or_octet_stream()
            .as_ref()
            .to_string();
        (StatusCode::OK, [(header::CONTENT_TYPE, mime)], bytes).into_response()
    } else {
        (
            StatusCode::NOT_FOUND,
            "File not found on host machine.".to_string().into_bytes(),
        )
            .into_response()
    }
}

// ----------------------------------------------------------------------------
// 4. OPEN NATIVE APPLICATION (AutoCAD, Excel, PDF Viewer)
// ----------------------------------------------------------------------------
pub async fn open_file(Json(payload): Json<OpenPayload>) -> Json<ApiResponse<String>> {
    let path = Path::new(&payload.path);

    if path.exists() {
        match open::that(path) {
            Ok(_) => Json(ApiResponse {
                success: true,
                data: Some("Opened natively".into()),
                error: None,
            }),
            Err(e) => Json(ApiResponse {
                success: false,
                data: None,
                error: Some(format!("Failed to open native app: {}", e)),
            }),
        }
    } else {
        Json(ApiResponse {
            success: false,
            data: None,
            error: Some("File missing or moved from host directory.".into()),
        })
    }
}

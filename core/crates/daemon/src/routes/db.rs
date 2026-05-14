use crate::get_openprix_dir;
use crate::init_db;
use axum::{Json, extract::State};
use base64::{Engine as _, engine::general_purpose};
use serde::Deserialize;
use serde_json::{Value, json};
use sqlx::SqlitePool;
use std::fs;

#[derive(Deserialize)]
pub struct RestorePayload {
    pub data: String, // The base64 encoded sqlite file from the frontend
}

// 🔥 1. BACKUP HANDLER
pub async fn backup_database(State(pool): State<SqlitePool>) -> Json<Value> {
    let backup_path = get_openprix_dir().join("backup_temp.sqlite");
    let path_str = backup_path.to_string_lossy().to_string();

    // Clear out any old temp files
    let _ = fs::remove_file(&backup_path);

    // Use SQLite's built-in hot-backup tool. It safely copies the data
    // without locking the database or breaking WAL mode!
    let query = format!("VACUUM INTO '{}'", path_str.replace("'", "''"));
    if let Err(e) = sqlx::query(&query).execute(&pool).await {
        return Json(json!({ "success": false, "error": format!("Backup failed: {}", e) }));
    }

    // Read the safe snapshot and convert it to base64 so the React
    // frontend can download it or save it via Tauri OS prompts.
    match fs::read(&backup_path) {
        Ok(bytes) => {
            let b64 = general_purpose::STANDARD.encode(&bytes);
            let _ = fs::remove_file(&backup_path); // Clean up temp file
            Json(json!({ "success": true, "data": b64 }))
        }
        Err(e) => Json(json!({ "success": false, "error": e.to_string() })),
    }
}

// 🔥 2. RESTORE HANDLER
pub async fn restore_database(
    State(pool): State<SqlitePool>,
    Json(payload): Json<RestorePayload>,
) -> Json<Value> {
    let bytes = match general_purpose::STANDARD.decode(&payload.data) {
        Ok(b) => b,
        Err(_) => return Json(json!({ "success": false, "error": "Invalid base64 payload." })),
    };

    let db_path = get_openprix_dir().join("database.sqlite");
    let temp_path = get_openprix_dir().join("database_restore.sqlite");

    if let Err(e) = fs::write(&temp_path, &bytes) {
        return Json(json!({ "success": false, "error": format!("Write failed: {}", e) }));
    }

    // 🔥 THE FIX: Close all active connections to the database file
    // This releases the OS lock so we can swap the files.
    pool.close().await;

    // Give the OS a millisecond to breathe and release the handles
    tokio::time::sleep(std::time::Duration::from_millis(100)).await;

    if let Err(e) = fs::rename(&temp_path, &db_path) {
        return Json(json!({
            "success": false,
            "error": format!("Overwrite failed: {}. Ensure no other process is using the DB.", e)
        }));
    }

    // Since the pool is closed, the app can no longer query the DB.
    // We must tell the user to restart or we could trigger a self-restart logic.
    Json(json!({
        "success": true,
        "data": "CRITICAL: Database file replaced. The connection pool has been closed. Please restart the OpenPrix Daemon now to resume operations."
    }))
}
pub async fn purge_database(State(pool): State<SqlitePool>) -> Json<Value> {
    let tables = [
        "app_settings",
        "projects",
        "project_boq",
        "master_boq",
        "resources",
        "regions",
        "crm_contacts",
        "org_staff",
        "staff_work_logs",
        "messages",
        "private_messages",
        "project_documents",
    ];

    for table in tables {
        let query = format!("DELETE FROM {}", table);
        if let Err(e) = sqlx::query(&query).execute(&pool).await {
            return Json(
                json!({ "success": false, "error": format!("Purge failed on {}: {}", table, e) }),
            );
        }
    }

    // Vacuum to shrink the file size on disk
    let _ = sqlx::query("VACUUM").execute(&pool).await;

    // Restore the default Admin account so we can log back in
    if let Err(e) = init_db(&pool).await {
        return Json(
            json!({ "success": false, "error": format!("Re-initialization failed: {}", e) }),
        );
    }

    Json(json!({ "success": true }))
}

use crate::{routes::ApiResponse, routes::api_response};
use axum::{
    Json,
    extract::{Path, Query, State},
    http::StatusCode,
};
use serde::Deserialize;
use shared::{Message, PrivateMessage};
use sqlx::SqlitePool;
use std::collections::HashMap;

#[derive(Deserialize)]
pub struct SendMessage {
    #[serde(rename = "projectId")]
    pub project_id: Option<String>,
    #[serde(rename = "senderId")]
    pub sender_id: String,
    pub content: String,
    #[serde(rename = "replyToId")]
    pub reply_to_id: Option<String>,
}

#[derive(Deserialize)]
pub struct SendPrivateMessage {
    #[serde(rename = "senderId")]
    pub sender_id: String,
    #[serde(rename = "receiverId")]
    pub receiver_id: String,
    pub content: String,
    #[serde(rename = "replyToId")]
    pub reply_to_id: Option<String>,
}

pub async fn get_messages(
    State(pool): State<SqlitePool>,
    Query(params): Query<HashMap<String, String>>,
) -> Result<Json<ApiResponse<Vec<Message>>>, (StatusCode, Json<ApiResponse<()>>)> {
    let q = if let Some(pid) = params.get("projectId") {
        sqlx::query_as::<_, Message>(
            "SELECT * FROM messages WHERE projectId = ? ORDER BY createdAt ASC",
        )
        .bind(pid)
        .fetch_all(&pool)
        .await
    } else {
        sqlx::query_as::<_, Message>(
            "SELECT * FROM messages WHERE projectId IS NULL ORDER BY createdAt ASC",
        )
        .fetch_all(&pool)
        .await
    };
    api_response(q.map_err(|e| e.to_string()))
}

pub async fn save_message(
    State(pool): State<SqlitePool>,
    Json(payload): Json<SendMessage>,
) -> Result<Json<ApiResponse<String>>, (StatusCode, Json<ApiResponse<()>>)> {
    let id = uuid::Uuid::new_v4().to_string();
    let created_at = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64;
    let q = "INSERT INTO messages (id, projectId, senderId, content, replyToId, createdAt) VALUES (?, ?, ?, ?, ?, ?)";
    api_response(
        sqlx::query(q)
            .bind(&id)
            .bind(payload.project_id)
            .bind(payload.sender_id)
            .bind(payload.content)
            .bind(payload.reply_to_id)
            .bind(created_at)
            .execute(&pool)
            .await
            .map(|_| id)
            .map_err(|e| e.to_string()),
    )
}

pub async fn delete_message(
    State(pool): State<SqlitePool>,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<bool>>, (StatusCode, Json<ApiResponse<()>>)> {
    api_response(
        sqlx::query("DELETE FROM messages WHERE id = ?")
            .bind(id)
            .execute(&pool)
            .await
            .map(|_| true)
            .map_err(|e| e.to_string()),
    )
}

pub async fn get_private_messages(
    State(pool): State<SqlitePool>,
    Path((u1, u2)): Path<(String, String)>,
) -> Result<Json<ApiResponse<Vec<PrivateMessage>>>, (StatusCode, Json<ApiResponse<()>>)> {
    let q = "SELECT * FROM private_messages WHERE (senderId = ? AND receiverId = ?) OR (senderId = ? AND receiverId = ?) ORDER BY createdAt ASC";
    api_response(
        sqlx::query_as::<_, PrivateMessage>(q)
            .bind(&u1)
            .bind(&u2)
            .bind(&u2)
            .bind(&u1)
            .fetch_all(&pool)
            .await
            .map_err(|e| e.to_string()),
    )
}

pub async fn save_private_message(
    State(pool): State<SqlitePool>,
    Json(payload): Json<SendPrivateMessage>,
) -> Result<Json<ApiResponse<String>>, (StatusCode, Json<ApiResponse<()>>)> {
    let id = uuid::Uuid::new_v4().to_string();
    let created_at = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64;
    let q = "INSERT INTO private_messages (id, senderId, receiverId, content, replyToId, createdAt) VALUES (?, ?, ?, ?, ?, ?)";
    api_response(
        sqlx::query(q)
            .bind(&id)
            .bind(payload.sender_id)
            .bind(payload.receiver_id)
            .bind(payload.content)
            .bind(payload.reply_to_id)
            .bind(created_at)
            .execute(&pool)
            .await
            .map(|_| id)
            .map_err(|e| e.to_string()),
    )
}

pub async fn delete_private_message(
    State(pool): State<SqlitePool>,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<bool>>, (StatusCode, Json<ApiResponse<()>>)> {
    api_response(
        sqlx::query("DELETE FROM private_messages WHERE id = ?")
            .bind(id)
            .execute(&pool)
            .await
            .map(|_| true)
            .map_err(|e| e.to_string()),
    )
}

// Dummy endpoints to keep React happy until implemented
// 🔥 THE REAL NOTIFICATION ENGINE
pub async fn check_notifications(
    State(pool): State<SqlitePool>,
    Query(params): Query<HashMap<String, String>>,
) -> Json<ApiResponse<i32>> {
    let user_id = params.get("userId").cloned().unwrap_or_default();
    let last_checked: i64 = params
        .get("lastChecked")
        .and_then(|v| v.parse().ok())
        .unwrap_or(0);

    // 1. Count unread Global & Project messages (excluding ones you sent yourself)
    let global_query = "SELECT COUNT(*) FROM messages WHERE senderId != ? AND createdAt > ?";
    let global_count: (i32,) = sqlx::query_as(global_query)
        .bind(&user_id)
        .bind(last_checked)
        .fetch_one(&pool)
        .await
        .unwrap_or((0,));

    // 2. Count unread Direct Messages (specifically sent to you)
    let dm_query = "SELECT COUNT(*) FROM private_messages WHERE receiverId = ? AND createdAt > ?";
    let dm_count: (i32,) = sqlx::query_as(dm_query)
        .bind(&user_id)
        .bind(last_checked)
        .fetch_one(&pool)
        .await
        .unwrap_or((0,));

    // Combine them!
    let total_unread = global_count.0 + dm_count.0;

    Json(ApiResponse {
        success: true,
        data: Some(total_unread),
        error: None,
    })
}
pub async fn get_kanban_tasks() -> Json<ApiResponse<Vec<serde_json::Value>>> {
    Json(ApiResponse {
        success: true,
        data: Some(vec![]),
        error: None,
    })
}

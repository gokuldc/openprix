use crate::routes::staff::Staff;
use crate::routes::{ApiResponse, api_response};
use axum::{Json, extract::State, http::StatusCode};
use serde::Deserialize;
use sqlx::SqlitePool;

#[derive(Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

pub async fn login(
    State(pool): State<SqlitePool>,
    Json(payload): Json<LoginRequest>,
) -> Result<Json<ApiResponse<Staff>>, (StatusCode, Json<ApiResponse<()>>)> {
    // 1. Find the user by username
    let user_result = sqlx::query_as::<_, Staff>("SELECT * FROM org_staff WHERE username = ?")
        .bind(&payload.username.to_lowercase())
        .fetch_optional(&pool)
        .await;

    match user_result {
        Ok(Some(user)) => {
            // 2. Extract the stored password hash
            if let Some(stored_hash) = &user.password {
                // 🔥 3. Verify the plain text password against the bcrypt hash
                let is_valid = bcrypt::verify(&payload.password, stored_hash).unwrap_or(false);

                // Fallback check just in case they are still using the old plain-text "admin123" before migrating
                let is_legacy_plaintext = stored_hash == &payload.password;

                if is_valid || is_legacy_plaintext {
                    // Success! Return the user (but strip the password hash before sending to frontend)
                    let mut safe_user = user;
                    safe_user.password = None;
                    return api_response(Ok(safe_user));
                }
            }

            // Password didn't match
            Err((
                StatusCode::UNAUTHORIZED,
                Json(ApiResponse {
                    success: false,
                    data: None,
                    error: Some("Invalid Credentials".to_string()),
                }),
            ))
        }
        Ok(None) => {
            // Username not found
            Err((
                StatusCode::UNAUTHORIZED,
                Json(ApiResponse {
                    success: false,
                    data: None,
                    error: Some("Invalid Credentials".to_string()),
                }),
            ))
        }
        Err(e) => {
            // Database error
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ApiResponse {
                    success: false,
                    data: None,
                    error: Some(e.to_string()),
                }),
            ))
        }
    }
}

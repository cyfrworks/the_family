#[allow(warnings)]
mod bindings;

use bindings::exports::cyfr::formula::run::Guest;
use bindings::cyfr::formula::invoke;

use serde_json::{json, Value};

struct Component;

impl Guest for Component {
    fn run(input: String) -> String {
        match handle_request(&input) {
            Ok(output) => output,
            Err(e) => json!({
                "error": {
                    "type": "formula_error",
                    "message": e
                }
            })
            .to_string(),
        }
    }
}

bindings::export!(Component with_types_in bindings);

const SUPABASE_REF: &str = "catalyst:moonmoon69.supabase:0.2.0";
const MIN_PASSWORD_LENGTH: usize = 8;

fn handle_request(input: &str) -> Result<String, String> {
    let parsed: Value =
        serde_json::from_str(input).map_err(|e| format!("Invalid JSON input: {e}"))?;

    let action = parsed
        .get("action")
        .and_then(|v| v.as_str())
        .ok_or("Missing required 'action'")?;

    // reset_password_with_token does not require access_token (unauthenticated flow)
    if action == "reset_password_with_token" {
        let recovery_token = parsed
            .get("recovery_token")
            .and_then(|v| v.as_str())
            .ok_or("Missing required 'recovery_token'")?;
        let new_password = parsed
            .get("new_password")
            .and_then(|v| v.as_str())
            .ok_or("Missing required 'new_password'")?;
        return reset_password_with_token(recovery_token, new_password);
    }

    let access_token = parsed
        .get("access_token")
        .and_then(|v| v.as_str())
        .ok_or("Missing required 'access_token'")?;

    match action {
        "get_profile" => get_profile(access_token),
        "update_profile" => {
            let display_name = parsed
                .get("display_name")
                .and_then(|v| v.as_str())
                .ok_or("Missing required 'display_name'")?;
            update_profile(access_token, display_name)
        }
        "change_password" => {
            let email = parsed
                .get("email")
                .and_then(|v| v.as_str())
                .ok_or("Missing required 'email'")?;
            let current_password = parsed
                .get("current_password")
                .and_then(|v| v.as_str())
                .ok_or("Missing required 'current_password'")?;
            let new_password = parsed
                .get("new_password")
                .and_then(|v| v.as_str())
                .ok_or("Missing required 'new_password'")?;
            change_password(access_token, email, current_password, new_password)
        }
        _ => Err(format!("Unknown action: {action}")),
    }
}

fn reset_password_with_token(recovery_token: &str, new_password: &str) -> Result<String, String> {
    if new_password.len() < MIN_PASSWORD_LENGTH {
        return Err(format!(
            "Password must be at least {MIN_PASSWORD_LENGTH} characters"
        ));
    }

    // Use the recovery token server-side to update the password.
    // The token never touches localStorage — it goes straight from URL to server.
    let result = auth_call(
        "auth.update_user",
        json!({
            "access_token": recovery_token,
            "body": { "password": new_password }
        }),
    );

    if let Err(e) = result {
        return Err(format!("Password reset failed: {e}"));
    }

    Ok(json!({ "success": true }).to_string())
}

fn get_profile(access_token: &str) -> Result<String, String> {
    let user = fetch_user(access_token)?;
    let user_id = user
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or("Could not determine user ID from token")?;

    let profile = supabase_call(
        "db.select",
        json!({
            "table": "profiles",
            "select": "id,display_name,tier",
            "filters": [
                { "column": "id", "op": "eq", "value": user_id }
            ],
            "limit": 1,
            "access_token": access_token
        }),
    )?;

    let row = profile
        .as_array()
        .and_then(|arr| arr.first().cloned())
        .unwrap_or(Value::Null);

    Ok(json!({ "profile": row }).to_string())
}

fn update_profile(access_token: &str, display_name: &str) -> Result<String, String> {
    let user = fetch_user(access_token)?;
    let user_id = user
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or("Could not determine user ID from token")?;

    if display_name.trim().is_empty() {
        return Err("Display name cannot be empty".to_string());
    }

    let updated = supabase_call(
        "db.update",
        json!({
            "table": "profiles",
            "body": { "display_name": display_name },
            "filters": [
                { "column": "id", "op": "eq", "value": user_id }
            ],
            "access_token": access_token
        }),
    )?;

    Ok(json!({ "updated": updated }).to_string())
}

fn change_password(
    access_token: &str,
    email: &str,
    current_password: &str,
    new_password: &str,
) -> Result<String, String> {
    // Validate new password length server-side
    if new_password.len() < MIN_PASSWORD_LENGTH {
        return Err(format!(
            "New password must be at least {MIN_PASSWORD_LENGTH} characters"
        ));
    }

    // 1. Verify the current password by attempting a sign-in
    let verify_result = auth_call(
        "auth.signin",
        json!({
            "email": email,
            "password": current_password
        }),
    );

    if verify_result.is_err() {
        return Err("Current password is incorrect".to_string());
    }

    // 2. Update to the new password using the caller's access token
    let update_result = auth_call(
        "auth.update_user",
        json!({
            "access_token": access_token,
            "body": { "password": new_password }
        }),
    );

    if let Err(e) = update_result {
        return Err(format!("Failed to update password: {e}"));
    }

    // 3. Sign in with the new password to get a fresh session
    let signin_result = auth_call(
        "auth.signin",
        json!({
            "email": email,
            "password": new_password
        }),
    )?;

    let new_access_token = signin_result
        .get("access_token")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let new_refresh_token = signin_result
        .get("refresh_token")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    Ok(json!({
        "access_token": new_access_token,
        "refresh_token": new_refresh_token
    })
    .to_string())
}

// ---------------------------------------------------------------------------
// Sub-component invocations
// ---------------------------------------------------------------------------

fn supabase_call(operation: &str, params: Value) -> Result<Value, String> {
    let request = json!({
        "reference": SUPABASE_REF,
        "input": {
            "operation": operation,
            "params": params
        },
        "type": "catalyst"
    });

    let response_str = invoke::call(&request.to_string());

    let response: Value = serde_json::from_str(&response_str)
        .map_err(|e| format!("Failed to parse Supabase response: {e}"))?;

    if let Some(err) = response.get("error") {
        return Err(format!("Supabase invoke error: {err}"));
    }

    let output = response.get("output").cloned().unwrap_or(Value::Null);
    let result = match &output {
        Value::String(s) => serde_json::from_str::<Value>(s).unwrap_or(output.clone()),
        _ => output,
    };

    if let Some(err) = result.get("error") {
        return Err(format!("Supabase error: {err}"));
    }

    Ok(result.get("data").cloned().unwrap_or(Value::Null))
}

/// Call an auth operation on the Supabase catalyst.
/// Auth responses have a different shape — the data IS the token payload.
fn auth_call(operation: &str, params: Value) -> Result<Value, String> {
    let request = json!({
        "reference": SUPABASE_REF,
        "input": {
            "operation": operation,
            "params": params
        },
        "type": "catalyst"
    });

    let response_str = invoke::call(&request.to_string());

    let response: Value = serde_json::from_str(&response_str)
        .map_err(|e| format!("Failed to parse auth response: {e}"))?;

    if let Some(err) = response.get("error") {
        return Err(format!("Auth invoke error: {err}"));
    }

    let output = response.get("output").cloned().unwrap_or(Value::Null);
    let result = match &output {
        Value::String(s) => serde_json::from_str::<Value>(s).unwrap_or(output.clone()),
        _ => output,
    };

    if let Some(err) = result.get("error") {
        return Err(format!("Auth error: {err}"));
    }

    Ok(result.get("data").cloned().unwrap_or(result))
}

fn fetch_user(access_token: &str) -> Result<Value, String> {
    auth_call(
        "auth.user",
        json!({
            "access_token": access_token
        }),
    )
}

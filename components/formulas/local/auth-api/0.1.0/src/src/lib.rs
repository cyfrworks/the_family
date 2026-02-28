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

    match action {
        "sign_up" => {
            let email = parsed
                .get("email")
                .and_then(|v| v.as_str())
                .ok_or("Missing required 'email'")?;
            let password = parsed
                .get("password")
                .and_then(|v| v.as_str())
                .ok_or("Missing required 'password'")?;
            let display_name = parsed
                .get("display_name")
                .and_then(|v| v.as_str())
                .ok_or("Missing required 'display_name'")?;
            sign_up(email, password, display_name)
        }
        "sign_in" => {
            let email = parsed
                .get("email")
                .and_then(|v| v.as_str())
                .ok_or("Missing required 'email'")?;
            let password = parsed
                .get("password")
                .and_then(|v| v.as_str())
                .ok_or("Missing required 'password'")?;
            sign_in(email, password)
        }
        "sign_out" => {
            let access_token = parsed
                .get("access_token")
                .and_then(|v| v.as_str())
                .ok_or("Missing required 'access_token'")?;
            sign_out(access_token)
        }
        "get_user" => {
            let access_token = parsed
                .get("access_token")
                .and_then(|v| v.as_str())
                .ok_or("Missing required 'access_token'")?;
            get_user(access_token)
        }
        "refresh" => {
            let refresh_token = parsed
                .get("refresh_token")
                .and_then(|v| v.as_str())
                .ok_or("Missing required 'refresh_token'")?;
            refresh(refresh_token)
        }
        "reset_password" => {
            let email = parsed
                .get("email")
                .and_then(|v| v.as_str())
                .ok_or("Missing required 'email'")?;
            reset_password(email)
        }
        _ => Err(format!("Unknown action: {action}")),
    }
}

fn sign_up(email: &str, password: &str, display_name: &str) -> Result<String, String> {
    if password.len() < MIN_PASSWORD_LENGTH {
        return Err(format!(
            "Password must be at least {MIN_PASSWORD_LENGTH} characters"
        ));
    }

    if display_name.trim().is_empty() {
        return Err("Display name cannot be empty".to_string());
    }

    let result = auth_call(
        "auth.signup",
        json!({
            "email": email,
            "password": password,
            "data": { "display_name": display_name }
        }),
    )?;

    // Normalize: Supabase returns different shapes depending on whether
    // email confirmation is enabled (user object only, no session)
    // vs autoconfirm (full token response with nested user).
    let access_token = result
        .get("access_token")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let refresh_token = result
        .get("refresh_token")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let user = if result.get("user").is_some() {
        result.get("user").cloned().unwrap_or(Value::Null)
    } else {
        // No session — the result IS the user object
        json!({
            "id": result.get("id").and_then(|v| v.as_str()).unwrap_or(""),
            "email": result.get("email").and_then(|v| v.as_str()).unwrap_or("")
        })
    };

    Ok(json!({
        "access_token": access_token,
        "refresh_token": refresh_token,
        "user": user
    })
    .to_string())
}

fn sign_in(email: &str, password: &str) -> Result<String, String> {
    let result = auth_call(
        "auth.signin",
        json!({
            "email": email,
            "password": password
        }),
    );

    match result {
        Ok(data) => {
            let access_token = data
                .get("access_token")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let refresh_token = data
                .get("refresh_token")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let user = data.get("user").cloned().unwrap_or(Value::Null);

            Ok(json!({
                "access_token": access_token,
                "refresh_token": refresh_token,
                "user": user
            })
            .to_string())
        }
        Err(_) => {
            // Intentionally vague error — no user enumeration
            Err("Invalid credentials".to_string())
        }
    }
}

fn sign_out(access_token: &str) -> Result<String, String> {
    let _ = auth_call(
        "auth.signout",
        json!({
            "access_token": access_token
        }),
    );

    Ok(json!({ "success": true }).to_string())
}

fn get_user(access_token: &str) -> Result<String, String> {
    let result = auth_call(
        "auth.user",
        json!({
            "access_token": access_token
        }),
    );

    match result {
        Ok(user) => Ok(json!({ "user": user }).to_string()),
        Err(_) => Ok(json!({ "user": null }).to_string()),
    }
}

fn refresh(refresh_token: &str) -> Result<String, String> {
    let result = auth_call(
        "auth.refresh",
        json!({
            "refresh_token": refresh_token
        }),
    );

    match result {
        Ok(data) => {
            let access_token = data
                .get("access_token")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let new_refresh_token = data
                .get("refresh_token")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let user = data.get("user").cloned().unwrap_or(Value::Null);

            Ok(json!({
                "access_token": access_token,
                "refresh_token": new_refresh_token,
                "user": user
            })
            .to_string())
        }
        Err(_) => Ok(json!({ "expired": true }).to_string()),
    }
}

fn reset_password(email: &str) -> Result<String, String> {
    let _ = auth_call(
        "auth.reset_password",
        json!({
            "email": email
        }),
    );

    // Always return success — no user enumeration
    Ok(json!({ "success": true }).to_string())
}

// ---------------------------------------------------------------------------
// Sub-component invocations
// ---------------------------------------------------------------------------

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

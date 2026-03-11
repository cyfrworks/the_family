use serde_json::{json, Value};

use crate::bindings::cyfr::formula::invoke;

pub const SUPABASE_REF: &str = "catalyst:local.supabase";
const STORAGE_BUCKET: &str = "bookkeeper-files";

// ---------------------------------------------------------------------------
// Supabase call with retry
// ---------------------------------------------------------------------------

fn supabase_call_once(operation: &str, params: Value) -> Result<Value, String> {
    let request = json!({
        "tool": "execution",
        "action": "run",
        "args": {
            "reference": SUPABASE_REF,
            "input": {
                "operation": operation,
                "params": params
            },
            "type": "catalyst"
        }
    });

    let response_str = invoke::call(&request.to_string());
    let response: Value = serde_json::from_str(&response_str)
        .map_err(|e| format!("Failed to parse Supabase response: {e}"))?;

    if let Some(err) = response.get("error") {
        return Err(format!("Supabase invoke error: {err}"));
    }

    let envelope = response.get("output").cloned().unwrap_or(Value::Null);
    let raw_result = envelope.get("result").cloned().unwrap_or(Value::Null);
    let result = match &raw_result {
        Value::String(s) => serde_json::from_str::<Value>(s).unwrap_or(raw_result.clone()),
        _ => raw_result,
    };

    if let Some(err) = result.get("error") {
        return Err(format!("Supabase error: {err}"));
    }

    Ok(result.get("data").cloned().unwrap_or(Value::Null))
}

pub fn supabase_call(operation: &str, params: Value) -> Result<Value, String> {
    let retry_params = params.clone();
    match supabase_call_once(operation, params) {
        Ok(v) => Ok(v),
        Err(_) => supabase_call_once(operation, retry_params),
    }
}

// ---------------------------------------------------------------------------
// Storage call (auto-adds bucket)
// ---------------------------------------------------------------------------

pub fn storage_call(operation: &str, params: Value) -> Result<Value, String> {
    let mut full_params = params;
    if let Some(obj) = full_params.as_object_mut() {
        obj.insert("bucket".into(), json!(STORAGE_BUCKET));
    }
    supabase_call(&format!("storage.{operation}"), full_params)
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

pub fn fetch_user(access_token: &str) -> Result<Value, String> {
    let request = json!({
        "tool": "execution",
        "action": "run",
        "args": {
            "reference": SUPABASE_REF,
            "input": {
                "operation": "auth.user",
                "params": {
                    "access_token": access_token
                }
            },
            "type": "catalyst"
        }
    });

    let response_str = invoke::call(&request.to_string());
    let response: Value = serde_json::from_str(&response_str)
        .map_err(|e| format!("Failed to parse auth response: {e}"))?;

    if let Some(err) = response.get("error") {
        return Err(format!("Auth error: {err}"));
    }

    let envelope = response.get("output").cloned().unwrap_or(Value::Null);
    let raw_result = envelope.get("result").cloned().unwrap_or(Value::Null);
    let result = match &raw_result {
        Value::String(s) => serde_json::from_str::<Value>(s).unwrap_or(raw_result.clone()),
        _ => raw_result,
    };

    if let Some(err) = result.get("error") {
        return Err(format!("Auth error: {err}"));
    }

    Ok(result.get("data").cloned().unwrap_or(Value::Null))
}

// ---------------------------------------------------------------------------
// Catalyst invoke
// ---------------------------------------------------------------------------

pub fn invoke_catalyst(catalyst_ref: &str, catalyst_input: &Value) -> Result<Value, String> {
    let request = json!({
        "tool": "execution",
        "action": "run",
        "args": {
            "reference": catalyst_ref,
            "input": catalyst_input,
            "type": "catalyst"
        }
    });

    let response_str = invoke::call(&request.to_string());
    let response: Value = serde_json::from_str(&response_str)
        .map_err(|e| format!("Failed to parse catalyst response: {e}"))?;

    if let Some(err) = response.get("error") {
        return Err(format!("Catalyst invoke error: {err}"));
    }

    let output = response.get("output").cloned().unwrap_or(Value::Null);
    let catalyst_result = if let Some(result) = output.get("result") {
        result.clone()
    } else {
        match &output {
            Value::String(s) => serde_json::from_str::<Value>(s).unwrap_or(output.clone()),
            _ => output,
        }
    };

    if let Some(err) = catalyst_result.get("error") {
        let fallback = err.to_string();
        let err_msg = err
            .get("message")
            .or_else(|| err.get("error").and_then(|e| e.get("message")))
            .and_then(|v| v.as_str())
            .unwrap_or(&fallback);
        return Err(err_msg.to_string());
    }

    Ok(catalyst_result.get("data").cloned().unwrap_or(Value::Null))
}

// ---------------------------------------------------------------------------
// Content extraction (multi-provider)
// ---------------------------------------------------------------------------

pub fn extract_content(data: &Value, catalyst_ref: &str) -> String {
    if let Some(text) = data.get("combined_text").and_then(|v| v.as_str()) {
        return text.to_string();
    }

    let lower = catalyst_ref.to_lowercase();

    if lower.contains("claude") {
        if let Some(content) = data.get("content").and_then(|v| v.as_array()) {
            return content
                .iter()
                .filter(|c| c.get("type").and_then(|v| v.as_str()) == Some("text"))
                .filter_map(|c| c.get("text").and_then(|v| v.as_str()))
                .collect::<Vec<_>>()
                .join("");
        }
    } else if lower.contains("openai") || lower.contains("grok") {
        if let Some(output) = data.get("output").and_then(|v| v.as_array()) {
            let text: String = output
                .iter()
                .filter(|item| item.get("type").and_then(|v| v.as_str()) == Some("message"))
                .filter_map(|item| item.get("content").and_then(|v| v.as_array()))
                .flatten()
                .filter(|c| c.get("type").and_then(|v| v.as_str()) == Some("output_text"))
                .filter_map(|c| c.get("text").and_then(|v| v.as_str()))
                .collect::<Vec<_>>()
                .join("");
            if !text.is_empty() {
                return text;
            }
        }
        if let Some(text) = data
            .get("choices")
            .and_then(|v| v.as_array())
            .and_then(|arr| arr.first())
            .and_then(|choice| choice.get("message"))
            .and_then(|msg| msg.get("content"))
            .and_then(|v| v.as_str())
        {
            return text.to_string();
        }
    } else if lower.contains("openrouter") {
        if let Some(text) = data
            .get("choices")
            .and_then(|v| v.as_array())
            .and_then(|arr| arr.first())
            .and_then(|choice| choice.get("message"))
            .and_then(|msg| msg.get("content"))
            .and_then(|v| v.as_str())
        {
            return text.to_string();
        }
    } else if lower.contains("gemini") {
        if let Some(text) = data
            .get("candidates")
            .and_then(|v| v.as_array())
            .and_then(|arr| arr.first())
            .and_then(|candidate| candidate.get("content"))
            .and_then(|content| content.get("parts"))
            .and_then(|v| v.as_array())
        {
            return text
                .iter()
                .filter_map(|part| part.get("text").and_then(|v| v.as_str()))
                .collect::<Vec<_>>()
                .join("");
        }
    }

    String::new()
}

// ---------------------------------------------------------------------------
// Message insertion
// ---------------------------------------------------------------------------

pub fn insert_ai_message(
    sit_down_id: &str,
    member_id: &str,
    content: &str,
    metadata: &Value,
    access_token: &str,
) -> Result<String, String> {
    let rpc_result = supabase_call(
        "db.rpc",
        json!({
            "function": "insert_ai_message",
            "body": {
                "p_sit_down_id": sit_down_id,
                "p_sender_member_id": member_id,
                "p_content": content,
                "p_metadata": metadata
            },
            "access_token": access_token
        }),
    )?;

    let message_id = rpc_result
        .get("id")
        .and_then(|v| v.as_str())
        .or_else(|| {
            rpc_result.as_array()
                .and_then(|arr| arr.first())
                .and_then(|row| row.get("id"))
                .and_then(|v| v.as_str())
        })
        .unwrap_or("")
        .to_string();

    Ok(message_id)
}

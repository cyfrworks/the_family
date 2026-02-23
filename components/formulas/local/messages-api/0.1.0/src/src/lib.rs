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

const SUPABASE_REF: &str = "catalyst:local.supabase:0.2.0";

fn handle_request(input: &str) -> Result<String, String> {
    let parsed: Value =
        serde_json::from_str(input).map_err(|e| format!("Invalid JSON input: {e}"))?;

    let action = parsed
        .get("action")
        .and_then(|v| v.as_str())
        .ok_or("Missing required 'action'")?;

    let access_token = parsed
        .get("access_token")
        .and_then(|v| v.as_str())
        .ok_or("Missing required 'access_token'")?;

    let sit_down_id = parsed
        .get("sit_down_id")
        .and_then(|v| v.as_str())
        .ok_or("Missing required 'sit_down_id'")?;

    match action {
        "list" => list_messages(access_token, sit_down_id),
        "typing_indicators" => get_typing_indicators(access_token, sit_down_id),
        _ => Err(format!("Unknown action: {action}")),
    }
}

/// Fetch messages with server-side PostgREST resource embedding joins.
/// Joins: profiles (sender), members (AI member), model_catalog (member's model).
fn list_messages(access_token: &str, sit_down_id: &str) -> Result<String, String> {
    let messages = supabase_call(
        "db.select",
        json!({
            "table": "messages",
            "select": "*,profile:profiles(*),member:members(*,catalog_model:model_catalog(*))",
            "filters": [
                { "column": "sit_down_id", "op": "eq", "value": sit_down_id }
            ],
            "order": [{ "column": "created_at", "direction": "asc" }],
            "access_token": access_token
        }),
    )?;

    Ok(json!({ "messages": messages }).to_string())
}

/// Fetch active typing indicators for a sit-down.
fn get_typing_indicators(access_token: &str, sit_down_id: &str) -> Result<String, String> {
    let indicators = supabase_call(
        "db.select",
        json!({
            "table": "typing_indicators",
            "select": "*",
            "filters": [
                { "column": "sit_down_id", "op": "eq", "value": sit_down_id }
            ],
            "access_token": access_token
        }),
    )?;

    Ok(json!({ "typing_indicators": indicators }).to_string())
}

// ---------------------------------------------------------------------------
// Sub-component invocations
// ---------------------------------------------------------------------------

fn supabase_call(operation: &str, params: Value) -> Result<Value, String> {
    let request = json!({
        "reference": { "registry": SUPABASE_REF },
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

#[allow(warnings)]
mod bindings;

use bindings::exports::cyfr::formula::run::Guest;
use bindings::cyfr::formula::invoke;

use serde_json::{json, Value};
use sha2::{Digest, Sha256};

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

const SUPABASE_REF: &str = "catalyst:local.supabase:0.3.2";

fn handle_request(input: &str) -> Result<String, String> {
    let parsed: Value =
        serde_json::from_str(input).map_err(|e| format!("Invalid JSON input: {e}"))?;

    let token = parsed
        .get("token")
        .and_then(|v| v.as_str())
        .ok_or("Missing required 'token'")?;

    let action = parsed
        .get("action")
        .and_then(|v| v.as_str())
        .ok_or("Missing required 'action'")?;

    // Hash the token for lookup
    let mut hasher = Sha256::new();
    hasher.update(token.as_bytes());
    let token_hash = hex::encode(hasher.finalize());

    // Validate informant
    let identity = validate_informant(&token_hash)?;

    let valid = identity
        .get("valid")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    if !valid {
        return Err("Invalid informant token".to_string());
    }

    let user_id = identity
        .get("user_id")
        .and_then(|v| v.as_str())
        .ok_or("Missing user_id in identity")?;
    let member_id = identity
        .get("member_id")
        .and_then(|v| v.as_str())
        .ok_or("Missing member_id in identity")?;

    match action {
        "send_message" => {
            let sit_down_id = parsed
                .get("sit_down_id")
                .and_then(|v| v.as_str())
                .ok_or("Missing required 'sit_down_id'")?;
            let content = parsed
                .get("content")
                .and_then(|v| v.as_str())
                .ok_or("Missing required 'content'")?;
            let metadata = parsed.get("metadata").cloned().unwrap_or(json!({}));

            send_message(member_id, sit_down_id, content, &metadata)
        }
        "create_sit_down" => {
            let name = parsed
                .get("name")
                .and_then(|v| v.as_str())
                .ok_or("Missing required 'name'")?;
            let description = parsed.get("description").and_then(|v| v.as_str());

            create_sit_down(user_id, member_id, name, description)
        }
        "list_sit_downs" => list_sit_downs(member_id),
        _ => Err(format!("Unknown action: {action}")),
    }
}

fn validate_informant(token_hash: &str) -> Result<Value, String> {
    supabase_rpc("validate_informant", json!({ "p_token_hash": token_hash }))
}

fn send_message(
    member_id: &str,
    sit_down_id: &str,
    content: &str,
    metadata: &Value,
) -> Result<String, String> {
    let result = supabase_rpc(
        "informant_send_message",
        json!({
            "p_member_id": member_id,
            "p_sit_down_id": sit_down_id,
            "p_content": content,
            "p_metadata": metadata
        }),
    )?;

    if let Some(err) = result.get("error") {
        return Err(format!("Send failed: {err}"));
    }

    Ok(json!({ "message": result }).to_string())
}

fn create_sit_down(
    user_id: &str,
    member_id: &str,
    name: &str,
    description: Option<&str>,
) -> Result<String, String> {
    let result = supabase_rpc(
        "informant_create_sit_down",
        json!({
            "p_user_id": user_id,
            "p_member_id": member_id,
            "p_name": name,
            "p_description": description
        }),
    )?;

    Ok(json!({ "sit_down": result }).to_string())
}

fn list_sit_downs(member_id: &str) -> Result<String, String> {
    let sit_downs = supabase_call(
        "db.select",
        json!({
            "table": "sit_down_participants",
            "select": "sit_down_id,sit_downs:sit_down_id(id,name,description,created_at,is_commission)",
            "filters": [
                { "column": "member_id", "op": "eq", "value": member_id }
            ],
            "service_role": true
        }),
    )?;

    // Extract the joined sit-down objects
    let sit_down_list: Vec<Value> = sit_downs
        .as_array()
        .unwrap_or(&vec![])
        .iter()
        .filter_map(|p| p.get("sit_downs").cloned())
        .collect();

    Ok(json!({ "sit_downs": sit_down_list }).to_string())
}

// ---------------------------------------------------------------------------
// Sub-component invocations
// ---------------------------------------------------------------------------

fn supabase_rpc(function_name: &str, body: Value) -> Result<Value, String> {
    supabase_call(
        "db.rpc",
        json!({
            "function": function_name,
            "body": body,
            "service_role": true
        }),
    )
}

fn supabase_call(operation: &str, params: Value) -> Result<Value, String> {
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

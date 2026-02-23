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

    match action {
        "list" => list_sit_downs(access_token),
        "create" => {
            let name = parsed
                .get("name")
                .and_then(|v| v.as_str())
                .ok_or("Missing required 'name'")?;
            let description = parsed.get("description").and_then(|v| v.as_str());
            create_sit_down(access_token, name, description)
        }
        "delete" => {
            let sit_down_id = parsed
                .get("sit_down_id")
                .and_then(|v| v.as_str())
                .ok_or("Missing required 'sit_down_id'")?;
            delete_sit_down(access_token, sit_down_id)
        }
        "create_commission" => {
            let name = parsed
                .get("name")
                .and_then(|v| v.as_str())
                .ok_or("Missing required 'name'")?;
            let description = parsed.get("description").and_then(|v| v.as_str());
            let member_ids = parsed
                .get("member_ids")
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str().map(|s| s.to_string()))
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default();
            let contact_ids = parsed
                .get("contact_ids")
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str().map(|s| s.to_string()))
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default();
            create_commission_sit_down(access_token, name, description, &member_ids, &contact_ids)
        }
        "delete_commission" => {
            let sit_down_id = parsed
                .get("sit_down_id")
                .and_then(|v| v.as_str())
                .ok_or("Missing required 'sit_down_id'")?;
            delete_commission_sit_down(access_token, sit_down_id)
        }
        _ => Err(format!("Unknown action: {action}")),
    }
}

fn list_sit_downs(access_token: &str) -> Result<String, String> {
    // Verify caller identity
    let _user = fetch_user(access_token)?;

    let sit_downs = supabase_call(
        "db.select",
        json!({
            "table": "sit_downs",
            "select": "*",
            "filters": [
                { "column": "is_commission", "op": "eq", "value": "false" }
            ],
            "order": [{ "column": "created_at", "direction": "desc" }],
            "access_token": access_token
        }),
    )?;

    Ok(json!({ "sit_downs": sit_downs }).to_string())
}

fn create_sit_down(
    access_token: &str,
    name: &str,
    description: Option<&str>,
) -> Result<String, String> {
    // Verify caller identity
    let _user = fetch_user(access_token)?;

    if name.trim().is_empty() {
        return Err("Sit-down name cannot be empty".to_string());
    }

    let sit_down = supabase_call(
        "db.rpc",
        json!({
            "function": "create_sit_down",
            "body": {
                "p_name": name,
                "p_description": description
            },
            "access_token": access_token
        }),
    )?;

    Ok(json!({ "sit_down": sit_down }).to_string())
}

fn delete_sit_down(access_token: &str, sit_down_id: &str) -> Result<String, String> {
    let user = fetch_user(access_token)?;
    let user_id = user
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or("Could not determine user ID from token")?;

    // Verify the caller owns this sit-down
    let sit_downs = supabase_call(
        "db.select",
        json!({
            "table": "sit_downs",
            "select": "id,created_by",
            "filters": [
                { "column": "id", "op": "eq", "value": sit_down_id }
            ],
            "limit": 1,
            "access_token": access_token
        }),
    )?;

    let sit_down = sit_downs
        .as_array()
        .and_then(|arr| arr.first())
        .ok_or("Sit-down not found")?;

    let created_by = sit_down
        .get("created_by")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    if created_by != user_id {
        return Err("Only the creator can delete a sit-down".to_string());
    }

    supabase_call(
        "db.delete",
        json!({
            "table": "sit_downs",
            "filters": [
                { "column": "id", "op": "eq", "value": sit_down_id }
            ],
            "access_token": access_token
        }),
    )?;

    Ok(json!({ "deleted": true }).to_string())
}

fn create_commission_sit_down(
    access_token: &str,
    name: &str,
    description: Option<&str>,
    member_ids: &[String],
    contact_ids: &[String],
) -> Result<String, String> {
    // Verify caller identity
    let _user = fetch_user(access_token)?;

    if name.trim().is_empty() {
        return Err("Commission sit-down name cannot be empty".to_string());
    }

    let sit_down = supabase_call(
        "db.rpc",
        json!({
            "function": "create_commission_sit_down",
            "body": {
                "p_name": name,
                "p_description": description,
                "p_member_ids": member_ids,
                "p_contact_ids": contact_ids
            },
            "access_token": access_token
        }),
    )?;

    Ok(json!({ "sit_down": sit_down }).to_string())
}

fn delete_commission_sit_down(access_token: &str, sit_down_id: &str) -> Result<String, String> {
    let user = fetch_user(access_token)?;
    let user_id = user
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or("Could not determine user ID from token")?;

    // Verify the caller owns this sit-down
    let sit_downs = supabase_call(
        "db.select",
        json!({
            "table": "sit_downs",
            "select": "id,created_by,is_commission",
            "filters": [
                { "column": "id", "op": "eq", "value": sit_down_id }
            ],
            "limit": 1,
            "access_token": access_token
        }),
    )?;

    let sit_down = sit_downs
        .as_array()
        .and_then(|arr| arr.first())
        .ok_or("Commission sit-down not found")?;

    let created_by = sit_down
        .get("created_by")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    if created_by != user_id {
        return Err("Only the creator can delete a commission sit-down".to_string());
    }

    supabase_call(
        "db.delete",
        json!({
            "table": "sit_downs",
            "filters": [
                { "column": "id", "op": "eq", "value": sit_down_id }
            ],
            "access_token": access_token
        }),
    )?;

    Ok(json!({ "deleted": true }).to_string())
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

fn fetch_user(access_token: &str) -> Result<Value, String> {
    let request = json!({
        "reference": { "registry": SUPABASE_REF },
        "input": {
            "operation": "auth.user",
            "params": {
                "access_token": access_token
            }
        },
        "type": "catalyst"
    });

    let response_str = invoke::call(&request.to_string());

    let response: Value = serde_json::from_str(&response_str)
        .map_err(|e| format!("Failed to parse auth response: {e}"))?;

    if let Some(err) = response.get("error") {
        return Err(format!("Auth error: {err}"));
    }

    let output = response.get("output").cloned().unwrap_or(Value::Null);
    let result = match &output {
        Value::String(s) => serde_json::from_str::<Value>(s).unwrap_or(output.clone()),
        _ => output,
    };

    if let Some(err) = result.get("error") {
        return Err(format!("Auth error: {err}"));
    }

    Ok(result.get("data").cloned().unwrap_or(Value::Null))
}

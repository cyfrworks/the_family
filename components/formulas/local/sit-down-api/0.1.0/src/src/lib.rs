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
        "get" => get_sit_down(access_token, sit_down_id),
        "list_participants" => list_participants(access_token, sit_down_id),
        "add_member" => {
            let member_id = parsed
                .get("member_id")
                .and_then(|v| v.as_str())
                .ok_or("Missing required 'member_id'")?;
            add_member(access_token, sit_down_id, member_id)
        }
        "add_don" => {
            let user_id = parsed
                .get("user_id")
                .and_then(|v| v.as_str())
                .ok_or("Missing required 'user_id'")?;
            add_don(access_token, sit_down_id, user_id)
        }
        "remove_participant" => {
            let participant_id = parsed
                .get("participant_id")
                .and_then(|v| v.as_str())
                .ok_or("Missing required 'participant_id'")?;
            remove_participant(access_token, sit_down_id, participant_id)
        }
        _ => Err(format!("Unknown action: {action}")),
    }
}

fn get_sit_down(access_token: &str, sit_down_id: &str) -> Result<String, String> {
    let sit_downs = supabase_call(
        "db.select",
        json!({
            "table": "sit_downs",
            "select": "*",
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
        .cloned()
        .unwrap_or(Value::Null);

    Ok(json!({ "sit_down": sit_down }).to_string())
}

fn list_participants(access_token: &str, sit_down_id: &str) -> Result<String, String> {
    // Fetch participants with nested joins (profiles + members + model_catalog)
    let participants = supabase_call(
        "db.select",
        json!({
            "table": "sit_down_participants",
            "select": "*,profile:profiles(*),member:members(*,catalog_model:model_catalog(*))",
            "filters": [
                { "column": "sit_down_id", "op": "eq", "value": sit_down_id }
            ],
            "access_token": access_token
        }),
    )?;

    // Check if this is a commission sit-down and fetch commission members if so
    let sit_downs = supabase_call(
        "db.select",
        json!({
            "table": "sit_downs",
            "select": "id,is_commission",
            "filters": [
                { "column": "id", "op": "eq", "value": sit_down_id }
            ],
            "limit": 1,
            "access_token": access_token
        }),
    )?;

    let is_commission = sit_downs
        .as_array()
        .and_then(|arr| arr.first())
        .and_then(|sd| sd.get("is_commission"))
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    let mut commission_members = Value::Array(vec![]);

    if is_commission {
        let empty = vec![];
        let participants_arr = participants.as_array().unwrap_or(&empty);

        // Collect don user IDs from participants
        let don_user_ids: Vec<&str> = participants_arr
            .iter()
            .filter_map(|p| p.get("user_id").and_then(|v| v.as_str()))
            .collect();

        if !don_user_ids.is_empty() {
            // Fetch all members belonging to participating dons
            let filter_value = format!("({})", don_user_ids.join(","));
            commission_members = supabase_call(
                "db.select",
                json!({
                    "table": "members",
                    "select": "*,catalog_model:model_catalog(*)",
                    "filters": [
                        { "column": "owner_id", "op": "in", "value": filter_value }
                    ],
                    "access_token": access_token
                }),
            )?;
        }
    }

    Ok(json!({
        "participants": participants,
        "commission_members": commission_members,
        "is_commission": is_commission
    })
    .to_string())
}

fn add_member(access_token: &str, sit_down_id: &str, member_id: &str) -> Result<String, String> {
    let user = fetch_user(access_token)?;
    let user_id = user
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or("Could not determine user ID from token")?;

    // Check if participant already exists (proper dedup instead of try/catch)
    let existing = supabase_call(
        "db.select",
        json!({
            "table": "sit_down_participants",
            "select": "id",
            "filters": [
                { "column": "sit_down_id", "op": "eq", "value": sit_down_id },
                { "column": "member_id", "op": "eq", "value": member_id }
            ],
            "access_token": access_token
        }),
    )?;

    if existing
        .as_array()
        .map(|arr| !arr.is_empty())
        .unwrap_or(false)
    {
        return Ok(json!({ "already_exists": true }).to_string());
    }

    let inserted = supabase_call(
        "db.insert",
        json!({
            "table": "sit_down_participants",
            "body": {
                "sit_down_id": sit_down_id,
                "member_id": member_id,
                "added_by": user_id
            },
            "access_token": access_token
        }),
    )?;

    Ok(json!({ "participant": inserted }).to_string())
}

fn add_don(access_token: &str, sit_down_id: &str, don_user_id: &str) -> Result<String, String> {
    let user = fetch_user(access_token)?;
    let caller_id = user
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or("Could not determine user ID from token")?;

    // Check if participant already exists (proper dedup instead of try/catch)
    let existing = supabase_call(
        "db.select",
        json!({
            "table": "sit_down_participants",
            "select": "id",
            "filters": [
                { "column": "sit_down_id", "op": "eq", "value": sit_down_id },
                { "column": "user_id", "op": "eq", "value": don_user_id }
            ],
            "access_token": access_token
        }),
    )?;

    if existing
        .as_array()
        .map(|arr| !arr.is_empty())
        .unwrap_or(false)
    {
        return Ok(json!({ "already_exists": true }).to_string());
    }

    let inserted = supabase_call(
        "db.insert",
        json!({
            "table": "sit_down_participants",
            "body": {
                "sit_down_id": sit_down_id,
                "user_id": don_user_id,
                "added_by": caller_id
            },
            "access_token": access_token
        }),
    )?;

    Ok(json!({ "participant": inserted }).to_string())
}

fn remove_participant(
    access_token: &str,
    _sit_down_id: &str,
    participant_id: &str,
) -> Result<String, String> {
    // Verify caller identity (RLS enforces ownership, but we authenticate the token)
    let _user = fetch_user(access_token)?;

    supabase_call(
        "db.delete",
        json!({
            "table": "sit_down_participants",
            "filters": [
                { "column": "id", "op": "eq", "value": participant_id }
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

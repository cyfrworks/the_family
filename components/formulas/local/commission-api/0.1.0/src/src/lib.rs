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
        "state" => get_state(access_token),
        "invite" => {
            let email = parsed
                .get("email")
                .and_then(|v| v.as_str())
                .ok_or("Missing required 'email'")?;
            invite(access_token, email)
        }
        "accept" => {
            let contact_id = parsed
                .get("contact_id")
                .and_then(|v| v.as_str())
                .ok_or("Missing required 'contact_id'")?;
            accept(access_token, contact_id)
        }
        "decline" => {
            let contact_id = parsed
                .get("contact_id")
                .and_then(|v| v.as_str())
                .ok_or("Missing required 'contact_id'")?;
            decline(access_token, contact_id)
        }
        "remove" => {
            let contact_user_id = parsed
                .get("contact_user_id")
                .and_then(|v| v.as_str())
                .ok_or("Missing required 'contact_user_id'")?;
            remove(access_token, contact_user_id)
        }
        _ => Err(format!("Unknown action: {action}")),
    }
}

/// Fetch all commission state in a single formula call.
/// Replaces 4 parallel db.select queries from the frontend.
fn get_state(access_token: &str) -> Result<String, String> {
    let user = fetch_user(access_token)?;
    let user_id = user
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or("Could not determine user ID from token")?;

    // Accepted contacts (user's commission members)
    let contacts = supabase_call(
        "db.select",
        json!({
            "table": "commission_contacts",
            "select": "*,contact_profile:profiles!commission_contacts_contact_profile_fk(*)",
            "filters": [
                { "column": "user_id", "op": "eq", "value": user_id },
                { "column": "status", "op": "eq", "value": "accepted" }
            ],
            "order": [{ "column": "created_at", "direction": "desc" }],
            "access_token": access_token
        }),
    )
    .unwrap_or(Value::Array(vec![]));

    // Pending invites received (where current user is the contact)
    let pending_invites = supabase_call(
        "db.select",
        json!({
            "table": "commission_contacts",
            "select": "*,profile:profiles!commission_contacts_user_profile_fk(*)",
            "filters": [
                { "column": "contact_user_id", "op": "eq", "value": user_id },
                { "column": "status", "op": "eq", "value": "pending" }
            ],
            "order": [{ "column": "created_at", "direction": "desc" }],
            "access_token": access_token
        }),
    )
    .unwrap_or(Value::Array(vec![]));

    // Pending invites sent (by the current user)
    let sent_invites = supabase_call(
        "db.select",
        json!({
            "table": "commission_contacts",
            "select": "*,contact_profile:profiles!commission_contacts_contact_profile_fk(*)",
            "filters": [
                { "column": "user_id", "op": "eq", "value": user_id },
                { "column": "status", "op": "eq", "value": "pending" }
            ],
            "order": [{ "column": "created_at", "direction": "desc" }],
            "access_token": access_token
        }),
    )
    .unwrap_or(Value::Array(vec![]));

    // Commission sit-downs
    let commission_sit_downs = supabase_call(
        "db.select",
        json!({
            "table": "sit_downs",
            "select": "*",
            "filters": [
                { "column": "is_commission", "op": "eq", "value": "true" }
            ],
            "order": [{ "column": "created_at", "direction": "desc" }],
            "access_token": access_token
        }),
    )
    .unwrap_or(Value::Array(vec![]));

    Ok(json!({
        "contacts": contacts,
        "pending_invites": pending_invites,
        "sent_invites": sent_invites,
        "commission_sit_downs": commission_sit_downs
    })
    .to_string())
}

fn invite(access_token: &str, email: &str) -> Result<String, String> {
    let contact = supabase_call(
        "db.rpc",
        json!({
            "function": "invite_to_commission",
            "body": { "p_email": email },
            "access_token": access_token
        }),
    )?;

    Ok(json!({ "contact": contact }).to_string())
}

fn accept(access_token: &str, contact_id: &str) -> Result<String, String> {
    let contact = supabase_call(
        "db.rpc",
        json!({
            "function": "accept_commission_invite",
            "body": { "p_contact_id": contact_id },
            "access_token": access_token
        }),
    )?;

    Ok(json!({ "contact": contact }).to_string())
}

fn decline(access_token: &str, contact_id: &str) -> Result<String, String> {
    let contact = supabase_call(
        "db.rpc",
        json!({
            "function": "decline_commission_invite",
            "body": { "p_contact_id": contact_id },
            "access_token": access_token
        }),
    )?;

    Ok(json!({ "contact": contact }).to_string())
}

fn remove(access_token: &str, contact_user_id: &str) -> Result<String, String> {
    supabase_call(
        "db.rpc",
        json!({
            "function": "remove_commission_contact",
            "body": { "p_contact_user_id": contact_user_id },
            "access_token": access_token
        }),
    )?;

    Ok(json!({ "removed": true }).to_string())
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

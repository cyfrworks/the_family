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
        "list_users" => list_users(access_token),
        "update_tier" => {
            let user_id = parsed
                .get("user_id")
                .and_then(|v| v.as_str())
                .ok_or("Missing required 'user_id'")?;
            let tier = parsed
                .get("tier")
                .and_then(|v| v.as_str())
                .ok_or("Missing required 'tier'")?;
            update_tier(access_token, user_id, tier)
        }
        "catalog_list" => catalog_list(access_token),
        "catalog_add" => {
            let entry = parsed
                .get("catalog_entry")
                .ok_or("Missing required 'catalog_entry'")?;
            catalog_add(access_token, entry)
        }
        "catalog_update" => {
            let catalog_id = parsed
                .get("catalog_id")
                .and_then(|v| v.as_str())
                .ok_or("Missing required 'catalog_id'")?;
            let updates = parsed
                .get("catalog_updates")
                .ok_or("Missing required 'catalog_updates'")?;
            catalog_update(access_token, catalog_id, updates)
        }
        "catalog_delete" => {
            let catalog_id = parsed
                .get("catalog_id")
                .and_then(|v| v.as_str())
                .ok_or("Missing required 'catalog_id'")?;
            catalog_delete(access_token, catalog_id)
        }
        "catalog_toggle" => {
            let catalog_id = parsed
                .get("catalog_id")
                .and_then(|v| v.as_str())
                .ok_or("Missing required 'catalog_id'")?;
            catalog_toggle(access_token, catalog_id)
        }
        _ => Err(format!("Unknown action: {action}")),
    }
}

/// Verify the caller is a godfather by fetching their profile.
fn verify_godfather(access_token: &str) -> Result<Value, String> {
    let user = fetch_user(access_token)?;
    let user_id = user
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or("Could not determine user ID from token")?;

    let profiles = supabase_call(
        "db.select",
        json!({
            "table": "profiles",
            "select": "id,tier",
            "filters": [
                { "column": "id", "op": "eq", "value": user_id }
            ],
            "access_token": access_token
        }),
    )?;

    let profile = profiles
        .as_array()
        .and_then(|arr| arr.first())
        .ok_or("Profile not found")?;

    let tier = profile
        .get("tier")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    if tier != "godfather" {
        return Err("Access denied: only godfathers can perform admin operations".to_string());
    }

    Ok(user)
}

fn list_users(access_token: &str) -> Result<String, String> {
    verify_godfather(access_token)?;

    let users = supabase_call(
        "db.select",
        json!({
            "table": "profiles",
            "select": "*",
            "order": [{ "column": "created_at", "direction": "asc" }],
            "access_token": access_token
        }),
    )?;

    Ok(json!({ "users": users }).to_string())
}

fn update_tier(access_token: &str, user_id: &str, tier: &str) -> Result<String, String> {
    // Validate tier value
    match tier {
        "godfather" | "boss" | "associate" => {}
        _ => return Err(format!("Invalid tier: {tier}. Must be godfather, boss, or associate")),
    }

    let caller = verify_godfather(access_token)?;
    let caller_id = caller
        .get("id")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    // Prevent godfather from demoting themselves
    if caller_id == user_id && tier != "godfather" {
        return Err("Cannot change your own tier".to_string());
    }

    let updated = supabase_call(
        "db.update",
        json!({
            "table": "profiles",
            "body": { "tier": tier },
            "filters": [
                { "column": "id", "op": "eq", "value": user_id }
            ],
            "access_token": access_token
        }),
    )?;

    Ok(json!({ "updated": updated }).to_string())
}

// ---------------------------------------------------------------------------
// Model catalog operations
// ---------------------------------------------------------------------------

fn catalog_list(access_token: &str) -> Result<String, String> {
    verify_godfather(access_token)?;

    let catalog = supabase_call(
        "db.select",
        json!({
            "table": "model_catalog",
            "select": "*",
            "order": [
                { "column": "sort_order", "direction": "asc" },
                { "column": "created_at", "direction": "asc" }
            ],
            "access_token": access_token
        }),
    )?;

    // Group models by provider server-side so the frontend doesn't need
    // a hardcoded provider list. New providers appear automatically.
    let mut by_provider: serde_json::Map<String, Value> = serde_json::Map::new();
    if let Some(arr) = catalog.as_array() {
        for entry in arr {
            let provider = entry
                .get("provider")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown");
            by_provider
                .entry(provider.to_string())
                .or_insert_with(|| json!([]))
                .as_array_mut()
                .unwrap()
                .push(entry.clone());
        }
    }

    Ok(json!({
        "catalog": catalog,
        "by_provider": by_provider
    })
    .to_string())
}

fn catalog_add(access_token: &str, entry: &Value) -> Result<String, String> {
    let caller = verify_godfather(access_token)?;
    let caller_id = caller
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or("Could not determine user ID")?;

    let provider = entry
        .get("provider")
        .and_then(|v| v.as_str())
        .ok_or("Missing required 'catalog_entry.provider'")?;
    let alias = entry
        .get("alias")
        .and_then(|v| v.as_str())
        .ok_or("Missing required 'catalog_entry.alias'")?;
    let model = entry
        .get("model")
        .and_then(|v| v.as_str())
        .ok_or("Missing required 'catalog_entry.model'")?;

    if alias.trim().is_empty() {
        return Err("Alias cannot be empty".to_string());
    }

    match provider {
        "claude" | "openai" | "gemini" => {}
        _ => return Err(format!("Invalid provider: {provider}")),
    }

    let min_tier = entry
        .get("min_tier")
        .and_then(|v| v.as_str())
        .unwrap_or("associate");
    let sort_order = entry
        .get("sort_order")
        .and_then(|v| v.as_i64())
        .unwrap_or(0);

    let inserted = supabase_call(
        "db.insert",
        json!({
            "table": "model_catalog",
            "body": {
                "provider": provider,
                "alias": alias,
                "model": model,
                "min_tier": min_tier,
                "sort_order": sort_order,
                "added_by": caller_id
            },
            "access_token": access_token
        }),
    )?;

    let created = inserted
        .as_array()
        .and_then(|arr| arr.first())
        .cloned()
        .unwrap_or(Value::Null);

    Ok(json!({ "entry": created }).to_string())
}

fn catalog_update(access_token: &str, catalog_id: &str, updates: &Value) -> Result<String, String> {
    verify_godfather(access_token)?;

    // Build update body from allowed fields only
    let mut body = json!({});
    let allowed_fields = ["alias", "model", "min_tier", "sort_order"];

    for field in &allowed_fields {
        if let Some(val) = updates.get(*field) {
            body[*field] = val.clone();
        }
    }

    if body.as_object().map(|o| o.is_empty()).unwrap_or(true) {
        return Err("No valid fields to update".to_string());
    }

    // Validate alias if provided
    if let Some(alias) = updates.get("alias").and_then(|v| v.as_str()) {
        if alias.trim().is_empty() {
            return Err("Alias cannot be empty".to_string());
        }
    }

    // Validate min_tier if provided
    if let Some(min_tier) = updates.get("min_tier").and_then(|v| v.as_str()) {
        match min_tier {
            "boss" | "associate" => {}
            _ => return Err(format!("Invalid min_tier: {min_tier}")),
        }
    }

    let updated = supabase_call(
        "db.update",
        json!({
            "table": "model_catalog",
            "body": body,
            "filters": [
                { "column": "id", "op": "eq", "value": catalog_id }
            ],
            "access_token": access_token
        }),
    )?;

    Ok(json!({ "updated": updated }).to_string())
}

fn catalog_delete(access_token: &str, catalog_id: &str) -> Result<String, String> {
    verify_godfather(access_token)?;

    supabase_call(
        "db.delete",
        json!({
            "table": "model_catalog",
            "filters": [
                { "column": "id", "op": "eq", "value": catalog_id }
            ],
            "access_token": access_token
        }),
    )?;

    Ok(json!({ "deleted": true }).to_string())
}

fn catalog_toggle(access_token: &str, catalog_id: &str) -> Result<String, String> {
    verify_godfather(access_token)?;

    // Fetch current state
    let entries = supabase_call(
        "db.select",
        json!({
            "table": "model_catalog",
            "select": "id,is_active",
            "filters": [
                { "column": "id", "op": "eq", "value": catalog_id }
            ],
            "access_token": access_token
        }),
    )?;

    let entry = entries
        .as_array()
        .and_then(|arr| arr.first())
        .ok_or("Catalog entry not found")?;

    let current_active = entry
        .get("is_active")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);

    let updated = supabase_call(
        "db.update",
        json!({
            "table": "model_catalog",
            "body": { "is_active": !current_active },
            "filters": [
                { "column": "id", "op": "eq", "value": catalog_id }
            ],
            "access_token": access_token
        }),
    )?;

    Ok(json!({ "updated": updated }).to_string())
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

fn fetch_user(access_token: &str) -> Result<Value, String> {
    let request = json!({
        "reference": SUPABASE_REF,
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

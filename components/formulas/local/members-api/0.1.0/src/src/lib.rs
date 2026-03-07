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
        "list" => list_members(access_token),
        "create" => {
            let member = parsed
                .get("member")
                .ok_or("Missing required 'member' object")?;
            create_member(access_token, member)
        }
        "update" => {
            let member_id = parsed
                .get("member_id")
                .and_then(|v| v.as_str())
                .ok_or("Missing required 'member_id'")?;
            let updates = parsed
                .get("updates")
                .ok_or("Missing required 'updates' object")?;
            update_member(access_token, member_id, updates)
        }
        "delete" => {
            let member_id = parsed
                .get("member_id")
                .and_then(|v| v.as_str())
                .ok_or("Missing required 'member_id'")?;
            delete_member(access_token, member_id)
        }
        "create_informant" => {
            let name = parsed
                .get("name")
                .and_then(|v| v.as_str())
                .ok_or("Missing required 'name'")?;
            let avatar_url = parsed.get("avatar_url").and_then(|v| v.as_str());
            create_informant(access_token, name, avatar_url)
        }
        "list_informants" => list_informants(access_token),
        "delete_informant" => {
            let member_id = parsed
                .get("member_id")
                .and_then(|v| v.as_str())
                .ok_or("Missing required 'member_id'")?;
            delete_informant(access_token, member_id)
        }
        "regenerate_token" => {
            let member_id = parsed
                .get("member_id")
                .and_then(|v| v.as_str())
                .ok_or("Missing required 'member_id'")?;
            regenerate_token(access_token, member_id)
        }
        _ => Err(format!("Unknown action: {action}")),
    }
}

fn list_members(access_token: &str) -> Result<String, String> {
    let user = fetch_user(access_token)?;
    let user_id = user
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or("Could not determine user ID from token")?;

    // Single query with PostgREST resource embedding — joins members with model_catalog
    // Only return AI members (not informants)
    let members = supabase_call(
        "db.select",
        json!({
            "table": "members",
            "select": "*,catalog_model:model_catalog(*)",
            "filters": [
                { "column": "owner_id", "op": "eq", "value": user_id },
                { "column": "member_type", "op": "eq", "value": "ai" }
            ],
            "order": [{ "column": "created_at", "direction": "desc" }],
            "access_token": access_token
        }),
    )?;

    Ok(json!({ "members": members }).to_string())
}

fn create_member(access_token: &str, member: &Value) -> Result<String, String> {
    let user = fetch_user(access_token)?;
    let user_id = user
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or("Could not determine user ID from token")?;

    // Validate required fields
    let name = member
        .get("name")
        .and_then(|v| v.as_str())
        .ok_or("Missing required 'member.name'")?;
    let catalog_model_id = member
        .get("catalog_model_id")
        .and_then(|v| v.as_str())
        .ok_or("Missing required 'member.catalog_model_id'")?;
    let system_prompt = member
        .get("system_prompt")
        .and_then(|v| v.as_str())
        .ok_or("Missing required 'member.system_prompt'")?;

    if name.trim().is_empty() {
        return Err("Member name cannot be empty".to_string());
    }

    // Validate the catalog model exists and check tier access
    let caller_profile = supabase_call(
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

    let profile = caller_profile
        .as_array()
        .and_then(|arr| arr.first())
        .ok_or("Profile not found")?;

    let caller_tier = profile
        .get("tier")
        .and_then(|v| v.as_str())
        .unwrap_or("associate");

    let catalog_models = supabase_call(
        "db.select",
        json!({
            "table": "model_catalog",
            "select": "id,min_tier,is_active",
            "filters": [
                { "column": "id", "op": "eq", "value": catalog_model_id }
            ],
            "access_token": access_token
        }),
    )?;

    let catalog_model = catalog_models
        .as_array()
        .and_then(|arr| arr.first())
        .ok_or("Catalog model not found")?;

    let is_active = catalog_model
        .get("is_active")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    if !is_active {
        return Err("Selected model is not available".to_string());
    }

    // Tier access check: godfather > boss > associate
    let min_tier = catalog_model
        .get("min_tier")
        .and_then(|v| v.as_str())
        .unwrap_or("associate");

    if !tier_has_access(caller_tier, min_tier) {
        return Err(format!(
            "Your tier ({caller_tier}) does not have access to this model (requires {min_tier})"
        ));
    }

    // Build insert body
    let mut body = json!({
        "owner_id": user_id,
        "name": name,
        "catalog_model_id": catalog_model_id,
        "system_prompt": system_prompt,
    });

    if let Some(avatar_url) = member.get("avatar_url").and_then(|v| v.as_str()) {
        body["avatar_url"] = json!(avatar_url);
    }

    let inserted = supabase_call(
        "db.insert",
        json!({
            "table": "members",
            "body": body,
            "access_token": access_token
        }),
    )?;

    let created = inserted
        .as_array()
        .and_then(|arr| arr.first())
        .cloned()
        .unwrap_or(Value::Null);

    Ok(json!({ "member": created }).to_string())
}

fn update_member(access_token: &str, member_id: &str, updates: &Value) -> Result<String, String> {
    let user = fetch_user(access_token)?;
    let user_id = user
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or("Could not determine user ID from token")?;

    // Build the update body from allowed fields only
    let mut body = json!({});
    let allowed_fields = ["name", "catalog_model_id", "system_prompt", "avatar_url"];

    for field in &allowed_fields {
        if let Some(val) = updates.get(*field) {
            body[*field] = val.clone();
        }
    }

    if body.as_object().map(|o| o.is_empty()).unwrap_or(true) {
        return Err("No valid fields to update".to_string());
    }

    // Validate name if provided
    if let Some(name) = updates.get("name").and_then(|v| v.as_str()) {
        if name.trim().is_empty() {
            return Err("Member name cannot be empty".to_string());
        }
    }

    // Reject explicit null on catalog_model_id — members must always have a valid model
    if updates.get("catalog_model_id") == Some(&Value::Null) {
        return Err("catalog_model_id cannot be null — please select a valid model".to_string());
    }

    // If catalog_model_id is being changed, validate tier access
    if let Some(new_model_id) = updates.get("catalog_model_id").and_then(|v| v.as_str()) {
        let caller_profile = supabase_call(
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

        let profile = caller_profile
            .as_array()
            .and_then(|arr| arr.first())
            .ok_or("Profile not found")?;

        let caller_tier = profile
            .get("tier")
            .and_then(|v| v.as_str())
            .unwrap_or("associate");

        let catalog_models = supabase_call(
            "db.select",
            json!({
                "table": "model_catalog",
                "select": "id,min_tier,is_active",
                "filters": [
                    { "column": "id", "op": "eq", "value": new_model_id }
                ],
                "access_token": access_token
            }),
        )?;

        let catalog_model = catalog_models
            .as_array()
            .and_then(|arr| arr.first())
            .ok_or("Catalog model not found")?;

        let is_active = catalog_model
            .get("is_active")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        if !is_active {
            return Err("Selected model is not available".to_string());
        }

        let min_tier = catalog_model
            .get("min_tier")
            .and_then(|v| v.as_str())
            .unwrap_or("associate");

        if !tier_has_access(caller_tier, min_tier) {
            return Err(format!(
                "Your tier ({caller_tier}) does not have access to this model (requires {min_tier})"
            ));
        }
    }

    let updated = supabase_call(
        "db.update",
        json!({
            "table": "members",
            "body": body,
            "filters": [
                { "column": "id", "op": "eq", "value": member_id },
                { "column": "owner_id", "op": "eq", "value": user_id }
            ],
            "access_token": access_token
        }),
    )?;

    Ok(json!({ "updated": updated }).to_string())
}

fn delete_member(access_token: &str, member_id: &str) -> Result<String, String> {
    let user = fetch_user(access_token)?;
    let user_id = user
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or("Could not determine user ID from token")?;

    supabase_call(
        "db.delete",
        json!({
            "table": "members",
            "filters": [
                { "column": "id", "op": "eq", "value": member_id },
                { "column": "owner_id", "op": "eq", "value": user_id }
            ],
            "access_token": access_token
        }),
    )?;

    Ok(json!({ "deleted": true }).to_string())
}

fn generate_token() -> Result<(String, String, String), String> {
    // Generate token server-side using pgcrypto's gen_random_bytes (proper CSPRNG)
    let token_data = supabase_call(
        "db.rpc",
        json!({
            "function": "generate_informant_token",
            "body": {},
            "service_role": true
        }),
    )?;

    let token = token_data
        .get("token")
        .and_then(|v| v.as_str())
        .ok_or("Token generation failed: missing token")?
        .to_string();
    let prefix = token_data
        .get("token_prefix")
        .and_then(|v| v.as_str())
        .ok_or("Token generation failed: missing prefix")?
        .to_string();
    let hash = token_data
        .get("token_hash")
        .and_then(|v| v.as_str())
        .ok_or("Token generation failed: missing hash")?
        .to_string();

    Ok((token, prefix, hash))
}

fn create_informant(
    access_token: &str,
    name: &str,
    avatar_url: Option<&str>,
) -> Result<String, String> {
    let user = fetch_user(access_token)?;
    let user_id = user
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or("Could not determine user ID from token")?;

    if name.trim().is_empty() {
        return Err("Informant name cannot be empty".to_string());
    }

    let (token, prefix, hash) = generate_token()?;

    let mut body = json!({
        "owner_id": user_id,
        "name": name,
        "member_type": "informant",
        "token_hash": hash,
        "token_prefix": prefix,
        "system_prompt": "",
    });

    if let Some(url) = avatar_url {
        body["avatar_url"] = json!(url);
    }

    let inserted = supabase_call(
        "db.insert",
        json!({
            "table": "members",
            "body": body,
            "access_token": access_token
        }),
    )?;

    let created = inserted
        .as_array()
        .and_then(|arr| arr.first())
        .cloned()
        .unwrap_or(Value::Null);

    // Return the plaintext token (shown once) plus the member object
    // Strip sensitive fields from the response
    let mut member = created;
    if let Some(obj) = member.as_object_mut() {
        obj.remove("token_hash");
    }

    Ok(json!({ "informant": member, "token": token }).to_string())
}

fn list_informants(access_token: &str) -> Result<String, String> {
    let user = fetch_user(access_token)?;
    let user_id = user
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or("Could not determine user ID from token")?;

    let informants = supabase_call(
        "db.select",
        json!({
            "table": "members",
            "select": "id,owner_id,name,avatar_url,token_prefix,last_used_at,member_type,created_at",
            "filters": [
                { "column": "owner_id", "op": "eq", "value": user_id },
                { "column": "member_type", "op": "eq", "value": "informant" }
            ],
            "order": [{ "column": "created_at", "direction": "desc" }],
            "access_token": access_token
        }),
    )?;

    Ok(json!({ "informants": informants }).to_string())
}

fn delete_informant(access_token: &str, member_id: &str) -> Result<String, String> {
    let user = fetch_user(access_token)?;
    let user_id = user
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or("Could not determine user ID from token")?;

    supabase_call(
        "db.delete",
        json!({
            "table": "members",
            "filters": [
                { "column": "id", "op": "eq", "value": member_id },
                { "column": "owner_id", "op": "eq", "value": user_id },
                { "column": "member_type", "op": "eq", "value": "informant" }
            ],
            "access_token": access_token
        }),
    )?;

    Ok(json!({ "deleted": true }).to_string())
}

fn regenerate_token(access_token: &str, member_id: &str) -> Result<String, String> {
    let user = fetch_user(access_token)?;
    let user_id = user
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or("Could not determine user ID from token")?;

    let (token, prefix, hash) = generate_token()?;

    let updated = supabase_call(
        "db.update",
        json!({
            "table": "members",
            "body": {
                "token_hash": hash,
                "token_prefix": prefix
            },
            "filters": [
                { "column": "id", "op": "eq", "value": member_id },
                { "column": "owner_id", "op": "eq", "value": user_id },
                { "column": "member_type", "op": "eq", "value": "informant" }
            ],
            "access_token": access_token
        }),
    )?;

    let rows = updated.as_array().map(|a| a.len()).unwrap_or(0);
    if rows == 0 {
        return Err("Informant not found or not owned by you".to_string());
    }

    Ok(json!({ "token": token, "token_prefix": prefix }).to_string())
}

/// Check if a user tier has access to a model requiring min_tier.
/// Hierarchy: godfather > boss > associate
fn tier_has_access(user_tier: &str, min_tier: &str) -> bool {
    let tier_level = |t: &str| -> u8 {
        match t {
            "godfather" => 3,
            "boss" => 2,
            "associate" => 1,
            _ => 0,
        }
    };
    tier_level(user_tier) >= tier_level(min_tier)
}

// ---------------------------------------------------------------------------
// Sub-component invocations
// ---------------------------------------------------------------------------

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

fn fetch_user(access_token: &str) -> Result<Value, String> {
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

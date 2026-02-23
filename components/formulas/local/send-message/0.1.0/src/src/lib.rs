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
const MENTION_PARSER_REF: &str = "reagent:local.mention-parser:0.1.0";
const MAX_ALL_MENTIONS: usize = 5;

// ---------------------------------------------------------------------------
// Request handling
//
// This formula orchestrates the "send message" workflow:
//   1. Resolve the caller's identity from the access token
//   2. Fetch sit-down participants (to know who's at the table)
//   3. Parse @mentions server-side via the mention-parser reagent
//   4. Validate business rules (@all limit, participation)
//   5. Insert the user's message into the database
//   6. Return message_id + mentioned_member_ids
//
// AI response triggering is intentionally NOT done here — the frontend
// fires those as individual fire-and-forget calls to the sit-down-response
// formula so that typing indicators and responses appear incrementally
// instead of blocking the entire send flow.
// ---------------------------------------------------------------------------

fn handle_request(input: &str) -> Result<String, String> {
    let parsed: Value =
        serde_json::from_str(input).map_err(|e| format!("Invalid JSON input: {e}"))?;

    let sit_down_id = parsed
        .get("sit_down_id")
        .and_then(|v| v.as_str())
        .ok_or("Missing required 'sit_down_id'")?;

    let content = parsed
        .get("content")
        .and_then(|v| v.as_str())
        .ok_or("Missing required 'content'")?;

    let access_token = parsed
        .get("access_token")
        .and_then(|v| v.as_str())
        .ok_or("Missing required 'access_token'")?;

    let reply_to_id = parsed.get("reply_to_id").and_then(|v| v.as_str());

    // 1. Fetch the caller's user identity from the token
    let user = fetch_user(access_token)?;
    let user_id = user
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or("Could not determine user ID from token")?;

    // 2. Fetch sit-down participants (with profiles and members)
    let participants = fetch_participants(sit_down_id, access_token)?;
    let participants_arr = participants
        .as_array()
        .ok_or("Expected participants array")?;

    // Verify caller is a participant
    let is_participant = participants_arr.iter().any(|p| {
        p.get("user_id").and_then(|v| v.as_str()) == Some(user_id)
    });
    if !is_participant {
        return Err("Not a participant of this sit-down".to_string());
    }

    // Extract member list for mention parsing
    let members: Vec<Value> = participants_arr
        .iter()
        .filter_map(|p| {
            let m = p.get("member")?;
            if m.is_null() {
                return None;
            }
            Some(json!({
                "id": m.get("id")?,
                "name": m.get("name")?,
                "owner_id": m.get("owner_id")?
            }))
        })
        .collect();

    // Extract Don list for disambiguation
    let dons: Vec<Value> = participants_arr
        .iter()
        .filter_map(|p| {
            let uid = p.get("user_id").and_then(|v| v.as_str())?;
            let profile = p.get("profile")?;
            if profile.is_null() {
                return None;
            }
            let display_name = profile.get("display_name").and_then(|v| v.as_str())?;
            Some(json!({
                "user_id": uid,
                "display_name": display_name
            }))
        })
        .collect();

    // 3. Parse mentions server-side via the mention-parser reagent
    let mention_result = parse_mentions(content, &members, &dons)?;

    // Check for mention parsing errors (e.g., @all exceeds limit)
    if let Some(err) = mention_result.get("error") {
        return Ok(json!({
            "error": err
        })
        .to_string());
    }

    let mentioned_ids: Vec<String> = mention_result
        .get("mentioned_member_ids")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();

    // 4. Insert the user's message
    let mut metadata = json!({});
    if let Some(rid) = reply_to_id {
        metadata["reply_to_id"] = json!(rid);
    }

    let inserted = supabase_call(
        "db.insert",
        json!({
            "table": "messages",
            "body": {
                "sit_down_id": sit_down_id,
                "sender_type": "don",
                "sender_user_id": user_id,
                "content": content,
                "mentions": mentioned_ids,
                "metadata": metadata
            },
            "access_token": access_token
        }),
    )?;

    let message_id = inserted
        .as_array()
        .and_then(|arr| arr.first())
        .and_then(|row| row.get("id"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    // 5. Return result — AI triggering is handled by the frontend
    Ok(json!({
        "message_id": message_id,
        "mentioned_member_ids": mentioned_ids
    })
    .to_string())
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

fn fetch_participants(sit_down_id: &str, access_token: &str) -> Result<Value, String> {
    supabase_call(
        "db.select",
        json!({
            "table": "sit_down_participants",
            "select": "id,user_id,member_id,profile:profiles(id,display_name),member:members(id,name,owner_id)",
            "filters": [
                { "column": "sit_down_id", "op": "eq", "value": sit_down_id }
            ],
            "access_token": access_token
        }),
    )
}

fn parse_mentions(text: &str, members: &[Value], dons: &[Value]) -> Result<Value, String> {
    let request = json!({
        "reference": { "registry": MENTION_PARSER_REF },
        "input": {
            "text": text,
            "members": members,
            "dons": dons,
            "max_all_mentions": MAX_ALL_MENTIONS
        },
        "type": "reagent"
    });

    let response_str = invoke::call(&request.to_string());

    let response: Value = serde_json::from_str(&response_str)
        .map_err(|e| format!("Failed to parse mention-parser response: {e}"))?;

    if let Some(err) = response.get("error") {
        return Err(format!("Mention parser invoke error: {err}"));
    }

    let output = response.get("output").cloned().unwrap_or(Value::Null);
    let result = match &output {
        Value::String(s) => serde_json::from_str::<Value>(s).unwrap_or(output.clone()),
        _ => output,
    };

    Ok(result)
}

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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SUPABASE_REF: &str = "catalyst:moonmoon69.supabase:0.2.0";
const CLAUDE_REF: &str = "catalyst:moonmoon69.claude:0.2.0";
const OPENAI_REF: &str = "catalyst:moonmoon69.openai:0.2.0";
const GEMINI_REF: &str = "catalyst:moonmoon69.gemini:0.2.0";
const MENTION_PARSER_REF: &str = "reagent:local.mention-parser:0.1.0";
const SELF_REF: &str = "formula:local.sit-down:0.1.0";
const MAX_ALL_MENTIONS: usize = 5;
const MAX_CONTEXT_MESSAGES: usize = 50;

// ---------------------------------------------------------------------------
// 1. Action routing
// ---------------------------------------------------------------------------

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
        // Sit-down CRUD (no sit_down_id needed for list/create)
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
            let sit_down_id = require_sit_down_id(&parsed)?;
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
            let sit_down_id = require_sit_down_id(&parsed)?;
            delete_commission_sit_down(access_token, sit_down_id)
        }

        // Participant management (requires sit_down_id)
        "get" => {
            let sit_down_id = require_sit_down_id(&parsed)?;
            get_sit_down(access_token, sit_down_id)
        }
        "list_participants" => {
            let sit_down_id = require_sit_down_id(&parsed)?;
            list_participants(access_token, sit_down_id)
        }
        "add_member" => {
            let sit_down_id = require_sit_down_id(&parsed)?;
            let member_id = parsed
                .get("member_id")
                .and_then(|v| v.as_str())
                .ok_or("Missing required 'member_id'")?;
            add_member(access_token, sit_down_id, member_id)
        }
        "add_don" => {
            let sit_down_id = require_sit_down_id(&parsed)?;
            let user_id = parsed
                .get("user_id")
                .and_then(|v| v.as_str())
                .ok_or("Missing required 'user_id'")?;
            add_don(access_token, sit_down_id, user_id)
        }
        "remove_participant" => {
            let sit_down_id = require_sit_down_id(&parsed)?;
            let participant_id = parsed
                .get("participant_id")
                .and_then(|v| v.as_str())
                .ok_or("Missing required 'participant_id'")?;
            remove_participant(access_token, sit_down_id, participant_id)
        }

        // Messaging
        "list_messages" => {
            let sit_down_id = require_sit_down_id(&parsed)?;
            list_messages(access_token, sit_down_id)
        }
        "send_message" => {
            let sit_down_id = require_sit_down_id(&parsed)?;
            let content = parsed
                .get("content")
                .and_then(|v| v.as_str())
                .ok_or("Missing required 'content'")?;
            let reply_to_id = parsed.get("reply_to_id").and_then(|v| v.as_str());
            send_message(access_token, sit_down_id, content, reply_to_id)
        }

        // Internal: AI member response (spawned by send_message)
        "_respond_member" => {
            let member_id = parsed
                .get("member_id")
                .and_then(|v| v.as_str())
                .ok_or("Missing required 'member_id'")?;
            let context = parsed
                .get("context")
                .ok_or("Missing required 'context'")?;
            let reply_to_id = parsed.get("reply_to_id").and_then(|v| v.as_str());
            respond_member(access_token, member_id, context, reply_to_id)
        }

        _ => Err(format!("Unknown action: {action}")),
    }
}

fn require_sit_down_id<'a>(parsed: &'a Value) -> Result<&'a str, String> {
    parsed
        .get("sit_down_id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "Missing required 'sit_down_id'".to_string())
}

// ---------------------------------------------------------------------------
// 2. Sit-down CRUD (from sit-downs-api)
// ---------------------------------------------------------------------------

fn list_sit_downs(access_token: &str) -> Result<String, String> {
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
    let _user = fetch_user(access_token)?;

    if name.trim().is_empty() {
        return Err("Sit-down name cannot be empty".to_string());
    }

    let sit_down = supabase_call_once(
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

    supabase_call_once(
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
    let _user = fetch_user(access_token)?;

    if name.trim().is_empty() {
        return Err("Commission sit-down name cannot be empty".to_string());
    }

    let sit_down = supabase_call_once(
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

    supabase_call_once(
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
// 3. Participant management (from sit-down-api)
// ---------------------------------------------------------------------------

/// Combined get: returns sit_down metadata + participants + commission members in one call.
/// Eliminates the need for separate get + list_participants round-trips.
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

    let is_commission = sit_down
        .get("is_commission")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    let mut commission_members = Value::Array(vec![]);

    if is_commission {
        let empty = vec![];
        let participants_arr = participants.as_array().unwrap_or(&empty);

        let don_user_ids: Vec<&str> = participants_arr
            .iter()
            .filter_map(|p| p.get("user_id").and_then(|v| v.as_str()))
            .collect();

        if !don_user_ids.is_empty() {
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
        "sit_down": sit_down,
        "participants": participants,
        "commission_members": commission_members,
        "is_commission": is_commission
    })
    .to_string())
}

/// Standalone list_participants — used by Realtime refresh (sit_down already loaded).
fn list_participants(access_token: &str, sit_down_id: &str) -> Result<String, String> {
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

        let don_user_ids: Vec<&str> = participants_arr
            .iter()
            .filter_map(|p| p.get("user_id").and_then(|v| v.as_str()))
            .collect();

        if !don_user_ids.is_empty() {
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

    let inserted = supabase_call_once(
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

    let inserted = supabase_call_once(
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
    supabase_call_once(
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
// 4. Messaging: list_messages + unified send_message
// ---------------------------------------------------------------------------

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

fn send_message(
    access_token: &str,
    sit_down_id: &str,
    content: &str,
    reply_to_id: Option<&str>,
) -> Result<String, String> {
    // 1. Extract user_id from JWT (no Supabase call — RLS validates on subsequent queries)
    let user_id = user_id_from_jwt(access_token)?;

    // 2. Fetch sit-down participants
    let participants = supabase_call(
        "db.select",
        json!({
            "table": "sit_down_participants",
            "select": "id,user_id,member_id,profile:profiles(id,display_name),member:members(id,name,owner_id,system_prompt,catalog_model:model_catalog(id,provider,model,alias)),sit_down:sit_downs(id,name,is_commission)",
            "filters": [
                { "column": "sit_down_id", "op": "eq", "value": sit_down_id }
            ],
            "access_token": access_token
        }),
    )?;
    let participants_arr = participants
        .as_array()
        .ok_or("Expected participants array")?;

    // Verify caller is a participant
    let is_participant = participants_arr.iter().any(|p| {
        p.get("user_id").and_then(|v| v.as_str()) == Some(&user_id)
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
        return Ok(json!({ "error": err }).to_string());
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

    let inserted = supabase_call_once(
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

    // 5. If no mentions, return immediately
    if mentioned_ids.is_empty() {
        return Ok(json!({
            "message_id": message_id,
            "mentioned_member_ids": mentioned_ids,
            "results": []
        })
        .to_string());
    }

    // 6. Extract sit_down from participants (joined in step 2) + fetch messages for AI context
    let sit_down_obj = participants_arr
        .first()
        .and_then(|p| p.get("sit_down"))
        .cloned()
        .unwrap_or(Value::Null);

    let messages = supabase_call(
        "db.select",
        json!({
            "table": "messages",
            "select": "id,content,sender_type,sender_user_id,sender_member_id,created_at,profile:profiles(display_name),member:members(id,name,owner_id)",
            "filters": [
                { "column": "sit_down_id", "op": "eq", "value": sit_down_id }
            ],
            "order": [{ "column": "created_at", "direction": "desc" }],
            "limit": MAX_CONTEXT_MESSAGES,
            "access_token": access_token
        }),
    )?;

    // Pre-fetch context to pass to each spawned _respond_member
    let context = json!({
        "sit_down_id": sit_down_id,
        "sit_down": sit_down_obj,
        "participants": participants,
        "messages": messages,
        "user_id": user_id
    });

    // 7. Spawn one _respond_member per mentioned member
    let mut task_ids: Vec<String> = Vec::new();
    for mid in &mentioned_ids {
        let mut spawn_input = json!({
            "action": "_respond_member",
            "access_token": access_token,
            "member_id": mid,
            "context": context
        });
        if let Some(rid) = reply_to_id {
            spawn_input["reply_to_id"] = json!(rid);
        }

        let spawn_request = json!({
            "reference": SELF_REF,
            "input": spawn_input,
            "type": "formula"
        });

        let spawn_response_str = invoke::spawn(&spawn_request.to_string());
        let spawn_response: Value = serde_json::from_str(&spawn_response_str)
            .map_err(|e| format!("Failed to parse spawn response: {e}"))?;

        if let Some(err) = spawn_response.get("error") {
            return Err(format!("Spawn error: {err}"));
        }

        let task_id = spawn_response
            .get("task_id")
            .and_then(|v| v.as_str())
            .ok_or("Missing task_id in spawn response")?
            .to_string();
        task_ids.push(task_id);
    }

    // 8. Await all spawned tasks
    let await_response_str =
        invoke::await_all(&json!({ "task_ids": task_ids }).to_string());
    let await_response: Value = serde_json::from_str(&await_response_str)
        .map_err(|e| format!("Failed to parse await-all response: {e}"))?;

    if let Some(err) = await_response.get("error") {
        return Err(format!("Await-all error: {err}"));
    }

    let batch_results = await_response.get("results").cloned().unwrap_or(json!([]));
    let batch_results_arr = batch_results.as_array().cloned().unwrap_or_default();

    // 9. Map results back to member_ids
    let mut results = Vec::new();
    for (i, mid) in mentioned_ids.iter().enumerate() {
        let batch_result = batch_results_arr.get(i).cloned().unwrap_or(Value::Null);
        let status = batch_result
            .get("status")
            .and_then(|v| v.as_str())
            .unwrap_or("error");

        if status != "completed" {
            let err_msg = batch_result
                .get("error")
                .and_then(|v| v.get("message"))
                .and_then(|v| v.as_str())
                .or_else(|| batch_result.get("error").and_then(|v| v.as_str()))
                .unwrap_or("Formula invocation failed");
            results.push(json!({
                "member_id": mid,
                "status": "error",
                "error": err_msg
            }));
            continue;
        }

        let output = batch_result.get("output").cloned().unwrap_or(Value::Null);
        let result = match &output {
            Value::String(s) => serde_json::from_str::<Value>(s).unwrap_or(output.clone()),
            _ => output,
        };

        if let Some(err) = result.get("error") {
            let err_msg = err
                .get("message")
                .and_then(|v| v.as_str())
                .unwrap_or("Formula error");
            results.push(json!({
                "member_id": mid,
                "status": "error",
                "error": err_msg
            }));
            continue;
        }

        let resp_message_id = result
            .get("message_id")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        results.push(json!({
            "member_id": mid,
            "status": "ok",
            "message_id": resp_message_id
        }));
    }

    Ok(json!({
        "message_id": message_id,
        "mentioned_member_ids": mentioned_ids,
        "results": results
    })
    .to_string())
}

// ---------------------------------------------------------------------------
// 5. AI response: _respond_member (spawned by send_message)
// ---------------------------------------------------------------------------

fn respond_member(
    access_token: &str,
    member_id: &str,
    context: &Value,
    reply_to_id: Option<&str>,
) -> Result<String, String> {
    let sit_down_id = context
        .get("sit_down_id")
        .and_then(|v| v.as_str())
        .ok_or("context missing sit_down_id")?;
    let sit_down = context
        .get("sit_down")
        .ok_or("context missing sit_down")?;
    let participants = context
        .get("participants")
        .ok_or("context missing participants")?;
    let messages = context
        .get("messages")
        .ok_or("context missing messages")?;
    let user_id = context
        .get("user_id")
        .and_then(|v| v.as_str())
        .ok_or("context missing user_id")?;

    // 1. Look up member from pre-fetched participants context (no Supabase call)
    let member = participants
        .as_array()
        .and_then(|arr| {
            arr.iter().find(|p| {
                p.get("member")
                    .and_then(|m| m.get("id"))
                    .and_then(|v| v.as_str())
                    == Some(member_id)
            })
        })
        .and_then(|p| p.get("member"))
        .cloned()
        .ok_or_else(|| format!("Member '{member_id}' not found in participants context"))?;

    let catalog_model = member
        .get("catalog_model")
        .ok_or("Member has no catalog_model assigned")?;

    let provider = catalog_model
        .get("provider")
        .and_then(|v| v.as_str())
        .ok_or("catalog_model missing 'provider'")?;

    let model = catalog_model
        .get("model")
        .and_then(|v| v.as_str())
        .ok_or("catalog_model missing 'model'")?;

    let member_name = member
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap_or("Unknown");

    // 2. Insert typing indicator
    insert_typing_indicator(sit_down_id, member_id, member_name, user_id, access_token);

    // 3. Build system prompt + conversation history
    let system_prompt = build_system_prompt(&member, sit_down, participants);
    let conversation = build_conversation_history(member_id, messages, sit_down, participants);

    // 4. Invoke AI catalyst
    let ai_result = invoke_ai_provider(provider, model, &system_prompt, &conversation);

    // 5. Typing indicator cleanup is handled inside insert_ai_message RPC

    let content = ai_result?;

    // 6. Insert AI response via RPC (also cleans up typing indicator in same DB call)
    let mut metadata = json!({
        "provider": provider,
        "model": model
    });
    if let Some(rid) = reply_to_id {
        metadata["reply_to_id"] = json!(rid);
    }

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

    Ok(json!({
        "message_id": message_id,
        "content": content,
        "provider": provider,
        "model": model
    })
    .to_string())
}

// ---------------------------------------------------------------------------
// 6. AI provider helpers (from sit-down-response)
// ---------------------------------------------------------------------------

fn build_system_prompt(member: &Value, sit_down: &Value, participants: &Value) -> String {
    let member_name = member.get("name").and_then(|v| v.as_str()).unwrap_or("Unknown");
    let owner_id = member.get("owner_id").and_then(|v| v.as_str()).unwrap_or("");
    let custom_prompt = member.get("system_prompt").and_then(|v| v.as_str()).unwrap_or("");
    let is_commission = sit_down.get("is_commission").and_then(|v| v.as_bool()).unwrap_or(false);

    let mut preamble = format!(
        "Your name is \"{member_name}\". Never prefix your responses with your name or \
         a label like \"[{member_name}]:\" \u{2014} just respond directly with your message. \
         Respond only as yourself \u{2014} do not write dialogue or responses for other participants. \
         When multiple roles are addressed in the same message, focus on the instructions directed at you. \
         You should respond in the same language as the latest message addressed to you."
    );

    let participants_arr = participants.as_array();

    let dons: Vec<(&str, &str)> = participants_arr
        .map(|arr| {
            arr.iter()
                .filter_map(|p| {
                    let uid = p.get("user_id").and_then(|v| v.as_str())?;
                    let name = p
                        .get("profile")
                        .and_then(|v| v.get("display_name"))
                        .and_then(|v| v.as_str())?;
                    Some((uid, name))
                })
                .collect()
        })
        .unwrap_or_default();

    let all_members: Vec<(&str, &str, &str)> = participants_arr
        .map(|arr| {
            arr.iter()
                .filter_map(|p| {
                    let m = p.get("member")?;
                    let mid = m.get("id").and_then(|v| v.as_str())?;
                    let mname = m.get("name").and_then(|v| v.as_str())?;
                    let mowner = m.get("owner_id").and_then(|v| v.as_str()).unwrap_or("");
                    Some((mid, mname, mowner))
                })
                .collect()
        })
        .unwrap_or_default();

    if is_commission {
        let owner_don_name = dons
            .iter()
            .find(|(uid, _)| *uid == owner_id)
            .map(|(_, name)| format!("Don {name}"))
            .unwrap_or_else(|| "your Don".to_string());

        preamble.push_str(&format!(
            "\n\nYou were created by {owner_don_name}. You report to {owner_don_name}."
        ));

        let mut family_lines = Vec::new();
        for (don_uid, don_name) in &dons {
            let don_members: Vec<&str> = all_members
                .iter()
                .filter(|(_, _, mowner)| mowner == don_uid)
                .map(|(_, mname, _)| *mname)
                .collect();

            if don_members.is_empty() {
                family_lines.push(format!("- Don {don_name} (no members at the table)"));
            } else {
                family_lines.push(format!(
                    "- Don {don_name}'s team: {}",
                    don_members.join(", ")
                ));
            }
        }

        preamble.push_str(&format!(
            "\n\nThis is a group sit-down. The people and roles present are:\n{}",
            family_lines.join("\n")
        ));

        preamble.push_str(&format!(
            "\n\nAlways address Dons as \"Don [Name]\". Be helpful to everyone, \
             but if there's a conflict of interest, defer to {owner_don_name}."
        ));
    } else if !dons.is_empty() {
        let don_name = dons[0].1;
        preamble.push_str(&format!(
            " You report to Don {don_name}. Always address them as \"Don {don_name}\"."
        ));
    }

    format!("{preamble}\n\n{custom_prompt}")
}

fn build_conversation_history(
    member_id: &str,
    messages: &Value,
    sit_down: &Value,
    participants: &Value,
) -> Vec<Value> {
    let msgs = match messages.as_array() {
        Some(arr) => arr,
        None => return vec![],
    };

    let is_commission = sit_down
        .get("is_commission")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    let participants_arr = participants.as_array();
    let mut name_counts: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
    if let Some(arr) = participants_arr {
        for p in arr {
            if let Some(name) = p
                .get("member")
                .and_then(|m| m.get("name"))
                .and_then(|v| v.as_str())
            {
                *name_counts.entry(name.to_string()).or_insert(0) += 1;
            }
        }
    }
    let duplicate_names: std::collections::HashSet<String> = name_counts
        .into_iter()
        .filter(|(_, count)| *count > 1)
        .map(|(name, _)| name)
        .collect();

    let dons: Vec<(&str, &str)> = participants_arr
        .map(|arr| {
            arr.iter()
                .filter_map(|p| {
                    let uid = p.get("user_id").and_then(|v| v.as_str())?;
                    let name = p
                        .get("profile")
                        .and_then(|v| v.get("display_name"))
                        .and_then(|v| v.as_str())?;
                    Some((uid, name))
                })
                .collect()
        })
        .unwrap_or_default();

    let recent: Vec<&Value> = msgs.iter().rev().collect();

    let mut history: Vec<Value> = recent
        .iter()
        .map(|msg| {
            let sender_type = msg.get("sender_type").and_then(|v| v.as_str()).unwrap_or("");
            let sender_member_id = msg.get("sender_member_id").and_then(|v| v.as_str()).unwrap_or("");
            let content = msg.get("content").and_then(|v| v.as_str()).unwrap_or("");

            if sender_type == "member" && sender_member_id == member_id {
                json!({ "role": "assistant", "content": content })
            } else if sender_type == "don" {
                let name = msg
                    .get("profile")
                    .and_then(|v| v.get("display_name"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("Don");
                json!({ "role": "user", "content": format!("[Don {name}]: {content}") })
            } else {
                let msg_member_name = msg
                    .get("member")
                    .and_then(|m| m.get("name"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("Unknown");

                if is_commission && duplicate_names.contains(msg_member_name) {
                    let msg_owner_id = msg
                        .get("member")
                        .and_then(|m| m.get("owner_id"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("");
                    if let Some((_, don_name)) = dons.iter().find(|(uid, _)| *uid == msg_owner_id) {
                        return json!({ "role": "user", "content": format!("[{msg_member_name} (Don {don_name}'s)]: {content}") });
                    }
                }

                json!({ "role": "user", "content": format!("[{msg_member_name}]: {content}") })
            }
        })
        .collect();

    if let Some(last) = history.last() {
        if last.get("role").and_then(|v| v.as_str()) == Some("assistant") {
            let content = last.get("content").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let len = history.len();
            history[len - 1] = json!({ "role": "user", "content": content });
        }
    }

    history
}

fn resolve_provider_ref(provider: &str) -> Result<(String, String), String> {
    match provider.to_lowercase().as_str() {
        "claude" => Ok((CLAUDE_REF.to_string(), "claude".to_string())),
        "openai" => Ok((OPENAI_REF.to_string(), "openai".to_string())),
        "gemini" => Ok((GEMINI_REF.to_string(), "gemini".to_string())),
        _ => Err(format!("Unsupported AI provider: '{provider}'")),
    }
}

fn invoke_ai_provider(
    provider: &str,
    model: &str,
    system: &str,
    messages: &[Value],
) -> Result<String, String> {
    let (component_ref, catalyst_name) = resolve_provider_ref(provider)?;

    let catalyst_input = build_provider_request(&catalyst_name, model, messages, system);

    let invoke_request = json!({
        "reference": &component_ref,
        "input": catalyst_input,
        "type": "catalyst"
    });

    let response_str = invoke::call(&invoke_request.to_string());

    let response: Value = serde_json::from_str(&response_str)
        .map_err(|e| format!("Failed to parse AI response: {e}"))?;

    if let Some(err) = response.get("error") {
        return Err(format!("AI invoke error: {err}"));
    }

    let output = response.get("output").cloned().unwrap_or(Value::Null);
    let catalyst_result = match &output {
        Value::String(s) => serde_json::from_str::<Value>(s).unwrap_or(output.clone()),
        _ => output,
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

    let data = catalyst_result.get("data").cloned().unwrap_or(Value::Null);
    let content = extract_content(&data, &catalyst_name);

    if content.is_empty() {
        return Err("Empty response from AI provider".to_string());
    }

    Ok(content)
}

fn build_provider_request(
    catalyst_name: &str,
    model: &str,
    messages: &[Value],
    system: &str,
) -> Value {
    let lower = catalyst_name.to_lowercase();

    if lower.contains("claude") {
        json!({
            "operation": "messages.create",
            "params": {
                "model": model,
                "system": system,
                "messages": messages,
                "max_tokens": 4096,
                "tools": [{ "type": "web_search_20250305", "name": "web_search" }]
            }
        })
    } else if lower.contains("openai") {
        json!({
            "operation": "responses.create",
            "params": {
                "model": model,
                "instructions": system,
                "input": messages,
                "tools": [{ "type": "web_search_preview" }],
                "max_output_tokens": 4096
            }
        })
    } else if lower.contains("gemini") {
        let contents: Vec<Value> = messages
            .iter()
            .map(|msg| {
                let role = msg.get("role").and_then(|v| v.as_str()).unwrap_or("user");
                let gemini_role = if role == "assistant" { "model" } else { "user" };
                let text = msg.get("content").and_then(|v| v.as_str()).unwrap_or("");
                json!({
                    "role": gemini_role,
                    "parts": [{ "text": text }]
                })
            })
            .collect();

        json!({
            "operation": "generate",
            "params": {
                "model": model,
                "systemInstruction": { "parts": [{ "text": system }] },
                "contents": contents,
                "generationConfig": { "maxOutputTokens": 4096 },
                "tools": [{ "google_search": {} }, { "url_context": {} }]
            }
        })
    } else {
        json!({
            "operation": "chat.create",
            "params": {
                "model": model,
                "system": system,
                "messages": messages,
                "max_tokens": 4096
            }
        })
    }
}

fn extract_content(data: &Value, catalyst_name: &str) -> String {
    if let Some(text) = data.get("combined_text").and_then(|v| v.as_str()) {
        return text.to_string();
    }

    let lower = catalyst_name.to_lowercase();

    if lower.contains("claude") {
        if let Some(content) = data.get("content").and_then(|v| v.as_array()) {
            return content
                .iter()
                .filter(|c| c.get("type").and_then(|v| v.as_str()) == Some("text"))
                .filter_map(|c| c.get("text").and_then(|v| v.as_str()))
                .collect::<Vec<_>>()
                .join("");
        }
    } else if lower.contains("openai") {
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
// 7. Shared helpers
// ---------------------------------------------------------------------------

fn supabase_call_once(operation: &str, params: Value) -> Result<Value, String> {
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

/// Retries supabase_call_once once on any error. Used for reads and
/// idempotent writes (insert_ai_message) where a transient 502/timeout
/// is more likely than a successful-but-lost response.
fn supabase_call(operation: &str, params: Value) -> Result<Value, String> {
    let retry_params = params.clone();
    match supabase_call_once(operation, params) {
        Ok(v) => Ok(v),
        Err(_) => supabase_call_once(operation, retry_params),
    }
}

fn fetch_user_once(access_token: &str) -> Result<Value, String> {
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

fn fetch_user(access_token: &str) -> Result<Value, String> {
    match fetch_user_once(access_token) {
        Ok(v) => Ok(v),
        Err(_) => fetch_user_once(access_token),
    }
}

fn parse_mentions(text: &str, members: &[Value], dons: &[Value]) -> Result<Value, String> {
    let request = json!({
        "reference": MENTION_PARSER_REF,
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

fn user_id_from_jwt(token: &str) -> Result<String, String> {
    let parts: Vec<&str> = token.splitn(3, '.').collect();
    if parts.len() < 2 {
        return Err("Invalid JWT: not enough segments".into());
    }
    // base64url decode the payload (middle segment)
    let mut payload = parts[1].replace('-', "+").replace('_', "/");
    // pad to multiple of 4
    while payload.len() % 4 != 0 {
        payload.push('=');
    }
    let decoded = base64_decode(&payload)?;
    let json_str = String::from_utf8(decoded)
        .map_err(|e| format!("JWT payload is not valid UTF-8: {e}"))?;
    let claims: Value = serde_json::from_str(&json_str)
        .map_err(|e| format!("JWT payload is not valid JSON: {e}"))?;
    claims
        .get("sub")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| "JWT payload missing 'sub' claim".into())
}

fn base64_decode(input: &str) -> Result<Vec<u8>, String> {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = Vec::new();
    let mut buf: u32 = 0;
    let mut bits: u32 = 0;
    for &b in input.as_bytes() {
        if b == b'=' { break; }
        let val = TABLE.iter().position(|&c| c == b)
            .ok_or_else(|| format!("Invalid base64 character: {}", b as char))? as u32;
        buf = (buf << 6) | val;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((buf >> bits) as u8);
            buf &= (1 << bits) - 1;
        }
    }
    Ok(out)
}

fn insert_typing_indicator(sit_down_id: &str, member_id: &str, member_name: &str, user_id: &str, access_token: &str) {
    // Single fire-and-forget insert; PK (sit_down_id, member_id) prevents duplicates.
    // On conflict it fails silently — that's fine, indicator already exists.
    // Cleanup happens inside insert_ai_message RPC when the AI response is saved.
    let _ = supabase_call_once(
        "db.insert",
        json!({
            "table": "typing_indicators",
            "body": {
                "sit_down_id": sit_down_id,
                "member_id": member_id,
                "member_name": member_name,
                "started_by": user_id
            },
            "access_token": access_token
        }),
    );
}

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

const SUPABASE_REF: &str = "catalyst:local.supabase:0.3.2";

fn handle_request(input: &str) -> Result<String, String> {
    let parsed: Value =
        serde_json::from_str(input).map_err(|e| format!("Invalid JSON input: {e}"))?;

    let action = parsed
        .get("action")
        .and_then(|v| v.as_str())
        .unwrap_or("respond");

    match action {
        "respond" => handle_respond(&parsed),
        "list_entries" => handle_list_entries(&parsed),
        "search" => handle_search(&parsed),
        "get_entry" => handle_get_entry(&parsed),
        "create_entry" => handle_create_entry(&parsed),
        "update_entry" => handle_update_entry(&parsed),
        "delete_entry" => handle_delete_entry(&parsed),
        "insert_message" => handle_insert_message(&parsed),
        "create_operation" => handle_create_operation(&parsed),
        "update_operation" => handle_update_operation(&parsed),
        _ => Err(format!("Unknown action: {action}")),
    }
}

// ---------------------------------------------------------------------------
// Respond action (existing — AI synthesis from entries)
// ---------------------------------------------------------------------------

fn handle_respond(parsed: &Value) -> Result<String, String> {
    let catalyst_ref = parsed
        .get("catalyst_ref")
        .and_then(|v| v.as_str())
        .ok_or("Missing required 'catalyst_ref'")?;

    let model = parsed
        .get("model")
        .and_then(|v| v.as_str())
        .ok_or("Missing required 'model'")?;

    let system = parsed
        .get("system")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    let conversation = parsed
        .get("conversation")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    let member = parsed.get("member").cloned().unwrap_or(Value::Null);
    let member_id = parsed.get("member_id").and_then(|v| v.as_str()).unwrap_or("");
    let access_token = parsed.get("access_token").and_then(|v| v.as_str()).unwrap_or("");
    let sit_down_id = parsed.get("sit_down_id").and_then(|v| v.as_str()).unwrap_or("");
    let member_name = member.get("name").and_then(|v| v.as_str()).unwrap_or("Bookkeeper");

    // 1. Get the user's latest message as search query
    let query = get_last_user_message(&conversation);

    if query.is_empty() {
        return Ok(json!({
            "content": "I need a question or topic to search my records.",
            "usage": {},
            "entries_used": 0
        })
        .to_string());
    }

    // 2. Search entries via full-text search
    emit_event(sit_down_id, member_id, member_name, json!({"kind": "status", "text": "Searching knowledge entries..."}), access_token);

    let owner_id = member.get("owner_id").and_then(|v| v.as_str()).unwrap_or("");
    let entries = search_entries(member_id, owner_id, &query, access_token);
    let entries_arr = entries.as_array().cloned().unwrap_or_default();

    if entries_arr.is_empty() {
        emit_event(sit_down_id, member_id, member_name, json!({"kind": "status", "text": "No matching entries found, responding from general knowledge..."}), access_token);
    } else {
        emit_event(sit_down_id, member_id, member_name, json!({"kind": "status", "text": format!("Found {} relevant entries, synthesizing...", entries_arr.len())}), access_token);
    }

    // 3. Build context from matching entries
    let mut context_text = String::new();
    if !entries_arr.is_empty() {
        context_text.push_str("RELEVANT KNOWLEDGE ENTRIES:\n\n");
        for (i, entry) in entries_arr.iter().enumerate() {
            let title = entry.get("title").and_then(|v| v.as_str()).unwrap_or("Untitled");
            let content = entry.get("content").and_then(|v| v.as_str()).unwrap_or("");
            let tags = entry.get("tags").and_then(|v| v.as_array())
                .map(|arr| arr.iter().filter_map(|t| t.as_str()).collect::<Vec<_>>().join(", "))
                .unwrap_or_default();

            context_text.push_str(&format!("--- Entry {} ---\n", i + 1));
            context_text.push_str(&format!("Title: {title}\n"));
            if !tags.is_empty() {
                context_text.push_str(&format!("Tags: {tags}\n"));
            }
            context_text.push_str(&format!("Content:\n{content}\n\n"));
        }
    }

    // 4. LLM call with entries as context to synthesize answer
    let bookkeeper_system = format!(
        "You are {member_name}, a Bookkeeper in the Family. You maintain and retrieve knowledge. \
         When answering questions, draw from the knowledge entries provided below. \
         If the entries don't contain relevant information, say so honestly.\n\n\
         {context_text}\n\n---\n\n{system}"
    );

    let provider_label = extract_provider_label(catalyst_ref);
    emit_event(sit_down_id, member_id, member_name, json!({"kind": "status", "text": format!("Calling {}...", provider_label)}), access_token);
    emit_event(sit_down_id, member_id, member_name, json!({"kind": "turn_start", "turn": 1}), access_token);

    let catalyst_input = build_provider_request(catalyst_ref, model, &conversation, &bookkeeper_system);
    let data = invoke_catalyst(catalyst_ref, &catalyst_input)?;
    emit_native_tool_events(&data, catalyst_ref, sit_down_id, member_id, member_name, access_token);
    let content = extract_content(&data, catalyst_ref);

    if content.is_empty() {
        return Err("Empty response from AI provider".to_string());
    }

    let usage = extract_usage(&data);

    emit_event(sit_down_id, member_id, member_name, json!({"kind": "text_delta", "content": content, "turn": 1}), access_token);
    emit_event(sit_down_id, member_id, member_name, json!({"kind": "usage", "turn": 1, "input_tokens": usage.get("input_tokens").and_then(|v| v.as_u64()).unwrap_or(0), "output_tokens": usage.get("output_tokens").and_then(|v| v.as_u64()).unwrap_or(0)}), access_token);

    Ok(json!({
        "content": content,
        "usage": usage,
        "entries_used": entries_arr.len()
    })
    .to_string())
}

// ---------------------------------------------------------------------------
// Emit helper
// ---------------------------------------------------------------------------

// Fire-and-forget: broadcast failure is acceptable, message delivery is DB-backed
fn emit_event(sit_down_id: &str, member_id: &str, member_name: &str, event: Value, _access_token: &str) {
    let mut payload = event;
    if let Some(obj) = payload.as_object_mut() {
        obj.insert("member_id".into(), json!(member_id));
        obj.insert("member_name".into(), json!(member_name));
        obj.insert("sit_down_id".into(), json!(sit_down_id));
    }

    let _ = invoke::emit(&payload.to_string());
}

// ---------------------------------------------------------------------------
// CRUD actions
// ---------------------------------------------------------------------------

fn handle_list_entries(parsed: &Value) -> Result<String, String> {
    let access_token = parsed
        .get("access_token")
        .and_then(|v| v.as_str())
        .ok_or("Missing required 'access_token'")?;
    let bookkeeper_id = parsed
        .get("bookkeeper_id")
        .and_then(|v| v.as_str())
        .ok_or("Missing required 'bookkeeper_id'")?;

    let user = fetch_user(access_token)?;
    let user_id = user
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or("Could not get user ID")?;

    let data = supabase_call(
        "select",
        json!({
            "access_token": access_token,
            "table": "bookkeeper_entries",
            "select": "*",
            "filters": [
                {"column": "bookkeeper_id", "op": "eq", "value": bookkeeper_id},
                {"column": "owner_id", "op": "eq", "value": user_id}
            ],
            "order": [{"column": "created_at", "ascending": false}],
            "limit": 200
        }),
    )?;

    Ok(json!({ "entries": data }).to_string())
}

fn handle_search(parsed: &Value) -> Result<String, String> {
    let access_token = parsed
        .get("access_token")
        .and_then(|v| v.as_str())
        .ok_or("Missing required 'access_token'")?;
    let bookkeeper_id = parsed
        .get("bookkeeper_id")
        .and_then(|v| v.as_str())
        .ok_or("Missing required 'bookkeeper_id'")?;
    let query = parsed
        .get("query")
        .and_then(|v| v.as_str())
        .ok_or("Missing required 'query'")?;

    let user = fetch_user(access_token)?;
    let user_id = user
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or("Could not get user ID")?;

    let data = supabase_call(
        "rpc",
        json!({
            "access_token": access_token,
            "function": "search_bookkeeper_entries",
            "params": {
                "p_bookkeeper_id": bookkeeper_id,
                "p_owner_id": user_id,
                "p_query": query
            }
        }),
    )?;

    Ok(json!({ "entries": data }).to_string())
}

fn handle_get_entry(parsed: &Value) -> Result<String, String> {
    let access_token = parsed
        .get("access_token")
        .and_then(|v| v.as_str())
        .ok_or("Missing required 'access_token'")?;
    let entry_id = parsed
        .get("entry_id")
        .and_then(|v| v.as_str())
        .ok_or("Missing required 'entry_id'")?;

    let _user = fetch_user(access_token)?;

    let data = supabase_call(
        "select",
        json!({
            "access_token": access_token,
            "table": "bookkeeper_entries",
            "select": "*",
            "filters": [
                {"column": "id", "op": "eq", "value": entry_id}
            ],
            "limit": 1
        }),
    )?;

    let entry = data
        .as_array()
        .and_then(|a| a.first())
        .ok_or("Entry not found")?;

    Ok(json!({ "entry": entry }).to_string())
}

fn handle_create_entry(parsed: &Value) -> Result<String, String> {
    let access_token = parsed
        .get("access_token")
        .and_then(|v| v.as_str())
        .ok_or("Missing required 'access_token'")?;
    let bookkeeper_id = parsed
        .get("bookkeeper_id")
        .and_then(|v| v.as_str())
        .ok_or("Missing required 'bookkeeper_id'")?;
    let title = parsed
        .get("title")
        .and_then(|v| v.as_str())
        .ok_or("Missing required 'title'")?;
    let content = parsed
        .get("content")
        .and_then(|v| v.as_str())
        .ok_or("Missing required 'content'")?;

    let user = fetch_user(access_token)?;
    let user_id = user
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or("Could not get user ID")?;

    let mut body = json!({
        "bookkeeper_id": bookkeeper_id,
        "owner_id": user_id,
        "title": title,
        "content": content
    });

    if let Some(tags_val) = parsed.get("tags") {
        if tags_val.is_array() {
            body["tags"] = tags_val.clone();
        }
    }
    if let Some(sm_id) = parsed.get("source_member_id").and_then(|v| v.as_str()) {
        body["source_member_id"] = json!(sm_id);
    }
    if let Some(so_id) = parsed.get("source_operation_id").and_then(|v| v.as_str()) {
        body["source_operation_id"] = json!(so_id);
    }
    if let Some(meta) = parsed.get("metadata") {
        if meta.is_object() {
            body["metadata"] = meta.clone();
        }
    }

    let data = supabase_call(
        "insert",
        json!({
            "access_token": access_token,
            "table": "bookkeeper_entries",
            "body": body
        }),
    )?;

    let entry = data
        .as_array()
        .and_then(|a| a.first())
        .cloned()
        .unwrap_or(Value::Null);

    Ok(json!({ "entry": entry }).to_string())
}

fn handle_update_entry(parsed: &Value) -> Result<String, String> {
    let access_token = parsed
        .get("access_token")
        .and_then(|v| v.as_str())
        .ok_or("Missing required 'access_token'")?;
    let entry_id = parsed
        .get("entry_id")
        .and_then(|v| v.as_str())
        .ok_or("Missing required 'entry_id'")?;

    let _user = fetch_user(access_token)?;

    let mut body = json!({});

    if let Some(title) = parsed.get("title").and_then(|v| v.as_str()) {
        body["title"] = json!(title);
    }
    if let Some(content) = parsed.get("content").and_then(|v| v.as_str()) {
        body["content"] = json!(content);
    }
    if let Some(tags) = parsed.get("tags") {
        if tags.is_array() {
            body["tags"] = tags.clone();
        }
    }
    if let Some(metadata) = parsed.get("metadata") {
        if metadata.is_object() {
            body["metadata"] = metadata.clone();
        }
    }

    let data = supabase_call(
        "update",
        json!({
            "access_token": access_token,
            "table": "bookkeeper_entries",
            "body": body,
            "filters": [
                {"column": "id", "op": "eq", "value": entry_id}
            ]
        }),
    )?;

    let entry = data
        .as_array()
        .and_then(|a| a.first())
        .cloned()
        .unwrap_or(Value::Null);

    Ok(json!({ "entry": entry }).to_string())
}

fn handle_delete_entry(parsed: &Value) -> Result<String, String> {
    let access_token = parsed
        .get("access_token")
        .and_then(|v| v.as_str())
        .ok_or("Missing required 'access_token'")?;
    let entry_id = parsed
        .get("entry_id")
        .and_then(|v| v.as_str())
        .ok_or("Missing required 'entry_id'")?;

    let _user = fetch_user(access_token)?;

    supabase_call(
        "delete",
        json!({
            "access_token": access_token,
            "table": "bookkeeper_entries",
            "filters": [
                {"column": "id", "op": "eq", "value": entry_id}
            ]
        }),
    )?;

    Ok(json!({ "deleted": true }).to_string())
}

// ---------------------------------------------------------------------------
// Persistence actions (insert_message, create_operation, update_operation)
// ---------------------------------------------------------------------------

fn handle_insert_message(parsed: &Value) -> Result<String, String> {
    let access_token = parsed
        .get("access_token")
        .and_then(|v| v.as_str())
        .ok_or("Missing required 'access_token'")?;
    let sit_down_id = parsed
        .get("sit_down_id")
        .and_then(|v| v.as_str())
        .ok_or("Missing required 'sit_down_id'")?;
    let member_id = parsed
        .get("member_id")
        .and_then(|v| v.as_str())
        .ok_or("Missing required 'member_id'")?;
    let content = parsed
        .get("content")
        .and_then(|v| v.as_str())
        .ok_or("Missing required 'content'")?;
    let metadata = parsed
        .get("metadata")
        .cloned()
        .unwrap_or(json!({}));

    let message_id = insert_ai_message(sit_down_id, member_id, content, &metadata, access_token)?;

    Ok(json!({ "message_id": message_id }).to_string())
}

fn handle_create_operation(parsed: &Value) -> Result<String, String> {
    let access_token = parsed
        .get("access_token")
        .and_then(|v| v.as_str())
        .ok_or("Missing required 'access_token'")?;
    let member_id = parsed
        .get("member_id")
        .and_then(|v| v.as_str())
        .ok_or("Missing required 'member_id'")?;
    let owner_id = parsed
        .get("owner_id")
        .and_then(|v| v.as_str())
        .ok_or("Missing required 'owner_id'")?;

    let mut body = json!({
        "member_id": member_id,
        "owner_id": owner_id,
        "status": "running"
    });

    if let Some(sid) = parsed.get("sit_down_id").and_then(|v| v.as_str()) {
        body["sit_down_id"] = json!(sid);
    }
    if let Some(ts) = parsed.get("task_summary").and_then(|v| v.as_str()) {
        body["task_summary"] = json!(ts);
    }
    if let Some(cj) = parsed.get("cron_job_id").and_then(|v| v.as_str()) {
        body["cron_job_id"] = json!(cj);
    }

    let data = supabase_call(
        "insert",
        json!({
            "access_token": access_token,
            "table": "operations",
            "body": body
        }),
    )?;

    let operation_id = data
        .as_array()
        .and_then(|a| a.first())
        .and_then(|row| row.get("id"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    Ok(json!({ "operation_id": operation_id }).to_string())
}

fn handle_update_operation(parsed: &Value) -> Result<String, String> {
    let access_token = parsed
        .get("access_token")
        .and_then(|v| v.as_str())
        .ok_or("Missing required 'access_token'")?;
    let operation_id = parsed
        .get("operation_id")
        .and_then(|v| v.as_str())
        .ok_or("Missing required 'operation_id'")?;

    let mut body = json!({});

    if let Some(status) = parsed.get("status").and_then(|v| v.as_str()) {
        body["status"] = json!(status);
    }
    if let Some(rc) = parsed.get("result_content").and_then(|v| v.as_str()) {
        body["result_content"] = json!(rc);
    }
    if let Some(tu) = parsed.get("turns_used").and_then(|v| v.as_u64()) {
        body["turns_used"] = json!(tu);
    }
    if let Some(tc) = parsed.get("tool_calls").and_then(|v| v.as_u64()) {
        body["tool_calls"] = json!(tc);
    }
    if let Some(usage) = parsed.get("usage") {
        if usage.is_object() {
            body["usage"] = usage.clone();
        }
    }

    supabase_call(
        "update",
        json!({
            "access_token": access_token,
            "table": "operations",
            "body": body,
            "filters": [
                {"column": "id", "op": "eq", "value": operation_id}
            ]
        }),
    )?;

    Ok(json!({ "updated": true }).to_string())
}

// ---------------------------------------------------------------------------
// Entry search (used by respond action)
// ---------------------------------------------------------------------------

fn search_entries(bookkeeper_id: &str, owner_id: &str, query: &str, access_token: &str) -> Value {
    supabase_call(
        "db.rpc",
        json!({
            "function": "search_bookkeeper_entries",
            "body": {
                "p_bookkeeper_id": bookkeeper_id,
                "p_owner_id": owner_id,
                "p_query": query
            },
            "access_token": access_token
        }),
    ).unwrap_or(json!([]))
}

// ---------------------------------------------------------------------------
// Helpers
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

fn invoke_catalyst(catalyst_ref: &str, catalyst_input: &Value) -> Result<Value, String> {
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

fn truncate_json(val: &Value, max: usize) -> String {
    let s = val.to_string();
    if s.len() <= max { s } else { format!("{}…", &s[..max]) }
}

fn emit_native_tool_events(
    data: &Value,
    catalyst_ref: &str,
    sit_down_id: &str,
    member_id: &str,
    member_name: &str,
    access_token: &str,
) {
    let lower = catalyst_ref.to_lowercase();

    if lower.contains("claude") {
        if let Some(content) = data.get("content").and_then(|v| v.as_array()) {
            for block in content {
                let btype = block.get("type").and_then(|v| v.as_str()).unwrap_or("");
                if btype == "server_tool_use" {
                    let tool = block.get("name").and_then(|v| v.as_str()).unwrap_or("tool");
                    let input = block.get("input").unwrap_or(&Value::Null);
                    emit_event(sit_down_id, member_id, member_name, json!({
                        "kind": "tool_use", "turn": 1,
                        "tool": tool, "tool_call_id": block.get("id").and_then(|v| v.as_str()).unwrap_or(""),
                        "input": truncate_json(input, 500)
                    }), access_token);
                } else if btype == "web_search_tool_result" {
                    let tool = "web_search";
                    let mut preview = String::new();
                    if let Some(results) = block.get("content").and_then(|v| v.as_array()) {
                        for r in results.iter().take(3) {
                            if let Some(title) = r.get("title").and_then(|v| v.as_str()) {
                                if !preview.is_empty() { preview.push_str("; "); }
                                preview.push_str(title);
                            }
                        }
                    }
                    emit_event(sit_down_id, member_id, member_name, json!({
                        "kind": "tool_result", "turn": 1,
                        "tool": tool, "tool_call_id": block.get("id").and_then(|v| v.as_str()).unwrap_or(""),
                        "preview": if preview.is_empty() { "search completed".to_string() } else { preview }
                    }), access_token);
                }
            }
        }
    } else if lower.contains("openai") || lower.contains("grok") {
        if let Some(output) = data.get("output").and_then(|v| v.as_array()) {
            for item in output {
                let itype = item.get("type").and_then(|v| v.as_str()).unwrap_or("");
                if itype == "web_search_call" || itype == "x_search_call" {
                    let tool = itype.trim_end_matches("_call");
                    let id = item.get("id").and_then(|v| v.as_str()).unwrap_or("");
                    emit_event(sit_down_id, member_id, member_name, json!({
                        "kind": "tool_use", "turn": 1, "tool": tool, "tool_call_id": id,
                        "input": item.get("query").and_then(|v| v.as_str()).unwrap_or("").to_string()
                    }), access_token);
                    emit_event(sit_down_id, member_id, member_name, json!({
                        "kind": "tool_result", "turn": 1, "tool": tool, "tool_call_id": id,
                        "preview": "search completed"
                    }), access_token);
                }
            }
        }
    } else if lower.contains("gemini") {
        if let Some(parts) = data
            .get("candidates").and_then(|v| v.as_array()).and_then(|a| a.first())
            .and_then(|c| c.get("content")).and_then(|c| c.get("parts")).and_then(|v| v.as_array())
        {
            for part in parts {
                if let Some(fc) = part.get("functionCall") {
                    let tool = fc.get("name").and_then(|v| v.as_str()).unwrap_or("tool");
                    let args = fc.get("args").unwrap_or(&Value::Null);
                    emit_event(sit_down_id, member_id, member_name, json!({
                        "kind": "tool_use", "turn": 1, "tool": tool,
                        "input": truncate_json(args, 500)
                    }), access_token);
                } else if let Some(fr) = part.get("functionResponse") {
                    let tool = fr.get("name").and_then(|v| v.as_str()).unwrap_or("tool");
                    let response = fr.get("response").unwrap_or(&Value::Null);
                    emit_event(sit_down_id, member_id, member_name, json!({
                        "kind": "tool_result", "turn": 1, "tool": tool,
                        "preview": truncate_json(response, 300)
                    }), access_token);
                }
            }
        }
    }
}

fn extract_provider_label(catalyst_ref: &str) -> &'static str {
    let lower = catalyst_ref.to_lowercase();
    if lower.contains("claude") { "Claude" }
    else if lower.contains("openai") { "OpenAI" }
    else if lower.contains("gemini") { "Gemini" }
    else if lower.contains("grok") { "Grok" }
    else if lower.contains("openrouter") { "OpenRouter" }
    else { "AI" }
}

fn extract_content(data: &Value, catalyst_ref: &str) -> String {
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

fn build_provider_request(
    catalyst_ref: &str,
    model: &str,
    messages: &[Value],
    system: &str,
) -> Value {
    let lower = catalyst_ref.to_lowercase();

    if lower.contains("claude") {
        json!({
            "operation": "messages.create",
            "params": {
                "model": model,
                "system": system,
                "messages": messages,
                "max_tokens": 4096
            }
        })
    } else if lower.contains("grok") {
        json!({
            "operation": "responses.create",
            "params": {
                "model": model,
                "instructions": system,
                "input": messages,
                "max_output_tokens": 4096
            }
        })
    } else if lower.contains("openrouter") {
        let mut all_messages = vec![json!({"role": "system", "content": system})];
        all_messages.extend_from_slice(messages);
        json!({
            "operation": "chat.completions.create",
            "params": {
                "model": model,
                "messages": all_messages,
                "max_tokens": 4096
            }
        })
    } else if lower.contains("openai") {
        json!({
            "operation": "responses.create",
            "params": {
                "model": model,
                "instructions": system,
                "input": messages,
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
                "generationConfig": { "maxOutputTokens": 4096 }
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

fn extract_usage(data: &Value) -> Value {
    if let Some(usage) = data.get("usage") {
        return json!({
            "input_tokens": usage.get("input_tokens").and_then(|v| v.as_u64()).unwrap_or(0),
            "output_tokens": usage.get("output_tokens").and_then(|v| v.as_u64()).unwrap_or(0)
        });
    }
    Value::Null
}

fn insert_ai_message(
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

fn get_last_user_message(conversation: &[Value]) -> String {
    conversation
        .iter()
        .rev()
        .find(|msg| msg.get("role").and_then(|v| v.as_str()) == Some("user"))
        .and_then(|msg| msg.get("content").and_then(|v| v.as_str()))
        .unwrap_or("")
        .to_string()
}

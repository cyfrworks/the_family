#[allow(warnings)]
mod bindings;
mod helpers;
mod tools;

use bindings::exports::cyfr::formula::run::Guest;
use bindings::cyfr::formula::invoke;

use serde_json::{json, Value};
use std::collections::HashSet;

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

const MAX_TOOL_ROUNDS: usize = 20;

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
// Respond action — tool-assisted single-turn
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
    let owner_id = member.get("owner_id").and_then(|v| v.as_str()).unwrap_or("");

    if member_id.is_empty() {
        return Err("Missing required 'member_id' — cannot scope data access".to_string());
    }
    if owner_id.is_empty() {
        return Err("Missing required 'member.owner_id' — cannot scope data access".to_string());
    }
    if access_token.is_empty() {
        return Err("Missing required 'access_token'".to_string());
    }

    // 1. Fetch bookkeeper context (entry count + common tags)
    emit_event(sit_down_id, member_id, member_name, json!({"kind": "status", "text": "Reviewing records..."}), access_token);

    let entries_meta = helpers::supabase_call(
        "db.select",
        json!({
            "access_token": access_token,
            "table": "bookkeeper_entries",
            "select": "id,tags",
            "filters": [
                {"column": "bookkeeper_id", "op": "eq", "value": member_id},
                {"column": "owner_id", "op": "eq", "value": owner_id}
            ],
            "limit": 500
        }),
    )
    .unwrap_or(json!([]));

    let entries_arr = entries_meta.as_array().cloned().unwrap_or_default();
    let entry_count = entries_arr.len();
    let common_tags = extract_unique_tags(&entries_arr);

    // 2. Build enriched system prompt
    let enriched_system = build_bookkeeper_system(member_name, entry_count, &common_tags, system);

    // 3. Build tool definitions
    let tools_for_llm = tools::build_tool_definitions(catalyst_ref);

    // 4. Mini tool loop (max 3 rounds)
    let mut messages = conversation;
    let mut total_input_tokens: u64 = 0;
    let mut total_output_tokens: u64 = 0;
    let mut final_content = String::new();
    let mut tool_call_count: usize = 0;

    for round in 0..MAX_TOOL_ROUNDS {
        let turn = (round + 1) as u64;
        let provider_label = extract_provider_label(catalyst_ref);
        emit_event(sit_down_id, member_id, member_name, json!({"kind": "status", "text": format!("Calling {}...", provider_label)}), access_token);
        emit_event(sit_down_id, member_id, member_name, json!({"kind": "turn_start", "turn": turn}), access_token);

        let catalyst_input = tools::build_provider_request_with_tools(
            catalyst_ref, model, &messages, &enriched_system, &tools_for_llm, 4096,
        );

        let data = helpers::invoke_catalyst(catalyst_ref, &catalyst_input)?;

        // Track usage
        if let Some(usage) = data.get("usage") {
            total_input_tokens += usage.get("input_tokens").and_then(|v| v.as_u64()).unwrap_or(0);
            total_output_tokens += usage.get("output_tokens").and_then(|v| v.as_u64()).unwrap_or(0);
        }
        emit_event(sit_down_id, member_id, member_name, json!({
            "kind": "usage", "turn": turn,
            "input_tokens": total_input_tokens, "output_tokens": total_output_tokens
        }), access_token);

        // Check for tool calls
        if tools::has_tool_calls(&data, catalyst_ref) {
            let assistant_msg = tools::build_assistant_message(&data, catalyst_ref);
            messages.push(assistant_msg);

            let tool_calls = tools::extract_tool_calls(&data, catalyst_ref);

            // Emit tool_use events
            for tc in &tool_calls {
                emit_event(sit_down_id, member_id, member_name, json!({
                    "kind": "tool_use", "turn": turn,
                    "tool": tc.name, "tool_call_id": tc.id,
                    "input": truncate_json(&tc.arguments, 500)
                }), access_token);
            }

            // Execute tools sequentially
            let results = tools::execute_bookkeeper_tools(
                &tool_calls, member_id, owner_id, access_token,
            );
            tool_call_count += tool_calls.len();

            // Emit tool_result events
            for (id, name, result_str) in &results {
                let preview = if result_str.len() > 300 { &result_str[..300] } else { result_str };
                emit_event(sit_down_id, member_id, member_name, json!({
                    "kind": "tool_result", "turn": turn,
                    "tool": name, "tool_call_id": id,
                    "preview": preview
                }), access_token);
            }

            // Add tool results to conversation
            let tool_results_msg = tools::build_tool_results_message(&results, catalyst_ref);
            let lower = catalyst_ref.to_lowercase();
            if lower.contains("openai") || lower.contains("grok") || lower.contains("openrouter") {
                if let Some(msgs) = tool_results_msg.as_array() {
                    for msg in msgs {
                        messages.push(msg.clone());
                    }
                } else {
                    messages.push(tool_results_msg);
                }
            } else {
                messages.push(tool_results_msg);
            }

            // Capture any text from this turn (LLM may emit text alongside tool calls)
            let turn_text = tools::extract_text(&data, catalyst_ref);
            if !turn_text.is_empty() {
                emit_event(sit_down_id, member_id, member_name, json!({
                    "kind": "text_delta", "turn": turn, "content": turn_text
                }), access_token);
            }

            continue;
        }

        // No tool calls — extract final text
        final_content = tools::extract_text(&data, catalyst_ref);
        if !final_content.is_empty() {
            emit_event(sit_down_id, member_id, member_name, json!({
                "kind": "text_delta", "content": final_content, "turn": turn
            }), access_token);
        }
        break;
    }

    if final_content.is_empty() {
        return Err("Empty response from AI provider".to_string());
    }

    Ok(json!({
        "content": final_content,
        "usage": {
            "input_tokens": total_input_tokens,
            "output_tokens": total_output_tokens
        },
        "entries_used": tool_call_count
    })
    .to_string())
}

// ---------------------------------------------------------------------------
// Bookkeeper system prompt builder
// ---------------------------------------------------------------------------

fn build_bookkeeper_system(member_name: &str, entry_count: usize, common_tags: &[String], base_system: &str) -> String {
    let mut system = format!(
        "You are {member_name}, a Bookkeeper in the Family. You maintain and retrieve knowledge entries.\n\n\
         You have tools to search, list, read, create, update, and delete entries, as well as manage files.\n\
         Use your tools when you need to look up or modify data. For simple greetings or general questions, \
         respond directly without tools.\n\n\
         When saving or updating entries, prefer markdown formatting (headings, lists, tables, code blocks) \
         to preserve structure. This makes entries more useful when retrieved later.\n\n\
         STORAGE GUIDELINES:\n\
         - Entries (DB): searchable knowledge — facts, notes, analyses, summaries, anything you would want to find later by keyword or tag.\n\
         - Files (Storage): large or structured artifacts — full reports, CSVs, code, configs, data exports. Things meant to be downloaded or referenced as a whole document.\n\n"
    );

    if entry_count > 0 {
        system.push_str(&format!("DATA SUMMARY: You currently have {entry_count} entries stored."));
        if !common_tags.is_empty() {
            let tags_display: Vec<&str> = common_tags.iter().take(20).map(|s| s.as_str()).collect();
            system.push_str(&format!(" Common tags: {}", tags_display.join(", ")));
        }
        system.push_str("\n\n");
    } else {
        system.push_str("DATA SUMMARY: No entries stored yet.\n\n");
    }

    system.push_str("---\n\n");
    system.push_str(base_system);

    system
}

fn extract_unique_tags(entries: &[Value]) -> Vec<String> {
    let mut tags_set = HashSet::new();
    for entry in entries {
        if let Some(tags) = entry.get("tags").and_then(|v| v.as_array()) {
            for tag in tags {
                if let Some(t) = tag.as_str() {
                    tags_set.insert(t.to_string());
                }
            }
        }
    }
    let mut tags: Vec<String> = tags_set.into_iter().collect();
    tags.sort();
    tags
}

// ---------------------------------------------------------------------------
// CRUD actions (unchanged — called directly by caporegimes)
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

    let user = helpers::fetch_user(access_token)?;
    let user_id = user
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or("Could not get user ID")?;

    let data = helpers::supabase_call(
        "db.select",
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

    let user = helpers::fetch_user(access_token)?;
    let user_id = user
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or("Could not get user ID")?;

    let data = helpers::supabase_call(
        "db.rpc",
        json!({
            "access_token": access_token,
            "function": "search_bookkeeper_entries",
            "body": {
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
    let bookkeeper_id = parsed
        .get("bookkeeper_id")
        .and_then(|v| v.as_str())
        .ok_or("Missing required 'bookkeeper_id'")?;

    let user = helpers::fetch_user(access_token)?;
    let user_id = user
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or("Could not get user ID")?;

    let data = helpers::supabase_call(
        "db.select",
        json!({
            "access_token": access_token,
            "table": "bookkeeper_entries",
            "select": "*",
            "filters": [
                {"column": "id", "op": "eq", "value": entry_id},
                {"column": "bookkeeper_id", "op": "eq", "value": bookkeeper_id},
                {"column": "owner_id", "op": "eq", "value": user_id}
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

    let user = helpers::fetch_user(access_token)?;
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

    let data = helpers::supabase_call(
        "db.insert",
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

    let _user = helpers::fetch_user(access_token)?;

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

    let data = helpers::supabase_call(
        "db.update",
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

    let _user = helpers::fetch_user(access_token)?;

    helpers::supabase_call(
        "db.delete",
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

    let message_id = helpers::insert_ai_message(sit_down_id, member_id, content, &metadata, access_token)?;

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

    let data = helpers::supabase_call(
        "db.insert",
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

    helpers::supabase_call(
        "db.update",
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
// Helpers
// ---------------------------------------------------------------------------

fn truncate_json(val: &Value, max: usize) -> String {
    let s = val.to_string();
    if s.len() <= max { s } else { format!("{}…", &s[..max]) }
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

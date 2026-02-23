#[allow(warnings)]
mod bindings;

use bindings::exports::cyfr::formula::run::Guest;
use bindings::cyfr::formula::invoke;
use bindings::cyfr::mcp::tools;

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
const MAX_CONTEXT_MESSAGES: usize = 50;

// ---------------------------------------------------------------------------
// Request handling
// ---------------------------------------------------------------------------

fn handle_request(input: &str) -> Result<String, String> {
    let parsed: Value =
        serde_json::from_str(input).map_err(|e| format!("Invalid JSON input: {e}"))?;

    let member_id = parsed
        .get("member_id")
        .and_then(|v| v.as_str())
        .ok_or("Missing required 'member_id'")?;

    let sit_down_id = parsed
        .get("sit_down_id")
        .and_then(|v| v.as_str())
        .ok_or("Missing required 'sit_down_id'")?;

    let reply_to_id = parsed.get("reply_to_id").and_then(|v| v.as_str());

    let access_token = parsed
        .get("access_token")
        .and_then(|v| v.as_str())
        .ok_or("Missing required 'access_token'")?;

    // 1. Fetch all required data from Supabase
    let user = fetch_user(access_token)?;
    let user_id = user
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or("Could not determine user ID from token")?;
    let member = fetch_member(member_id, access_token)?;
    let sit_down = fetch_sit_down(sit_down_id, access_token)?;
    let participants = fetch_participants(sit_down_id, access_token)?;
    let messages = fetch_messages(sit_down_id, access_token)?;

    // 2. Extract provider/model from member's catalog_model
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

    // 3. Insert typing indicator
    insert_typing_indicator(sit_down_id, member_id, member_name, user_id, access_token);

    // 4. Build system prompt
    let system_prompt = build_system_prompt(&member, &sit_down, &participants);

    // 5. Build conversation history
    let conversation = build_conversation_history(member_id, &messages, &sit_down, &participants);

    // 6. Discover and invoke AI catalyst
    let ai_result = invoke_ai_provider(provider, model, &system_prompt, &conversation);

    // 7. Always clean up typing indicator
    delete_typing_indicator(sit_down_id, member_id, access_token);

    let content = ai_result?;

    // 8. Insert AI response via RPC
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
    );

    // Extract message_id from RPC result if available
    let message_id = rpc_result
        .as_ref()
        .ok()
        .and_then(|v| v.as_str())
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
// Supabase data fetching
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

fn fetch_member(member_id: &str, access_token: &str) -> Result<Value, String> {
    let data = supabase_call(
        "db.select",
        json!({
            "table": "members",
            "select": "id,name,owner_id,system_prompt,catalog_model:model_catalog(id,provider,model,alias)",
            "filters": [
                { "column": "id", "op": "eq", "value": member_id }
            ],
            "limit": 1,
            "access_token": access_token
        }),
    )?;

    data.as_array()
        .and_then(|arr| arr.first().cloned())
        .ok_or_else(|| format!("Member '{member_id}' not found"))
}

fn fetch_sit_down(sit_down_id: &str, access_token: &str) -> Result<Value, String> {
    let data = supabase_call(
        "db.select",
        json!({
            "table": "sit_downs",
            "select": "id,name,is_commission",
            "filters": [
                { "column": "id", "op": "eq", "value": sit_down_id }
            ],
            "limit": 1,
            "access_token": access_token
        }),
    )?;

    data.as_array()
        .and_then(|arr| arr.first().cloned())
        .ok_or_else(|| format!("Sit-down '{sit_down_id}' not found"))
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

fn fetch_messages(sit_down_id: &str, access_token: &str) -> Result<Value, String> {
    supabase_call(
        "db.select",
        json!({
            "table": "messages",
            "select": "id,content,sender_type,sender_user_id,sender_member_id,created_at,profile:profiles(display_name),member:members(id,name,owner_id)",
            "filters": [
                { "column": "sit_down_id", "op": "eq", "value": sit_down_id }
            ],
            "order": [{ "column": "created_at", "direction": "asc" }],
            "limit": MAX_CONTEXT_MESSAGES,
            "access_token": access_token
        }),
    )
}

// ---------------------------------------------------------------------------
// Typing indicator management
// ---------------------------------------------------------------------------

fn insert_typing_indicator(sit_down_id: &str, member_id: &str, member_name: &str, user_id: &str, access_token: &str) {
    // Delete any existing indicator first (best effort)
    let _ = supabase_call(
        "db.delete",
        json!({
            "table": "typing_indicators",
            "filters": [
                { "column": "sit_down_id", "op": "eq", "value": sit_down_id },
                { "column": "member_id", "op": "eq", "value": member_id }
            ],
            "access_token": access_token
        }),
    );

    let _ = supabase_call(
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

fn delete_typing_indicator(sit_down_id: &str, member_id: &str, access_token: &str) {
    let _ = supabase_call(
        "db.delete",
        json!({
            "table": "typing_indicators",
            "filters": [
                { "column": "sit_down_id", "op": "eq", "value": sit_down_id },
                { "column": "member_id", "op": "eq", "value": member_id }
            ],
            "access_token": access_token
        }),
    );
}

// ---------------------------------------------------------------------------
// System prompt construction
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
         When multiple roles are addressed in the same message, focus on the instructions directed at you."
    );

    let participants_arr = participants.as_array();

    // Extract Dons from participants (entries with user_id and profile)
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

    // Extract all member participants
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
        // Commission sit-down: ownership + who's at the table
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
        // Personal sit-down: simple ownership line
        let don_name = dons[0].1;
        preamble.push_str(&format!(
            " You report to Don {don_name}. Always address them as \"Don {don_name}\"."
        ));
    }

    format!("{preamble}\n\n{custom_prompt}")
}

// ---------------------------------------------------------------------------
// Conversation history construction
// ---------------------------------------------------------------------------

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

    // Build set of duplicate member names for disambiguation
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

    // Build Don lookup for disambiguation
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

    // Take last MAX_CONTEXT_MESSAGES (messages are already ordered asc, limited)
    let recent: Vec<&Value> = msgs.iter().rev().take(MAX_CONTEXT_MESSAGES).collect::<Vec<_>>().into_iter().rev().collect();

    let mut history: Vec<Value> = recent
        .iter()
        .map(|msg| {
            let sender_type = msg.get("sender_type").and_then(|v| v.as_str()).unwrap_or("");
            let sender_member_id = msg.get("sender_member_id").and_then(|v| v.as_str()).unwrap_or("");
            let content = msg.get("content").and_then(|v| v.as_str()).unwrap_or("");

            if sender_type == "member" && sender_member_id == member_id {
                // This member's own messages -> assistant role
                json!({ "role": "assistant", "content": content })
            } else if sender_type == "don" {
                let name = msg
                    .get("profile")
                    .and_then(|v| v.get("display_name"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("Don");
                json!({ "role": "user", "content": format!("[Don {name}]: {content}") })
            } else {
                // Other member's messages -> user role with name prefix
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

    // The API needs the last message to be "user" to generate a response.
    // If it's our own previous message, flip it.
    if let Some(last) = history.last() {
        if last.get("role").and_then(|v| v.as_str()) == Some("assistant") {
            let content = last.get("content").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let len = history.len();
            history[len - 1] = json!({ "role": "user", "content": content });
        }
    }

    history
}

// ---------------------------------------------------------------------------
// AI provider discovery and invocation
// ---------------------------------------------------------------------------

fn discover_provider_catalyst(provider: &str) -> Result<(String, String), String> {
    let search_request = json!({
        "tool": "component",
        "action": "search",
        "args": {
            "query": provider,
            "type": "catalyst"
        }
    });

    let search_response_str = tools::call(&search_request.to_string());

    let search_response: Value = serde_json::from_str(&search_response_str)
        .map_err(|e| format!("Failed to parse MCP search response: {e}"))?;

    if let Some(err) = search_response.get("error") {
        return Err(format!("MCP search error: {err}"));
    }

    let result = search_response
        .get("result")
        .ok_or("MCP search returned no result")?;

    let components = result
        .get("components")
        .and_then(|v| v.as_array())
        .ok_or("MCP search result missing 'components' array")?;

    let catalyst = components
        .iter()
        .find(|c| {
            c.get("name")
                .and_then(|v| v.as_str())
                .map(|n| n.eq_ignore_ascii_case(provider))
                .unwrap_or(false)
        })
        .ok_or_else(|| format!("No catalyst found for provider '{provider}'"))?;

    let name = catalyst
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown")
        .to_string();
    let version = catalyst
        .get("version")
        .and_then(|v| v.as_str())
        .unwrap_or("0.2.0")
        .to_string();
    let publisher = catalyst
        .get("publisher")
        .and_then(|v| v.as_str())
        .unwrap_or("local")
        .to_string();

    let component_ref = format!("catalyst:{publisher}.{name}:{version}");
    Ok((component_ref, name))
}

fn invoke_ai_provider(
    provider: &str,
    model: &str,
    system: &str,
    messages: &[Value],
) -> Result<String, String> {
    let (component_ref, catalyst_name) = discover_provider_catalyst(provider)?;

    let catalyst_input = build_provider_request(&catalyst_name, model, messages, system);

    let invoke_request = json!({
        "reference": { "registry": &component_ref },
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

// ---------------------------------------------------------------------------
// Provider-specific request building
// ---------------------------------------------------------------------------

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
        // Generic fallback
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

// ---------------------------------------------------------------------------
// Response text extraction
// ---------------------------------------------------------------------------

fn extract_content(data: &Value, catalyst_name: &str) -> String {
    // Streaming combined_text
    if let Some(text) = data.get("combined_text").and_then(|v| v.as_str()) {
        return text.to_string();
    }

    let lower = catalyst_name.to_lowercase();

    if lower.contains("claude") {
        // Claude: content[].text where type == "text"
        if let Some(content) = data.get("content").and_then(|v| v.as_array()) {
            return content
                .iter()
                .filter(|c| c.get("type").and_then(|v| v.as_str()) == Some("text"))
                .filter_map(|c| c.get("text").and_then(|v| v.as_str()))
                .collect::<Vec<_>>()
                .join("");
        }
    } else if lower.contains("openai") {
        // OpenAI responses API: output[].content[].text where type == "output_text"
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
        // OpenAI chat completions fallback: choices[0].message.content
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
        // Gemini: candidates[0].content.parts[].text
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

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

fn handle_request(input: &str) -> Result<String, String> {
    let parsed: Value =
        serde_json::from_str(input).map_err(|e| format!("Invalid JSON input: {e}"))?;

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

    let sit_down_id = parsed.get("sit_down_id").and_then(|v| v.as_str()).unwrap_or("");
    let member_id = parsed.get("member_id").and_then(|v| v.as_str()).unwrap_or("");
    let access_token = parsed.get("access_token").and_then(|v| v.as_str()).unwrap_or("");
    let member = parsed.get("member").cloned().unwrap_or(Value::Null);
    let member_name = member.get("name").and_then(|v| v.as_str()).unwrap_or("Consul");

    let provider_label = extract_provider_label(catalyst_ref);
    emit_event(sit_down_id, member_id, member_name, json!({"kind": "status", "text": format!("Calling {}...", provider_label)}), access_token);
    emit_event(sit_down_id, member_id, member_name, json!({"kind": "turn_start", "turn": 1}), access_token);

    let catalyst_input = build_provider_request(catalyst_ref, model, &conversation, system);
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
        "usage": usage
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
// Provider helpers
// ---------------------------------------------------------------------------

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
                "max_tokens": 4096,
                "tools": [
                    { "type": "web_search_20250305", "name": "web_search", "max_uses": 3 },
                    { "type": "web_fetch_20250910", "name": "web_fetch", "max_uses": 5, "citations": { "enabled": true } }
                ]
            }
        })
    } else if lower.contains("grok") {
        json!({
            "operation": "responses.create",
            "params": {
                "model": model,
                "instructions": system,
                "input": messages,
                "tools": [{ "type": "web_search" }, { "type": "x_search" }],
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
                "max_tokens": 4096,
                "plugins": [{ "id": "web" }]
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

fn extract_usage(data: &Value) -> Value {
    if let Some(usage) = data.get("usage") {
        return json!({
            "input_tokens": usage.get("input_tokens").and_then(|v| v.as_u64()).unwrap_or(0),
            "output_tokens": usage.get("output_tokens").and_then(|v| v.as_u64()).unwrap_or(0)
        });
    }
    Value::Null
}


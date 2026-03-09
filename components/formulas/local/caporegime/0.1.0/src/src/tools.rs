use std::collections::HashMap;
use serde_json::{json, Value};

use crate::bindings::cyfr::formula::invoke;

const MAX_TOOL_RESULT_CHARS: usize = 32000;

// ---------------------------------------------------------------------------
// Dynamic MCP tool discovery
// ---------------------------------------------------------------------------

fn discover_mcp_tools() -> Vec<Value> {
    let request = json!({"tool": "tools", "action": "list", "args": {}});
    let response_str = invoke::call(&request.to_string());
    let response: Value = serde_json::from_str(&response_str).unwrap_or(json!({}));

    let tools = response
        .get("output")
        .and_then(|o| o.get("tools"))
        .and_then(|t| t.as_array())
        .cloned()
        .unwrap_or_default();

    tools
        .into_iter()
        .filter(|t| {
            t.get("name").and_then(|v| v.as_str()) != Some("tools")
        })
        .collect()
}

// ---------------------------------------------------------------------------
// Build tool definitions for provider
// ---------------------------------------------------------------------------

pub fn build_tool_definitions(catalyst_ref: &str) -> Value {
    let mut tools: Vec<Value> = Vec::new();

    let mcp_tools = discover_mcp_tools();
    for t in &mcp_tools {
        let name = t.get("name").and_then(|v| v.as_str()).unwrap_or("");
        let description = t.get("description").and_then(|v| v.as_str()).unwrap_or("");
        let schema = t.get("inputSchema").cloned().unwrap_or(json!({"type": "object"}));

        if !name.is_empty() {
            tools.push(json!({
                "name": name,
                "description": description,
                "input_schema": schema
            }));
        }
    }

    let lower = catalyst_ref.to_lowercase();

    if lower.contains("openai") || lower.contains("grok") || lower.contains("openrouter") {
        let openai_tools: Vec<Value> = tools
            .iter()
            .map(|t| {
                json!({
                    "type": "function",
                    "function": {
                        "name": t["name"],
                        "description": t["description"],
                        "parameters": t["input_schema"]
                    }
                })
            })
            .collect();
        json!(openai_tools)
    } else if lower.contains("gemini") {
        let declarations: Vec<Value> = tools
            .iter()
            .map(|t| {
                json!({
                    "name": t["name"],
                    "description": t["description"],
                    "parameters": t["input_schema"]
                })
            })
            .collect();
        json!([{"functionDeclarations": declarations}])
    } else {
        json!(tools)
    }
}

// ---------------------------------------------------------------------------
// Tool call extraction (multi-provider)
// ---------------------------------------------------------------------------

pub struct ToolCall {
    pub id: String,
    pub name: String,
    pub arguments: Value,
}

pub fn has_tool_calls(data: &Value, catalyst_ref: &str) -> bool {
    let lower = catalyst_ref.to_lowercase();
    if lower.contains("claude") {
        data.get("stop_reason").and_then(|v| v.as_str()) == Some("tool_use")
    } else if lower.contains("openai") || lower.contains("grok") || lower.contains("openrouter") {
        if let Some(choices) = data.get("choices").and_then(|v| v.as_array()) {
            if let Some(first) = choices.first() {
                if first.get("finish_reason").and_then(|v| v.as_str()) == Some("tool_calls") {
                    return true;
                }
                if let Some(tc) = first.get("message").and_then(|m| m.get("tool_calls")).and_then(|v| v.as_array()) {
                    return !tc.is_empty();
                }
            }
        }
        false
    } else if lower.contains("gemini") {
        if let Some(candidates) = data.get("candidates").and_then(|v| v.as_array()) {
            if let Some(first) = candidates.first() {
                if let Some(parts) = first.get("content").and_then(|c| c.get("parts")).and_then(|v| v.as_array()) {
                    return parts.iter().any(|p| p.get("functionCall").is_some());
                }
            }
        }
        false
    } else {
        false
    }
}

pub fn extract_tool_calls(data: &Value, catalyst_ref: &str) -> Vec<ToolCall> {
    let lower = catalyst_ref.to_lowercase();

    if lower.contains("claude") {
        let content = data.get("content").and_then(|v| v.as_array()).cloned().unwrap_or_default();
        content
            .iter()
            .filter(|block| block.get("type").and_then(|v| v.as_str()) == Some("tool_use"))
            .map(|block| ToolCall {
                id: block.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                name: block.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                arguments: block.get("input").cloned().unwrap_or(json!({})),
            })
            .collect()
    } else if lower.contains("openai") || lower.contains("grok") || lower.contains("openrouter") {
        let mut calls = Vec::new();
        if let Some(choices) = data.get("choices").and_then(|v| v.as_array()) {
            if let Some(first) = choices.first() {
                if let Some(tcs) = first.get("message").and_then(|m| m.get("tool_calls")).and_then(|v| v.as_array()) {
                    for tc in tcs {
                        let id = tc.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
                        let name = tc.get("function").and_then(|f| f.get("name")).and_then(|v| v.as_str()).unwrap_or("").to_string();
                        let args_str = tc.get("function").and_then(|f| f.get("arguments")).and_then(|v| v.as_str()).unwrap_or("{}");
                        let arguments = serde_json::from_str(args_str).unwrap_or(json!({}));
                        calls.push(ToolCall { id, name, arguments });
                    }
                }
            }
        }
        calls
    } else if lower.contains("gemini") {
        let mut calls = Vec::new();
        if let Some(candidates) = data.get("candidates").and_then(|v| v.as_array()) {
            if let Some(first) = candidates.first() {
                if let Some(parts) = first.get("content").and_then(|c| c.get("parts")).and_then(|v| v.as_array()) {
                    for (i, part) in parts.iter().enumerate() {
                        if let Some(fc) = part.get("functionCall") {
                            let name = fc.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
                            let arguments = fc.get("args").cloned().unwrap_or(json!({}));
                            calls.push(ToolCall {
                                id: format!("gemini-{i}"),
                                name,
                                arguments,
                            });
                        }
                    }
                }
            }
        }
        calls
    } else {
        vec![]
    }
}

// ---------------------------------------------------------------------------
// Build assistant message for conversation history
// ---------------------------------------------------------------------------

pub fn build_assistant_message(data: &Value, catalyst_ref: &str) -> Value {
    let lower = catalyst_ref.to_lowercase();
    if lower.contains("claude") {
        let content = data.get("content").cloned().unwrap_or(json!([]));
        json!({"role": "assistant", "content": content})
    } else if lower.contains("openai") || lower.contains("grok") || lower.contains("openrouter") {
        if let Some(choices) = data.get("choices").and_then(|v| v.as_array()) {
            if let Some(first) = choices.first() {
                if let Some(msg) = first.get("message") {
                    return msg.clone();
                }
            }
        }
        json!({"role": "assistant", "content": ""})
    } else if lower.contains("gemini") {
        if let Some(candidates) = data.get("candidates").and_then(|v| v.as_array()) {
            if let Some(first) = candidates.first() {
                if let Some(content) = first.get("content") {
                    return content.clone();
                }
            }
        }
        json!({"role": "model", "parts": [{"text": ""}]})
    } else {
        json!({"role": "assistant", "content": ""})
    }
}

// ---------------------------------------------------------------------------
// Build tool results message for conversation history
// ---------------------------------------------------------------------------

pub fn build_tool_results_message(results: &[(String, String, String)], catalyst_ref: &str) -> Value {
    let lower = catalyst_ref.to_lowercase();

    if lower.contains("claude") {
        let blocks: Vec<Value> = results
            .iter()
            .map(|(id, _name, content)| {
                json!({
                    "type": "tool_result",
                    "tool_use_id": id,
                    "content": content
                })
            })
            .collect();
        json!({"role": "user", "content": blocks})
    } else if lower.contains("openai") || lower.contains("grok") || lower.contains("openrouter") {
        let msgs: Vec<Value> = results
            .iter()
            .map(|(id, _name, content)| {
                json!({
                    "role": "tool",
                    "tool_call_id": id,
                    "content": content
                })
            })
            .collect();
        json!(msgs)
    } else if lower.contains("gemini") {
        let parts: Vec<Value> = results
            .iter()
            .map(|(_id, name, content)| {
                json!({
                    "functionResponse": {
                        "name": name,
                        "response": { "result": content }
                    }
                })
            })
            .collect();
        json!({"role": "user", "parts": parts})
    } else {
        let blocks: Vec<Value> = results
            .iter()
            .map(|(id, _name, content)| {
                json!({"type": "tool_result", "tool_use_id": id, "content": content})
            })
            .collect();
        json!({"role": "user", "content": blocks})
    }
}

// ---------------------------------------------------------------------------
// Dispatch + parallel execution
// ---------------------------------------------------------------------------

fn dispatch_mcp_tool(tool_name: &str, args: &Value) -> String {
    let action = args.get("action").and_then(|v| v.as_str()).unwrap_or("");
    if action.is_empty() {
        return json!({"error": format!("Missing required 'action' field for tool '{}'", tool_name)}).to_string();
    }

    let remaining = if let Some(obj) = args.as_object() {
        let filtered: serde_json::Map<String, Value> = obj
            .iter()
            .filter(|(k, _)| k.as_str() != "action")
            .map(|(k, v)| (k.clone(), v.clone()))
            .collect();
        Value::Object(filtered)
    } else {
        json!({})
    };

    let request = json!({
        "tool": tool_name,
        "action": action,
        "args": remaining
    });

    let response_str = invoke::call(&request.to_string());
    let response: Value = serde_json::from_str(&response_str).unwrap_or(json!({}));
    if let Some(output) = response.get("output") {
        truncate_result(&serde_json::to_string_pretty(output).unwrap_or_default())
    } else if let Some(err) = response.get("error") {
        format!("Error: {}", err)
    } else {
        truncate_result(&response_str)
    }
}

pub fn execute_tools_parallel(
    tool_calls: &[(String, String, Value)],
) -> Vec<(String, String, String)> {
    if tool_calls.len() == 1 {
        let (id, name, args) = &tool_calls[0];
        let result = dispatch_mcp_tool(name, args);
        return vec![(id.clone(), name.clone(), result)];
    }

    let mut task_entries: Vec<(String, String, String)> = Vec::new();

    for (id, name, args) in tool_calls {
        let action = args.get("action").and_then(|v| v.as_str()).unwrap_or("");
        let remaining = if let Some(obj) = args.as_object() {
            let filtered: serde_json::Map<String, Value> = obj
                .iter()
                .filter(|(k, _)| k.as_str() != "action")
                .map(|(k, v)| (k.clone(), v.clone()))
                .collect();
            Value::Object(filtered)
        } else {
            json!({})
        };

        let request = json!({
            "tool": name,
            "action": action,
            "args": remaining
        });

        let spawn_str = invoke::spawn(&request.to_string());
        let spawn: Value = serde_json::from_str(&spawn_str).unwrap_or(json!({}));
        let task_id = spawn.get("task_id").and_then(|v| v.as_str()).unwrap_or("").to_string();
        task_entries.push((id.clone(), name.clone(), task_id));
    }

    let valid_ids: Vec<&str> = task_entries.iter()
        .filter(|(_, _, tid)| !tid.is_empty())
        .map(|(_, _, tid)| tid.as_str())
        .collect();

    if valid_ids.is_empty() {
        return task_entries.iter()
            .map(|(id, name, _)| (id.clone(), name.clone(), "Spawn failed".to_string()))
            .collect();
    }

    let await_req = json!({"task_ids": valid_ids});
    let await_str = invoke::await_all(&await_req.to_string());
    let await_resp: Value = serde_json::from_str(&await_str).unwrap_or(json!({}));

    let result_arr = await_resp.get("results").and_then(|v| v.as_array()).cloned().unwrap_or_default();
    let mut result_map: HashMap<String, String> = HashMap::new();
    for r in &result_arr {
        if let Some(tid) = r.get("task_id").and_then(|v| v.as_str()) {
            let status = r.get("status").and_then(|v| v.as_str()).unwrap_or("error");
            let output = if status == "completed" {
                extract_invoke_output(r)
            } else {
                format!("Error: {}", r.get("error").map(|e| e.to_string()).unwrap_or_default())
            };
            result_map.insert(tid.to_string(), output);
        }
    }

    task_entries.iter()
        .map(|(id, name, task_id)| {
            let result = if task_id.is_empty() {
                "Spawn failed".to_string()
            } else {
                result_map.get(task_id).cloned().unwrap_or("Spawn failed".to_string())
            };
            (id.clone(), name.clone(), result)
        })
        .collect()
}

fn extract_invoke_output(result: &Value) -> String {
    let output = result.get("output").cloned().unwrap_or(Value::Null);
    let parsed = if let Some(r) = output.get("result") {
        r.clone()
    } else {
        match &output {
            Value::String(s) => serde_json::from_str::<Value>(s).unwrap_or(output.clone()),
            _ => output,
        }
    };
    if let Some(err) = parsed.get("error") {
        return format!("Error: {}", err);
    }
    let formatted = if let Some(data) = parsed.get("data") {
        serde_json::to_string_pretty(data).unwrap_or_else(|_| data.to_string())
    } else {
        serde_json::to_string_pretty(&parsed).unwrap_or_else(|_| parsed.to_string())
    };
    truncate_result(&formatted)
}

fn truncate_result(s: &str) -> String {
    if s.len() <= MAX_TOOL_RESULT_CHARS {
        s.to_string()
    } else {
        let truncated = &s[..MAX_TOOL_RESULT_CHARS];
        format!("{}\n\n[... truncated, showing first {} chars of {} total]", truncated, MAX_TOOL_RESULT_CHARS, s.len())
    }
}

// ---------------------------------------------------------------------------
// Build provider-specific request WITH tools (for agentic loop)
// ---------------------------------------------------------------------------

pub fn build_provider_request_with_tools(
    catalyst_ref: &str,
    model: &str,
    messages: &[Value],
    system: &str,
    tools: &Value,
    max_tokens: u64,
) -> Value {
    let lower = catalyst_ref.to_lowercase();

    if lower.contains("claude") {
        let mut all_tools: Vec<Value> = tools.as_array().cloned().unwrap_or_default();
        all_tools.push(json!({"type": "web_search_20250305", "name": "web_search"}));
        json!({
            "operation": "messages.create",
            "params": {
                "model": model,
                "max_tokens": max_tokens,
                "messages": messages,
                "system": system,
                "tools": all_tools
            }
        })
    } else if lower.contains("openai") || lower.contains("grok") || lower.contains("openrouter") {
        let mut all_messages = vec![json!({"role": "system", "content": system})];
        all_messages.extend_from_slice(messages);
        let mut all_tools: Vec<Value> = tools.as_array().cloned().unwrap_or_default();
        if lower.contains("openai") && !lower.contains("openrouter") {
            all_tools.push(json!({"type": "web_search_preview"}));
        }
        json!({
            "operation": "chat.completions.create",
            "params": {
                "model": model,
                "messages": all_messages,
                "tools": all_tools
            }
        })
    } else if lower.contains("gemini") {
        let contents: Vec<Value> = messages
            .iter()
            .map(|msg| {
                let role = msg.get("role").and_then(|v| v.as_str()).unwrap_or("user");
                if let Some(parts) = msg.get("parts") {
                    return json!({
                        "role": if role == "assistant" { "model" } else { role },
                        "parts": parts
                    });
                }
                let text = msg.get("content").and_then(|v| v.as_str()).unwrap_or("");
                json!({
                    "role": if role == "assistant" { "model" } else { role },
                    "parts": [{"text": text}]
                })
            })
            .collect();

        let mut params = json!({
            "model": model,
            "contents": contents,
            "systemInstruction": {"parts": [{"text": system}]},
        });

        if let Some(arr) = tools.as_array() {
            if !arr.is_empty() {
                params["tools"] = tools.clone();
            }
        }

        json!({
            "operation": "content.generate",
            "params": params,
        })
    } else {
        json!({
            "operation": "chat.create",
            "params": {
                "model": model,
                "system": system,
                "messages": messages,
                "max_tokens": max_tokens,
                "tools": tools
            }
        })
    }
}

/// Extract text from response data (multi-provider, handles tool_use turns too)
pub fn extract_text(data: &Value, catalyst_ref: &str) -> String {
    let lower = catalyst_ref.to_lowercase();
    if lower.contains("claude") {
        let content = data.get("content").and_then(|v| v.as_array()).cloned().unwrap_or_default();
        content
            .iter()
            .filter(|block| block.get("type").and_then(|v| v.as_str()) == Some("text"))
            .filter_map(|block| block.get("text").and_then(|v| v.as_str()))
            .collect::<Vec<_>>()
            .join("")
    } else {
        crate::helpers::extract_content(data, catalyst_ref)
    }
}

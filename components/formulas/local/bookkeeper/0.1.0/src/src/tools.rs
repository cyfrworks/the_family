use serde_json::{json, Value};

const MAX_TOOL_RESULT_CHARS: usize = 32000;

// ---------------------------------------------------------------------------
// Tool call struct
// ---------------------------------------------------------------------------

pub struct ToolCall {
    pub id: String,
    pub name: String,
    pub arguments: Value,
}

// ---------------------------------------------------------------------------
// Hardcoded tool definitions
// ---------------------------------------------------------------------------

pub fn build_tool_definitions(catalyst_ref: &str) -> Value {
    let tools = vec![
        json!({
            "name": "search_entries",
            "description": "Full-text search across bookkeeper entries. Returns matching entries ranked by relevance.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "query": { "type": "string", "description": "Search query" }
                },
                "required": ["query"]
            }
        }),
        json!({
            "name": "list_entries",
            "description": "List bookkeeper entries, optionally filtered by tag.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "tag_filter": { "type": "string", "description": "Filter entries containing this tag" },
                    "limit": { "type": "integer", "description": "Max entries to return (default 50)" }
                }
            }
        }),
        json!({
            "name": "get_entry",
            "description": "Get a single entry by its ID.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "entry_id": { "type": "string", "description": "Entry UUID" }
                },
                "required": ["entry_id"]
            }
        }),
        json!({
            "name": "save_entry",
            "description": "Create a new knowledge entry.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "title": { "type": "string", "description": "Entry title" },
                    "content": { "type": "string", "description": "Entry content (markdown supported)" },
                    "tags": {
                        "type": "array",
                        "items": { "type": "string" },
                        "description": "Tags for categorization"
                    }
                },
                "required": ["title", "content"]
            }
        }),
        json!({
            "name": "update_entry",
            "description": "Update an existing entry. Only provided fields are changed.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "entry_id": { "type": "string", "description": "Entry UUID to update" },
                    "title": { "type": "string", "description": "New title" },
                    "content": { "type": "string", "description": "New content" },
                    "tags": {
                        "type": "array",
                        "items": { "type": "string" },
                        "description": "New tags (replaces existing)"
                    }
                },
                "required": ["entry_id"]
            }
        }),
        json!({
            "name": "delete_entry",
            "description": "Delete an entry by ID.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "entry_id": { "type": "string", "description": "Entry UUID to delete" }
                },
                "required": ["entry_id"]
            }
        }),
        json!({
            "name": "upload_file",
            "description": "Save text content as a file in storage.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "filename": { "type": "string", "description": "Filename (e.g. report.md)" },
                    "content": { "type": "string", "description": "File content" },
                    "content_type": { "type": "string", "description": "MIME type (default text/plain)" }
                },
                "required": ["filename", "content"]
            }
        }),
        json!({
            "name": "list_files",
            "description": "List files in the bookkeeper's storage.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "prefix": { "type": "string", "description": "Optional path prefix filter" }
                }
            }
        }),
        json!({
            "name": "get_file_url",
            "description": "Get a signed download URL for a file.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "filename": { "type": "string", "description": "Filename to get URL for" },
                    "expires_in": { "type": "integer", "description": "URL expiry in seconds (default 3600)" }
                },
                "required": ["filename"]
            }
        }),
    ];

    format_tools_for_provider(&tools, catalyst_ref)
}

fn format_tools_for_provider(tools: &[Value], catalyst_ref: &str) -> Value {
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
        // Claude format (default)
        json!(tools)
    }
}

// ---------------------------------------------------------------------------
// Tool call detection (multi-provider)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Tool call extraction (multi-provider)
// ---------------------------------------------------------------------------

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
// Build provider-specific request WITH tools
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
        json!({
            "operation": "messages.create",
            "params": {
                "model": model,
                "max_tokens": max_tokens,
                "messages": messages,
                "system": system,
                "tools": tools
            }
        })
    } else if lower.contains("openai") || lower.contains("grok") || lower.contains("openrouter") {
        let mut all_messages = vec![json!({"role": "system", "content": system})];
        all_messages.extend_from_slice(messages);
        json!({
            "operation": "chat.completions.create",
            "params": {
                "model": model,
                "messages": all_messages,
                "tools": tools
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

// ---------------------------------------------------------------------------
// Extract text from response (multi-provider, handles tool_use turns too)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Local tool dispatch (sequential)
// ---------------------------------------------------------------------------

pub fn execute_bookkeeper_tools(
    tool_calls: &[ToolCall],
    bookkeeper_id: &str,
    owner_id: &str,
    access_token: &str,
) -> Vec<(String, String, String)> {
    tool_calls
        .iter()
        .map(|tc| {
            let result = dispatch_bookkeeper_tool(
                &tc.name, &tc.arguments, bookkeeper_id, owner_id, access_token,
            );
            (tc.id.clone(), tc.name.clone(), result)
        })
        .collect()
}

fn dispatch_bookkeeper_tool(
    name: &str,
    args: &Value,
    bookkeeper_id: &str,
    owner_id: &str,
    access_token: &str,
) -> String {
    let result = match name {
        "search_entries" => {
            let query = args.get("query").and_then(|v| v.as_str()).unwrap_or("");
            crate::helpers::supabase_call(
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
            )
        }
        "list_entries" => {
            let limit = args.get("limit").and_then(|v| v.as_u64()).unwrap_or(50);
            let mut filters = vec![
                json!({"column": "bookkeeper_id", "op": "eq", "value": bookkeeper_id}),
                json!({"column": "owner_id", "op": "eq", "value": owner_id}),
            ];
            if let Some(tag) = args.get("tag_filter").and_then(|v| v.as_str()) {
                filters.push(json!({"column": "tags", "op": "cs", "value": format!("{{{tag}}}")}));
            }
            crate::helpers::supabase_call(
                "db.select",
                json!({
                    "access_token": access_token,
                    "table": "bookkeeper_entries",
                    "select": "*",
                    "filters": filters,
                    "order": [{"column": "created_at", "ascending": false}],
                    "limit": limit
                }),
            )
        }
        "get_entry" => {
            let entry_id = args.get("entry_id").and_then(|v| v.as_str()).unwrap_or("");
            crate::helpers::supabase_call(
                "db.select",
                json!({
                    "access_token": access_token,
                    "table": "bookkeeper_entries",
                    "select": "*",
                    "filters": [
                        {"column": "id", "op": "eq", "value": entry_id},
                        {"column": "bookkeeper_id", "op": "eq", "value": bookkeeper_id},
                        {"column": "owner_id", "op": "eq", "value": owner_id}
                    ],
                    "limit": 1
                }),
            )
        }
        "save_entry" => {
            let title = args.get("title").and_then(|v| v.as_str()).unwrap_or("");
            let content = args.get("content").and_then(|v| v.as_str()).unwrap_or("");
            let mut body = json!({
                "bookkeeper_id": bookkeeper_id,
                "owner_id": owner_id,
                "title": title,
                "content": content
            });
            if let Some(tags) = args.get("tags") {
                if tags.is_array() {
                    body["tags"] = tags.clone();
                }
            }
            crate::helpers::supabase_call(
                "db.insert",
                json!({
                    "access_token": access_token,
                    "table": "bookkeeper_entries",
                    "body": body
                }),
            )
        }
        "update_entry" => {
            let entry_id = args.get("entry_id").and_then(|v| v.as_str()).unwrap_or("");
            let mut body = json!({});
            if let Some(title) = args.get("title").and_then(|v| v.as_str()) {
                body["title"] = json!(title);
            }
            if let Some(content) = args.get("content").and_then(|v| v.as_str()) {
                body["content"] = json!(content);
            }
            if let Some(tags) = args.get("tags") {
                if tags.is_array() {
                    body["tags"] = tags.clone();
                }
            }
            crate::helpers::supabase_call(
                "db.update",
                json!({
                    "access_token": access_token,
                    "table": "bookkeeper_entries",
                    "body": body,
                    "filters": [
                        {"column": "id", "op": "eq", "value": entry_id}
                    ]
                }),
            )
        }
        "delete_entry" => {
            let entry_id = args.get("entry_id").and_then(|v| v.as_str()).unwrap_or("");
            crate::helpers::supabase_call(
                "db.delete",
                json!({
                    "access_token": access_token,
                    "table": "bookkeeper_entries",
                    "filters": [
                        {"column": "id", "op": "eq", "value": entry_id}
                    ]
                }),
            )
            .map(|_| json!({"deleted": true}))
        }
        "upload_file" => {
            let filename = args.get("filename").and_then(|v| v.as_str()).unwrap_or("");
            let content = args.get("content").and_then(|v| v.as_str()).unwrap_or("");
            let content_type = args
                .get("content_type")
                .and_then(|v| v.as_str())
                .unwrap_or("text/plain");
            let path = format!("{owner_id}/{bookkeeper_id}/{filename}");
            crate::helpers::storage_call(
                "upload",
                json!({
                    "access_token": access_token,
                    "path": path,
                    "body": content,
                    "content_type": content_type
                }),
            )
        }
        "list_files" => {
            let prefix = args.get("prefix").and_then(|v| v.as_str()).unwrap_or("");
            let full_prefix = if prefix.is_empty() {
                format!("{owner_id}/{bookkeeper_id}")
            } else {
                format!("{owner_id}/{bookkeeper_id}/{prefix}")
            };
            crate::helpers::storage_call(
                "list",
                json!({
                    "access_token": access_token,
                    "prefix": full_prefix
                }),
            )
        }
        "get_file_url" => {
            let filename = args.get("filename").and_then(|v| v.as_str()).unwrap_or("");
            let expires_in = args.get("expires_in").and_then(|v| v.as_u64()).unwrap_or(3600);
            let path = format!("{owner_id}/{bookkeeper_id}/{filename}");
            crate::helpers::storage_call(
                "createSignedUrl",
                json!({
                    "access_token": access_token,
                    "path": path,
                    "expires_in": expires_in
                }),
            )
        }
        _ => Err(format!("Unknown tool: {name}")),
    };

    match result {
        Ok(data) => {
            let formatted = serde_json::to_string_pretty(&data).unwrap_or_else(|_| data.to_string());
            truncate_result(&formatted)
        }
        Err(e) => json!({"error": e}).to_string(),
    }
}

fn truncate_result(s: &str) -> String {
    if s.len() <= MAX_TOOL_RESULT_CHARS {
        s.to_string()
    } else {
        let truncated = &s[..MAX_TOOL_RESULT_CHARS];
        format!(
            "{}\n\n[... truncated, showing first {} chars of {} total]",
            truncated, MAX_TOOL_RESULT_CHARS, s.len()
        )
    }
}

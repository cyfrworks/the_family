use serde_json::{json, Value};

use crate::bindings::cyfr::formula::invoke;
use crate::helpers;

const MAX_TOOL_RESULT_CHARS: usize = 32000;

// ---------------------------------------------------------------------------
// Hardcoded tool definitions (replaces MCP discovery)
// ---------------------------------------------------------------------------

fn caporegime_tools() -> Vec<Value> {
    vec![
        json!({
            "name": "delegate",
            "description": "Delegate a task to a named soldier. The soldier will use their own LLM to complete the task and return the result.",
            "input_schema": {
                "type": "object",
                "required": ["soldier_name", "task"],
                "properties": {
                    "soldier_name": {
                        "type": "string",
                        "description": "Name of the soldier to delegate to (must match a soldier in your crew)"
                    },
                    "task": {
                        "type": "string",
                        "description": "The task description/prompt to give the soldier"
                    }
                }
            }
        }),
        json!({
            "name": "search_bookkeeper",
            "description": "Search a bookkeeper's entries by query. Returns matching entries ranked by relevance.",
            "input_schema": {
                "type": "object",
                "required": ["bookkeeper_name", "query"],
                "properties": {
                    "bookkeeper_name": {
                        "type": "string",
                        "description": "Name of the bookkeeper to search"
                    },
                    "query": {
                        "type": "string",
                        "description": "Search query"
                    }
                }
            }
        }),
        json!({
            "name": "list_bookkeeper_entries",
            "description": "List entries from a bookkeeper, optionally filtered by tag.",
            "input_schema": {
                "type": "object",
                "required": ["bookkeeper_name"],
                "properties": {
                    "bookkeeper_name": {
                        "type": "string",
                        "description": "Name of the bookkeeper"
                    },
                    "tag_filter": {
                        "type": "string",
                        "description": "Optional tag to filter entries by"
                    }
                }
            }
        }),
        json!({
            "name": "store_in_bookkeeper",
            "description": "Create a new entry in a bookkeeper's knowledge store.",
            "input_schema": {
                "type": "object",
                "required": ["bookkeeper_name", "title", "content"],
                "properties": {
                    "bookkeeper_name": {
                        "type": "string",
                        "description": "Name of the bookkeeper to store the entry in"
                    },
                    "title": {
                        "type": "string",
                        "description": "Entry title"
                    },
                    "content": {
                        "type": "string",
                        "description": "Entry content (markdown recommended)"
                    },
                    "tags": {
                        "type": "array",
                        "items": { "type": "string" },
                        "description": "Optional tags for categorization"
                    }
                }
            }
        }),
        json!({
            "name": "read_journal",
            "description": "Read past operations and their step-level results from your journal. Returns recent operations with tool_calls details.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "limit": {
                        "type": "integer",
                        "description": "Number of recent operations to return (default: 10, max: 50)"
                    },
                    "status": {
                        "type": "string",
                        "description": "Filter by status: running, completed, or failed"
                    }
                }
            }
        }),
        json!({
            "name": "create_job",
            "description": "Save a workflow definition (name, steps, optional schedule) as a reusable job. If a cron schedule is provided, the job will run automatically at that interval.",
            "input_schema": {
                "type": "object",
                "required": ["name", "steps"],
                "properties": {
                    "name": {
                        "type": "string",
                        "description": "Job name"
                    },
                    "description": {
                        "type": "string",
                        "description": "Job description"
                    },
                    "steps": {
                        "type": "array",
                        "description": "Array of step definitions. Each step has: id (string), type ('delegate' or 'for_each'), soldier (soldier name), prompt (template string with {{item}}, {{step_id.results}}, {{today}}). for_each steps also have: items (string[] or {bookkeeper: name, tag_filter?: string}), parallel (boolean, default true).",
                        "items": { "type": "object" }
                    },
                    "schedule": {
                        "type": "string",
                        "description": "Cron expression for recurring execution (e.g., '0 9 * * *' for daily at 9am). Omit for manual-only jobs."
                    },
                    "sit_down_id": {
                        "type": "string",
                        "description": "Optional sit-down ID to post results to when job runs"
                    }
                }
            }
        }),
        json!({
            "name": "list_jobs",
            "description": "List your saved job definitions.",
            "input_schema": {
                "type": "object",
                "properties": {}
            }
        }),
        json!({
            "name": "run_job",
            "description": "Trigger immediate execution of a saved job.",
            "input_schema": {
                "type": "object",
                "required": ["job_id"],
                "properties": {
                    "job_id": {
                        "type": "string",
                        "description": "ID of the job to run"
                    }
                }
            }
        }),
    ]
}

// ---------------------------------------------------------------------------
// Build tool definitions for provider
// ---------------------------------------------------------------------------

pub fn build_tool_definitions(catalyst_ref: &str) -> Value {
    let tools = caporegime_tools();
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
// Local tool dispatch (hardcoded tools)
// ---------------------------------------------------------------------------

/// Dispatch a caporegime tool call locally. Returns the result string.
pub fn dispatch_caporegime_tool(
    tool_name: &str,
    args: &Value,
    crew_info: &Value,
    member_id: &str,
    owner_id: &str,
    access_token: &str,
) -> String {
    match tool_name {
        "delegate" => dispatch_delegate(args, crew_info, access_token),
        "search_bookkeeper" => dispatch_search_bookkeeper(args, crew_info, owner_id, access_token),
        "list_bookkeeper_entries" => dispatch_list_bookkeeper_entries(args, crew_info, owner_id, access_token),
        "store_in_bookkeeper" => dispatch_store_in_bookkeeper(args, crew_info, owner_id, access_token),
        "read_journal" => dispatch_read_journal(member_id, args, access_token),
        "create_job" => dispatch_create_job(args, member_id, owner_id, access_token),
        "list_jobs" => dispatch_list_jobs(member_id, access_token),
        "run_job" => dispatch_run_job(args, member_id, owner_id, access_token),
        _ => json!({"error": format!("Unknown tool: {}", tool_name)}).to_string(),
    }
}

/// Find a member by name: tries exact (case-insensitive), then substring match.
fn fuzzy_find<'a>(members: &'a [Value], name: &str) -> Option<&'a Value> {
    let needle = name.to_lowercase();
    // Exact match first
    if let Some(m) = members.iter().find(|m| {
        m.get("name").and_then(|v| v.as_str())
            .map(|n| n.to_lowercase() == needle)
            .unwrap_or(false)
    }) {
        return Some(m);
    }
    // Substring match (name contains query or query contains name)
    members.iter().find(|m| {
        m.get("name").and_then(|v| v.as_str())
            .map(|n| {
                let lower = n.to_lowercase();
                lower.contains(&needle) || needle.contains(&lower)
            })
            .unwrap_or(false)
    })
}

fn find_soldier<'a>(crew_info: &'a Value, name: &str) -> Option<&'a Value> {
    let soldiers = crew_info.get("soldiers").and_then(|v| v.as_array())?;
    fuzzy_find(soldiers, name)
}

fn find_bookkeeper<'a>(crew_info: &'a Value, name: &str) -> Option<&'a Value> {
    let bookkeepers = crew_info.get("bookkeepers").and_then(|v| v.as_array())?;
    fuzzy_find(bookkeepers, name)
}

fn dispatch_delegate(args: &Value, crew_info: &Value, access_token: &str) -> String {
    let soldier_name = args.get("soldier_name").and_then(|v| v.as_str()).unwrap_or("");
    let task = args.get("task").and_then(|v| v.as_str()).unwrap_or("");

    if soldier_name.is_empty() || task.is_empty() {
        return json!({"error": "Missing required 'soldier_name' or 'task'"}).to_string();
    }

    let soldier = match find_soldier(crew_info, soldier_name) {
        Some(s) => s,
        None => return json!({"error": format!("Soldier '{}' not found in your crew", soldier_name)}).to_string(),
    };

    match helpers::invoke_consul(soldier, task, access_token) {
        Ok(content) => json!({"result": content}).to_string(),
        Err(e) => json!({"error": format!("Delegation failed: {}", e)}).to_string(),
    }
}

fn dispatch_search_bookkeeper(args: &Value, crew_info: &Value, owner_id: &str, access_token: &str) -> String {
    let bk_name = args.get("bookkeeper_name").and_then(|v| v.as_str()).unwrap_or("");
    let query = args.get("query").and_then(|v| v.as_str()).unwrap_or("");

    if bk_name.is_empty() || query.is_empty() {
        return json!({"error": "Missing required 'bookkeeper_name' or 'query'"}).to_string();
    }

    let bookkeeper = match find_bookkeeper(crew_info, bk_name) {
        Some(b) => b,
        None => return json!({"error": format!("Bookkeeper '{}' not found", bk_name)}).to_string(),
    };

    let bk_id = bookkeeper.get("id").and_then(|v| v.as_str()).unwrap_or("");

    match helpers::invoke_bookkeeper(bk_id, owner_id, "search", json!({"query": query}), access_token) {
        Ok(data) => truncate_result(&serde_json::to_string_pretty(&data).unwrap_or_default()),
        Err(e) => json!({"error": format!("Search failed: {}", e)}).to_string(),
    }
}

fn dispatch_list_bookkeeper_entries(args: &Value, crew_info: &Value, owner_id: &str, access_token: &str) -> String {
    let bk_name = args.get("bookkeeper_name").and_then(|v| v.as_str()).unwrap_or("");

    if bk_name.is_empty() {
        return json!({"error": "Missing required 'bookkeeper_name'"}).to_string();
    }

    let bookkeeper = match find_bookkeeper(crew_info, bk_name) {
        Some(b) => b,
        None => return json!({"error": format!("Bookkeeper '{}' not found", bk_name)}).to_string(),
    };

    let bk_id = bookkeeper.get("id").and_then(|v| v.as_str()).unwrap_or("");
    let mut extra = json!({});
    if let Some(tag) = args.get("tag_filter").and_then(|v| v.as_str()) {
        extra["tag_filter"] = json!(tag);
    }

    match helpers::invoke_bookkeeper(bk_id, owner_id, "list_entries", extra, access_token) {
        Ok(data) => truncate_result(&serde_json::to_string_pretty(&data).unwrap_or_default()),
        Err(e) => json!({"error": format!("List failed: {}", e)}).to_string(),
    }
}

fn dispatch_store_in_bookkeeper(args: &Value, crew_info: &Value, owner_id: &str, access_token: &str) -> String {
    let bk_name = args.get("bookkeeper_name").and_then(|v| v.as_str()).unwrap_or("");
    let title = args.get("title").and_then(|v| v.as_str()).unwrap_or("");
    let content = args.get("content").and_then(|v| v.as_str()).unwrap_or("");

    if bk_name.is_empty() || title.is_empty() || content.is_empty() {
        return json!({"error": "Missing required 'bookkeeper_name', 'title', or 'content'"}).to_string();
    }

    let bookkeeper = match find_bookkeeper(crew_info, bk_name) {
        Some(b) => b,
        None => return json!({"error": format!("Bookkeeper '{}' not found", bk_name)}).to_string(),
    };

    let bk_id = bookkeeper.get("id").and_then(|v| v.as_str()).unwrap_or("");
    let mut extra = json!({
        "title": title,
        "content": content
    });
    if let Some(tags) = args.get("tags") {
        extra["tags"] = tags.clone();
    }

    match helpers::invoke_bookkeeper(bk_id, owner_id, "create_entry", extra, access_token) {
        Ok(data) => json!({"stored": true, "entry": data}).to_string(),
        Err(e) => json!({"error": format!("Store failed: {}", e)}).to_string(),
    }
}

fn dispatch_read_journal(member_id: &str, args: &Value, access_token: &str) -> String {
    let limit = args.get("limit").and_then(|v| v.as_u64()).unwrap_or(10).min(50);
    let mut filters = vec![
        json!({"column": "member_id", "op": "eq", "value": member_id}),
    ];
    if let Some(status) = args.get("status").and_then(|v| v.as_str()) {
        filters.push(json!({"column": "status", "op": "eq", "value": status}));
    }

    match helpers::supabase_call(
        "db.select",
        json!({
            "table": "operations",
            "select": "id,status,task_summary,result_content,turns_used,tool_calls,usage,started_at,completed_at",
            "filters": filters,
            "order": [{"column": "started_at", "ascending": false}],
            "limit": limit,
            "access_token": access_token
        }),
    ) {
        Ok(data) => truncate_result(&serde_json::to_string_pretty(&data).unwrap_or_default()),
        Err(e) => json!({"error": format!("Journal read failed: {}", e)}).to_string(),
    }
}

fn dispatch_create_job(args: &Value, member_id: &str, owner_id: &str, access_token: &str) -> String {
    let name = args.get("name").and_then(|v| v.as_str()).unwrap_or("");
    let steps = args.get("steps").cloned().unwrap_or(json!([]));
    let description = args.get("description").and_then(|v| v.as_str());
    let schedule = args.get("schedule").and_then(|v| v.as_str());
    let sit_down_id = args.get("sit_down_id").and_then(|v| v.as_str());

    if name.is_empty() {
        return json!({"error": "Missing required 'name'"}).to_string();
    }
    if !steps.is_array() || steps.as_array().map(|a| a.is_empty()).unwrap_or(true) {
        return json!({"error": "Missing or empty 'steps' array"}).to_string();
    }

    let job = match helpers::job_create(member_id, owner_id, name, description, &steps, schedule, sit_down_id, access_token) {
        Ok(j) => j,
        Err(e) => return json!({"error": format!("Job creation failed: {}", e)}).to_string(),
    };

    let job_id = job.get("id").and_then(|v| v.as_str()).unwrap_or("");

    // If schedule provided, create CYFR cron schedule
    if let Some(cron_expr) = schedule {
        let schedule_result = create_cyfr_schedule(job_id, cron_expr, member_id, owner_id, access_token);
        if let Ok(schedule_id) = schedule_result {
            let _ = helpers::job_update(job_id, json!({"schedule_id": schedule_id}), access_token);
            return json!({"job": job, "schedule_id": schedule_id, "scheduled": true}).to_string();
        }
    }

    json!({"job": job}).to_string()
}

fn create_cyfr_schedule(job_id: &str, cron_expression: &str, member_id: &str, owner_id: &str, access_token: &str) -> Result<String, String> {
    let request = json!({
        "tool": "schedule",
        "action": "create",
        "args": {
            "name": format!("job-{}", job_id),
            "cron_expression": cron_expression,
            "reference": "formula:local.caporegime:0.1.0",
            "input": {
                "action": "execute_job",
                "job_id": job_id,
                "caporegime_id": member_id,
                "owner_id": owner_id,
                "access_token": access_token
            }
        }
    });

    let response_str = invoke::call(&request.to_string());
    let response: Value = serde_json::from_str(&response_str)
        .map_err(|e| format!("Schedule parse error: {e}"))?;

    if let Some(err) = response.get("error") {
        return Err(format!("Schedule creation failed: {err}"));
    }

    let schedule_id = response
        .get("output")
        .and_then(|o| o.get("schedule_id").or(o.get("id")))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    Ok(schedule_id)
}

fn dispatch_list_jobs(member_id: &str, access_token: &str) -> String {
    match helpers::job_list(member_id, access_token) {
        Ok(data) => serde_json::to_string_pretty(&data).unwrap_or_default(),
        Err(e) => json!({"error": format!("List jobs failed: {}", e)}).to_string(),
    }
}

fn dispatch_run_job(args: &Value, member_id: &str, owner_id: &str, access_token: &str) -> String {
    let job_id = args.get("job_id").and_then(|v| v.as_str()).unwrap_or("");
    if job_id.is_empty() {
        return json!({"error": "Missing required 'job_id'"}).to_string();
    }

    // Invoke self with execute_job action
    let request = json!({
        "tool": "execution",
        "action": "run",
        "args": {
            "reference": "formula:local.caporegime:0.1.0",
            "input": {
                "action": "execute_job",
                "job_id": job_id,
                "caporegime_id": member_id,
                "owner_id": owner_id,
                "access_token": access_token
            },
            "type": "formula"
        }
    });

    let response_str = invoke::call(&request.to_string());
    let response: Value = serde_json::from_str(&response_str).unwrap_or(json!({}));

    if let Some(err) = response.get("error") {
        return json!({"error": format!("Job execution failed: {err}")}).to_string();
    }

    let output = response.get("output").cloned().unwrap_or(Value::Null);
    let raw_result = output.get("result").cloned().unwrap_or(output);
    let result = match &raw_result {
        Value::String(s) => serde_json::from_str::<Value>(s).unwrap_or(raw_result.clone()),
        _ => raw_result,
    };

    truncate_result(&serde_json::to_string_pretty(&result.get("data").unwrap_or(&result)).unwrap_or_default())
}

// ---------------------------------------------------------------------------
// Parallel tool execution for agentic loop
// ---------------------------------------------------------------------------

pub fn execute_tools_parallel(
    tool_calls: &[(String, String, Value)],
    crew_info: &Value,
    member_id: &str,
    owner_id: &str,
    access_token: &str,
) -> Vec<(String, String, String)> {
    // All tools are local dispatch — run sequentially (no MCP overhead)
    tool_calls
        .iter()
        .map(|(id, name, args)| {
            let result = dispatch_caporegime_tool(name, args, crew_info, member_id, owner_id, access_token);
            (id.clone(), name.clone(), result)
        })
        .collect()
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

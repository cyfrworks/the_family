use serde_json::{json, Value};

use crate::bindings::cyfr::formula::invoke;

pub const SUPABASE_REF: &str = "catalyst:moonmoon69.supabase";
pub const WEB_CATALYST_REF: &str = "catalyst:moonmoon69.web";

const MAX_EXTERNAL_TURNS: usize = 10;

fn supabase_call_once(operation: &str, params: Value) -> Result<Value, String> {
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

pub fn supabase_call(operation: &str, params: Value) -> Result<Value, String> {
    let retry_params = params.clone();
    match supabase_call_once(operation, params) {
        Ok(v) => Ok(v),
        Err(_) => supabase_call_once(operation, retry_params),
    }
}

pub fn invoke_catalyst(catalyst_ref: &str, catalyst_input: &Value) -> Result<Value, String> {
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

pub fn extract_content(data: &Value, catalyst_ref: &str) -> String {
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

pub fn insert_ai_message(
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

// ---------------------------------------------------------------------------
// Soldier invocation (direct, no consul hop)
// ---------------------------------------------------------------------------

/// Build a single-turn LLM request with native web search tools (no caporegime tools).
/// Replicates consul's build_provider_request for soldier delegation.
/// Invoke a soldier directly (no consul hop).
/// Dispatches based on soldier_type: "default" or "external".
/// Both paths use `build_soldier_request` which adds native web search tools.
/// Default gets web search only, external additionally gets `http_request`.
pub fn invoke_soldier(
    soldier: &Value,
    task: &str,
    access_token: &str,
) -> Result<String, String> {
    let soldier_type = soldier.get("soldier_type").and_then(|v| v.as_str()).unwrap_or("default");

    match soldier_type {
        "external" => invoke_external_soldier(soldier, task, access_token),
        _ => invoke_default_soldier(soldier, task, access_token),
    }
}

/// Default soldier: single-turn LLM call with native web search tools only.
fn invoke_default_soldier(
    soldier: &Value,
    task: &str,
    _access_token: &str,
) -> Result<String, String> {
    let catalog_model = soldier.get("catalog_model").cloned().unwrap_or(Value::Null);
    let provider = catalog_model.get("provider").and_then(|v| v.as_str()).unwrap_or("claude");
    let model = catalog_model.get("model").and_then(|v| v.as_str()).unwrap_or("claude-sonnet-4-6");
    let system_prompt = soldier.get("system_prompt").and_then(|v| v.as_str()).unwrap_or("");

    let catalyst_ref = format!("catalyst:moonmoon69.{}", provider);
    let messages = vec![json!({"role": "user", "content": task})];

    // No custom tools — just native web search from build_provider_request_with_tools
    let catalyst_input = crate::tools::build_soldier_request(
        &catalyst_ref, model, &messages, system_prompt, &[], 4096,
    );
    let data = invoke_catalyst(&catalyst_ref, &catalyst_input)?;
    let content = extract_content(&data, &catalyst_ref);

    if content.is_empty() {
        return Err("Empty response from soldier".to_string());
    }

    Ok(content)
}

/// External soldier: mini agentic loop with `http_request` custom tool + native web search.
/// On tool call, caporegime executes the web catalyst fetch, injecting auth from soldier_config.
fn invoke_external_soldier(
    soldier: &Value,
    task: &str,
    _access_token: &str,
) -> Result<String, String> {
    let catalog_model = soldier.get("catalog_model").cloned().unwrap_or(Value::Null);
    let provider = catalog_model.get("provider").and_then(|v| v.as_str()).unwrap_or("claude");
    let model = catalog_model.get("model").and_then(|v| v.as_str()).unwrap_or("claude-sonnet-4-6");
    let system_prompt = soldier.get("system_prompt").and_then(|v| v.as_str()).unwrap_or("");
    let soldier_config = soldier.get("soldier_config").cloned().unwrap_or(json!({}));

    let catalyst_ref = format!("catalyst:moonmoon69.{}", provider);
    let custom_tools = vec![build_web_tool_definition()];

    // Build enriched system prompt with docs and secret names (not values!)
    let mut enriched_system = system_prompt.to_string();

    // Tell the LLM which secrets are available (names only — values are injected at execution time)
    if let Some(secrets) = soldier_config.get("secrets").and_then(|v| v.as_array()) {
        let names: Vec<&str> = secrets.iter().filter_map(|s| {
            s.get("name").and_then(|v| v.as_str()).filter(|n| !n.is_empty())
        }).collect();
        if !names.is_empty() {
            enriched_system.push_str("\n\n---\nAVAILABLE CREDENTIALS:\n");
            enriched_system.push_str("Use {{SECRET_NAME}} as a placeholder in header values. The actual secret is injected automatically at request time.\n");
            for name in &names {
                enriched_system.push_str(&format!("- {{{{{}}}}}\n", name));
            }
            enriched_system.push_str("\nExample: to use a secret called \"API_KEY\" as a Bearer token, set the header:\n");
            enriched_system.push_str("  Authorization: Bearer {{API_KEY}}\n");
        }
    }

    // Tell the LLM where docs are and how to fetch them via Jina Reader
    if let Some(docs_url) = soldier_config.get("docs_url").and_then(|v| v.as_str()) {
        if !docs_url.is_empty() {
            enriched_system.push_str("\n\n---\nAPI DOCUMENTATION:\n");
            enriched_system.push_str(&format!("Reference docs: {}\n", docs_url));
            enriched_system.push_str("To read API docs, use http_request to fetch: https://r.jina.ai/<docs_page_url>\n");
            enriched_system.push_str("Jina Reader converts any webpage to clean markdown. Fetch the specific endpoint docs you need before making API calls.\n");
        }
    }

    let mut messages: Vec<Value> = vec![json!({"role": "user", "content": task})];
    let mut all_text = String::new();

    for _turn in 0..MAX_EXTERNAL_TURNS {
        // No native web search for external soldiers — http_request is their only tool
        let catalyst_input = crate::tools::build_provider_request_with_tools(
            &catalyst_ref, model, &messages, &enriched_system, &custom_tools, 4096,
        );

        let data = invoke_catalyst(&catalyst_ref, &catalyst_input)?;

        let turn_text = crate::tools::extract_text(&data, &catalyst_ref);
        if !turn_text.is_empty() {
            all_text.push_str(&turn_text);
        }

        if !crate::tools::has_tool_calls(&data, &catalyst_ref) {
            break;
        }

        let assistant_msg = crate::tools::build_assistant_message(&data, &catalyst_ref);
        messages.push(assistant_msg);

        let tool_calls = crate::tools::extract_tool_calls(&data, &catalyst_ref);
        let mut results: Vec<(String, String, String)> = Vec::new();

        for tc in &tool_calls {
            if tc.name == "http_request" {
                let result = execute_web_tool(&tc.arguments, &soldier_config);
                results.push((tc.id.clone(), tc.name.clone(), result));
            } else {
                results.push((tc.id.clone(), tc.name.clone(), json!({"error": "Unknown tool"}).to_string()));
            }
        }

        let tool_results_msg = crate::tools::build_tool_results_message(&results, &catalyst_ref);
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
    }

    if all_text.is_empty() {
        return Err("Empty response from external soldier".to_string());
    }

    Ok(all_text)
}


/// Build JSON schema tool definition for `http_request` (used by external soldiers).
/// Named `http_request` to avoid conflicts with provider-native web tools.
fn build_web_tool_definition() -> Value {
    json!({
        "name": "http_request",
        "description": "Make an HTTP request to an external API. Use {{SECRET_NAME}} placeholders in headers for credentials — they are replaced with actual values automatically. Returns the response body.",
        "input_schema": {
            "type": "object",
            "required": ["url"],
            "properties": {
                "url": {
                    "type": "string",
                    "description": "The full URL to request"
                },
                "method": {
                    "type": "string",
                    "description": "HTTP method. Defaults to GET.",
                    "enum": ["GET", "POST", "PUT", "DELETE", "PATCH"]
                },
                "headers": {
                    "type": "string",
                    "description": "HTTP headers as a JSON string. Use {{SECRET_NAME}} for credentials, e.g. {\"Authorization\": \"Bearer {{API_KEY}}\", \"Content-Type\": \"application/json\"}"
                },
                "body": {
                    "type": "string",
                    "description": "Request body (for POST/PUT/PATCH)"
                }
            }
        }
    })
}

/// Execute the http_request tool via the web catalyst.
/// The LLM uses {{SECRET_NAME}} placeholders in headers — we replace them with actual values.
fn execute_web_tool(args: &Value, soldier_config: &Value) -> String {
    let url = args.get("url").and_then(|v| v.as_str()).unwrap_or("");
    let method = args.get("method").and_then(|v| v.as_str()).unwrap_or("GET");

    if url.is_empty() {
        return json!({"error": "Missing required 'url'"}).to_string();
    }

    // Build a lookup map from secret names to values
    let mut secret_map: Vec<(String, String)> = Vec::new();
    if let Some(secrets) = soldier_config.get("secrets").and_then(|v| v.as_array()) {
        for secret in secrets {
            if let (Some(name), Some(value)) = (
                secret.get("name").and_then(|v| v.as_str()),
                secret.get("value").and_then(|v| v.as_str()),
            ) {
                if !name.is_empty() {
                    secret_map.push((name.to_string(), value.to_string()));
                }
            }
        }
    }

    // Build headers — LLM sends them as a JSON string, parse and replace {{SECRET}} placeholders
    let mut headers = json!({});
    if let Some(header_str) = args.get("headers").and_then(|v| v.as_str()) {
        // Replace placeholders in the raw header string before parsing
        let mut resolved = header_str.to_string();
        for (name, value) in &secret_map {
            let placeholder = format!("{{{{{}}}}}", name);
            resolved = resolved.replace(&placeholder, value);
        }
        if let Ok(parsed) = serde_json::from_str::<Value>(&resolved) {
            if let Some(obj) = parsed.as_object() {
                for (k, v) in obj {
                    headers[k] = v.clone();
                }
            }
        }
    }

    // Also replace placeholders in body if present
    let body = args.get("body").and_then(|v| v.as_str()).map(|b| {
        let mut resolved = b.to_string();
        for (name, value) in &secret_map {
            let placeholder = format!("{{{{{}}}}}", name);
            resolved = resolved.replace(&placeholder, value);
        }
        resolved
    });

    let mut fetch_input = json!({
        "operation": "fetch",
        "params": {
            "url": url,
            "method": method
        }
    });

    if let Some(obj) = headers.as_object() {
        if !obj.is_empty() {
            fetch_input["params"]["headers"] = headers;
        }
    }

    if let Some(body) = body {
        fetch_input["params"]["body"] = json!(body);
    }

    match invoke_catalyst(WEB_CATALYST_REF, &fetch_input) {
        Ok(data) => serde_json::to_string(&data).unwrap_or_default(),
        Err(e) => json!({"error": format!("Web fetch failed: {}", e)}).to_string(),
    }
}

/// Spawn a soldier invocation (for parallel delegation via self-invoke).
/// Returns the task_id for await_all.
pub fn spawn_soldier(
    soldier: &Value,
    task: &str,
    access_token: &str,
) -> String {
    let request = json!({
        "tool": "execution",
        "action": "run",
        "args": {
            "reference": "formula:local.caporegime",
            "input": {
                "action": "invoke_soldier",
                "soldier": soldier,
                "task": task,
                "access_token": access_token
            },
            "type": "formula"
        }
    });

    let spawn_str = invoke::spawn(&request.to_string());
    let spawn: Value = serde_json::from_str(&spawn_str).unwrap_or(json!({}));
    spawn.get("task_id").and_then(|v| v.as_str()).unwrap_or("").to_string()
}

/// Unwrap a formula invocation response to get the content text.
pub fn unwrap_formula_response(response: &Value) -> Result<String, String> {
    if let Some(err) = response.get("error") {
        return Err(format!("Formula invoke error: {err}"));
    }

    let output = response.get("output").cloned().unwrap_or(Value::Null);
    let raw_result = output.get("result").cloned().unwrap_or(output.clone());
    let result = match &raw_result {
        Value::String(s) => serde_json::from_str::<Value>(s).unwrap_or(raw_result.clone()),
        _ => raw_result,
    };

    if let Some(err) = result.get("error") {
        return Err(format!("Formula error: {}", err.get("message").and_then(|v| v.as_str()).unwrap_or(&err.to_string())));
    }

    let data = result.get("data").unwrap_or(&result);
    if let Some(content) = data.get("content").and_then(|v| v.as_str()) {
        return Ok(content.to_string());
    }

    // Fallback: return the whole thing as string
    Ok(serde_json::to_string_pretty(data).unwrap_or_default())
}

/// Await all spawned tasks and return results in order.
pub fn await_all_tasks(task_ids: &[String]) -> Vec<Result<String, String>> {
    let valid_ids: Vec<&str> = task_ids.iter()
        .filter(|id| !id.is_empty())
        .map(|id| id.as_str())
        .collect();

    if valid_ids.is_empty() {
        return task_ids.iter().map(|_| Err("Spawn failed".to_string())).collect();
    }

    let await_req = json!({"task_ids": valid_ids});
    let await_str = invoke::await_all(&await_req.to_string());
    let await_resp: Value = serde_json::from_str(&await_str).unwrap_or(json!({}));

    let result_arr = await_resp.get("results").and_then(|v| v.as_array()).cloned().unwrap_or_default();
    let mut result_map: std::collections::HashMap<String, Result<String, String>> = std::collections::HashMap::new();

    for r in &result_arr {
        if let Some(tid) = r.get("task_id").and_then(|v| v.as_str()) {
            let status = r.get("status").and_then(|v| v.as_str()).unwrap_or("error");
            let output = if status == "completed" {
                unwrap_formula_response(r)
            } else {
                Err(format!("Task error: {}", r.get("error").map(|e| e.to_string()).unwrap_or_default()))
            };
            result_map.insert(tid.to_string(), output);
        }
    }

    task_ids.iter().map(|tid| {
        if tid.is_empty() {
            Err("Spawn failed".to_string())
        } else {
            result_map.remove(tid).unwrap_or(Err("No result returned".to_string()))
        }
    }).collect()
}

// ---------------------------------------------------------------------------
// Bookkeeper invocation (via formula, not direct DB)
// ---------------------------------------------------------------------------

/// Invoke bookkeeper formula with a non-agentic action.
pub fn invoke_bookkeeper(
    bookkeeper_id: &str,
    owner_id: &str,
    action: &str,
    extra: Value,
    access_token: &str,
) -> Result<Value, String> {
    let mut input = json!({
        "action": action,
        "bookkeeper_id": bookkeeper_id,
        "owner_id": owner_id,
        "access_token": access_token
    });

    // Merge extra fields into input
    if let Some(obj) = extra.as_object() {
        if let Some(input_obj) = input.as_object_mut() {
            for (k, v) in obj {
                input_obj.insert(k.clone(), v.clone());
            }
        }
    }

    let request = json!({
        "tool": "execution",
        "action": "run",
        "args": {
            "reference": "formula:local.bookkeeper",
            "input": input,
            "type": "formula"
        }
    });

    let response_str = invoke::call(&request.to_string());
    let response: Value = serde_json::from_str(&response_str)
        .map_err(|e| format!("Failed to parse bookkeeper response: {e}"))?;

    if let Some(err) = response.get("error") {
        return Err(format!("Bookkeeper invoke error: {err}"));
    }

    let output = response.get("output").cloned().unwrap_or(Value::Null);
    let raw_result = output.get("result").cloned().unwrap_or(output.clone());
    let result = match &raw_result {
        Value::String(s) => serde_json::from_str::<Value>(s).unwrap_or(raw_result.clone()),
        _ => raw_result,
    };

    if let Some(err) = result.get("error") {
        return Err(format!("Bookkeeper error: {}", err.get("message").and_then(|v| v.as_str()).unwrap_or(&err.to_string())));
    }

    Ok(result.get("data").cloned().unwrap_or(result))
}

// ---------------------------------------------------------------------------
// Job CRUD helpers
// ---------------------------------------------------------------------------

pub fn job_create(
    caporegime_id: &str,
    owner_id: &str,
    name: &str,
    description: Option<&str>,
    steps: &Value,
    schedule: Option<&str>,
    sit_down_id: Option<&str>,
    access_token: &str,
) -> Result<Value, String> {
    let mut body = json!({
        "caporegime_id": caporegime_id,
        "owner_id": owner_id,
        "name": name,
        "steps": steps
    });

    if let Some(desc) = description {
        body["description"] = json!(desc);
    }
    if let Some(sched) = schedule {
        body["schedule"] = json!(sched);
    }
    if let Some(sid) = sit_down_id {
        body["sit_down_id"] = json!(sid);
    }

    let data = supabase_call(
        "db.insert",
        json!({
            "table": "jobs",
            "body": body,
            "access_token": access_token
        }),
    )?;

    let job = data.as_array().and_then(|a| a.first()).cloned().unwrap_or(Value::Null);
    Ok(job)
}

pub fn job_list(caporegime_id: &str, access_token: &str) -> Result<Value, String> {
    supabase_call(
        "db.select",
        json!({
            "table": "jobs",
            "select": "id,name,description,schedule,status,sit_down_id,created_at,updated_at",
            "filters": [
                { "column": "caporegime_id", "op": "eq", "value": caporegime_id },
                { "column": "status", "op": "neq", "value": "archived" }
            ],
            "order": [{ "column": "created_at", "ascending": false }],
            "access_token": access_token
        }),
    )
}

pub fn job_get(job_id: &str, caporegime_id: &str, access_token: &str) -> Result<Value, String> {
    let data = supabase_call(
        "db.select",
        json!({
            "table": "jobs",
            "select": "*",
            "filters": [
                { "column": "id", "op": "eq", "value": job_id },
                { "column": "caporegime_id", "op": "eq", "value": caporegime_id }
            ],
            "limit": 1,
            "access_token": access_token
        }),
    )?;

    data.as_array()
        .and_then(|a| a.first())
        .cloned()
        .ok_or_else(|| format!("Job '{}' not found for this caporegime", job_id))
}

pub fn job_update(job_id: &str, body: Value, access_token: &str) -> Result<Value, String> {
    supabase_call(
        "db.update",
        json!({
            "table": "jobs",
            "body": body,
            "filters": [
                { "column": "id", "op": "eq", "value": job_id }
            ],
            "access_token": access_token
        }),
    )
}

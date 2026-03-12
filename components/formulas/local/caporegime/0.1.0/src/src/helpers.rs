use serde_json::{json, Value};

use crate::bindings::cyfr::formula::invoke;

pub const SUPABASE_REF: &str = "catalyst:local.supabase:0.3.3";

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
// Consul invocation (soldier delegation)
// ---------------------------------------------------------------------------

/// Invoke consul formula for a single soldier delegation.
/// Returns the text response from the soldier.
pub fn invoke_consul(
    soldier: &Value,
    task: &str,
    access_token: &str,
) -> Result<String, String> {
    let catalog_model = soldier.get("catalog_model").cloned().unwrap_or(Value::Null);
    let provider = catalog_model.get("provider").and_then(|v| v.as_str()).unwrap_or("claude");
    let model = catalog_model.get("model").and_then(|v| v.as_str()).unwrap_or("claude-sonnet-4-6");
    let system_prompt = soldier.get("system_prompt").and_then(|v| v.as_str()).unwrap_or("");

    let catalyst_ref = format!("catalyst:moonmoon69.{}:1.0.0", provider);

    let request = json!({
        "tool": "execution",
        "action": "run",
        "args": {
            "reference": "formula:local.consul:0.1.0",
            "input": {
                "catalyst_ref": catalyst_ref,
                "model": model,
                "system": system_prompt,
                "conversation": [{ "role": "user", "content": task }],
                "access_token": access_token
            },
            "type": "formula"
        }
    });

    let response_str = invoke::call(&request.to_string());
    let response: Value = serde_json::from_str(&response_str)
        .map_err(|e| format!("Failed to parse consul response: {e}"))?;

    unwrap_formula_response(&response)
}

/// Spawn a consul invocation (for parallel delegation).
/// Returns the task_id for await_all.
pub fn spawn_consul(
    soldier: &Value,
    task: &str,
    access_token: &str,
) -> String {
    let catalog_model = soldier.get("catalog_model").cloned().unwrap_or(Value::Null);
    let provider = catalog_model.get("provider").and_then(|v| v.as_str()).unwrap_or("claude");
    let model = catalog_model.get("model").and_then(|v| v.as_str()).unwrap_or("claude-sonnet-4-6");
    let system_prompt = soldier.get("system_prompt").and_then(|v| v.as_str()).unwrap_or("");

    let catalyst_ref = format!("catalyst:moonmoon69.{}:1.0.0", provider);

    let request = json!({
        "tool": "execution",
        "action": "run",
        "args": {
            "reference": "formula:local.consul:0.1.0",
            "input": {
                "catalyst_ref": catalyst_ref,
                "model": model,
                "system": system_prompt,
                "conversation": [{ "role": "user", "content": task }],
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
fn unwrap_formula_response(response: &Value) -> Result<String, String> {
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

    // For consul: response is {"content": "...", "usage": {...}}
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
            "reference": "formula:local.bookkeeper:0.1.0",
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

#[allow(warnings)]
mod bindings;
mod helpers;
mod tools;

use bindings::exports::cyfr::formula::run::Guest;
use bindings::cyfr::formula::invoke;

use serde_json::{json, Value};
use std::collections::HashMap;

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

const DEFAULT_MAX_TURNS: usize = 30;
const DEFAULT_MAX_TOKENS: u64 = 16384;

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

fn handle_request(input: &str) -> Result<String, String> {
    let parsed: Value =
        serde_json::from_str(input).map_err(|e| format!("Invalid JSON input: {e}"))?;

    let action = parsed
        .get("action")
        .and_then(|v| v.as_str())
        .unwrap_or("respond");

    match action {
        "respond" => handle_respond(&parsed),
        "execute_job" => handle_execute_job(&parsed),
        "invoke_soldier" => handle_invoke_soldier(&parsed),
        _ => Err(format!("Unknown action: {action}")),
    }
}

// ===========================================================================
// Mode 1: Brain (respond) — agentic loop with hardcoded tools
// ===========================================================================

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

    let sit_down_id = parsed.get("sit_down_id").and_then(|v| v.as_str()).unwrap_or("");
    let member_id = parsed.get("member_id").and_then(|v| v.as_str()).unwrap_or("");
    let access_token = parsed.get("access_token").and_then(|v| v.as_str()).unwrap_or("");
    let member = parsed.get("member").cloned().unwrap_or(Value::Null);
    let context = parsed.get("context").cloned().unwrap_or(Value::Null);
    let reply_to_id = parsed.get("reply_to_id").and_then(|v| v.as_str());
    let owner_id = context.get("owner_id").and_then(|v| v.as_str()).unwrap_or("");

    let member_name = member.get("name").and_then(|v| v.as_str()).unwrap_or("Caporegime");

    let max_turns = parsed
        .get("max_turns")
        .and_then(|v| v.as_u64())
        .unwrap_or(DEFAULT_MAX_TURNS as u64) as usize;

    emit_event(sit_down_id, member_id, member_name, json!({"kind": "status", "text": "Assessing the task..."}), access_token);

    // 1. Create operation record
    let operation = helpers::supabase_call(
        "db.insert",
        json!({
            "table": "operations",
            "body": {
                "member_id": member_id,
                "owner_id": owner_id,
                "sit_down_id": sit_down_id,
                "status": "running",
                "task_summary": get_last_user_message(&conversation)
            },
            "access_token": access_token
        }),
    );

    let operation_id = operation
        .as_ref()
        .ok()
        .and_then(|v| v.as_array())
        .and_then(|arr| arr.first())
        .and_then(|row| row.get("id"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    // 2. Fetch crew info
    let crew_info = fetch_crew_info(member_id, owner_id, access_token);

    let soldier_count = crew_info.get("soldiers").and_then(|v| v.as_array()).map(|a| a.len()).unwrap_or(0);
    let bookkeeper_count = crew_info.get("bookkeepers").and_then(|v| v.as_array()).map(|a| a.len()).unwrap_or(0);
    emit_event(sit_down_id, member_id, member_name, json!({"kind": "status", "text": format!("Briefing crew: {} soldiers, {} bookkeepers available", soldier_count, bookkeeper_count)}), access_token);

    // 3. Build enriched system prompt
    let enriched_system = build_enriched_system(system, &crew_info, member_name);

    // 4. Build tool definitions (raw, provider-formatting happens in request builder)
    let tools_for_llm = tools::build_tool_definitions();

    // 5. Run agentic loop
    let loop_result = run_agentic_loop(
        catalyst_ref, model, &enriched_system, &conversation, &tools_for_llm, max_turns,
        sit_down_id, member_id, member_name, access_token,
        &crew_info, owner_id,
    );

    match loop_result {
        Ok(result) => {
            let content = result.get("content").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let turns = result.get("turns").and_then(|v| v.as_u64()).unwrap_or(0);
            let tool_calls_log = result.get("tool_calls").cloned().unwrap_or(json!([]));
            let usage = result.get("usage").cloned().unwrap_or(json!({}));

            // 6. Update operation record
            let _ = helpers::supabase_call(
                "db.update",
                json!({
                    "table": "operations",
                    "body": {
                        "status": "completed",
                        "result_content": content,
                        "turns_used": turns,
                        "tool_calls": tool_calls_log,
                        "usage": usage,
                        "completed_at": "now()"
                    },
                    "filters": [
                        { "column": "id", "op": "eq", "value": operation_id }
                    ],
                    "access_token": access_token
                }),
            );

            // 7. Insert report message
            emit_event(sit_down_id, member_id, member_name, json!({"kind": "status", "text": "Compiling report..."}), access_token);

            let report_content = if content.is_empty() {
                "Operation completed.".to_string()
            } else {
                content.clone()
            };

            let mut report_metadata = json!({
                "provider": catalyst_ref,
                "model": model,
                "operation_id": operation_id,
                "turns": turns
            });
            if let Some(rid) = reply_to_id {
                report_metadata["reply_to_id"] = json!(rid);
            }

            let report_message_id = helpers::insert_ai_message(
                sit_down_id, member_id, &report_content, &report_metadata, access_token,
            ).unwrap_or_default();

            emit_event(sit_down_id, member_id, member_name, json!({"kind": "message_inserted", "message_id": report_message_id}), access_token);

            Ok(json!({
                "content": content,
                "message_id": report_message_id,
                "operation_id": operation_id,
                "turns": turns,
                "usage": usage
            })
            .to_string())
        }
        Err(e) => {
            emit_event(sit_down_id, member_id, member_name, json!({"kind": "status", "text": "Operation failed."}), access_token);

            let _ = helpers::supabase_call(
                "db.update",
                json!({
                    "table": "operations",
                    "body": {
                        "status": "failed",
                        "result_content": e,
                        "completed_at": "now()"
                    },
                    "filters": [
                        { "column": "id", "op": "eq", "value": operation_id }
                    ],
                    "access_token": access_token
                }),
            );

            let fail_content = format!("Operation failed: {e}");
            let fail_metadata = json!({
                "provider": catalyst_ref,
                "model": model,
                "type": "caporegime_report",
                "operation_id": operation_id,
                "status": "failed"
            });

            let _ = helpers::insert_ai_message(
                sit_down_id, member_id, &fail_content, &fail_metadata, access_token,
            );

            Err(e)
        }
    }
}

fn truncate_json(val: &Value, max: usize) -> String {
    let s = val.to_string();
    if s.len() <= max { s } else { format!("{}…", &s[..max]) }
}

// ---------------------------------------------------------------------------
// Agentic loop
// ---------------------------------------------------------------------------

fn run_agentic_loop(
    catalyst_ref: &str,
    model: &str,
    system: &str,
    initial_conversation: &[Value],
    tools_for_llm: &[Value],
    max_turns: usize,
    sit_down_id: &str,
    member_id: &str,
    member_name: &str,
    access_token: &str,
    crew_info: &Value,
    owner_id: &str,
) -> Result<Value, String> {
    let mut conversation = initial_conversation.to_vec();
    let mut turns: u64 = 0;
    let mut all_text = String::new();
    let mut total_input_tokens: u64 = 0;
    let mut total_output_tokens: u64 = 0;
    let mut tool_calls_log: Vec<Value> = Vec::new();

    loop {
        turns += 1;
        if turns as usize > max_turns {
            all_text.push_str("\n\n[Reached maximum turn limit]");
            break;
        }

        let provider_label = extract_provider_label(catalyst_ref);
        emit_event(sit_down_id, member_id, member_name, json!({"kind": "status", "text": format!("Turn {}: Calling {}...", turns, provider_label)}), access_token);
        emit_event(sit_down_id, member_id, member_name, json!({"kind": "turn_start", "turn": turns}), access_token);

        let catalyst_input = tools::build_provider_request_with_tools(
            catalyst_ref, model, &conversation, system, tools_for_llm, DEFAULT_MAX_TOKENS,
        );

        let data = helpers::invoke_catalyst(catalyst_ref, &catalyst_input)?;

        if let Some(usage) = data.get("usage") {
            let inp = usage.get("input_tokens").and_then(|v| v.as_u64()).unwrap_or(0);
            let out = usage.get("output_tokens").and_then(|v| v.as_u64()).unwrap_or(0);
            total_input_tokens += inp;
            total_output_tokens += out;
            emit_event(sit_down_id, member_id, member_name, json!({
                "kind": "usage", "turn": turns,
                "input_tokens": total_input_tokens, "output_tokens": total_output_tokens
            }), access_token);
        }

        let turn_text = tools::extract_text(&data, catalyst_ref);
        if !turn_text.is_empty() {
            all_text.push_str(&turn_text);
            emit_event(sit_down_id, member_id, member_name, json!({
                "kind": "text_delta", "turn": turns, "content": turn_text
            }), access_token);
        }

        if tools::has_tool_calls(&data, catalyst_ref) {
            let assistant_msg = tools::build_assistant_message(&data, catalyst_ref);
            conversation.push(assistant_msg);

            let tool_calls = tools::extract_tool_calls(&data, catalyst_ref);

            for tc in &tool_calls {
                emit_event(sit_down_id, member_id, member_name, json!({
                    "kind": "tool_use", "turn": turns,
                    "tool": tc.name, "tool_call_id": tc.id,
                    "input": truncate_json(&tc.arguments, 500)
                }), access_token);
                tool_calls_log.push(json!({
                    "name": tc.name,
                    "arguments": tc.arguments,
                    "turn": turns
                }));
            }

            let call_tuples: Vec<(String, String, Value)> = tool_calls
                .iter()
                .map(|tc| (tc.id.clone(), tc.name.clone(), tc.arguments.clone()))
                .collect();

            let results = tools::execute_tools_parallel(
                &call_tuples, crew_info, member_id, owner_id, access_token,
            );

            for (id, name, result_str) in &results {
                let preview = if result_str.len() > 300 { &result_str[..300] } else { result_str };
                emit_event(sit_down_id, member_id, member_name, json!({
                    "kind": "tool_result", "turn": turns,
                    "tool": name, "tool_call_id": id,
                    "preview": preview
                }), access_token);
            }

            let tool_results_msg = tools::build_tool_results_message(&results, catalyst_ref);

            let lower = catalyst_ref.to_lowercase();
            if lower.contains("openai") || lower.contains("grok") || lower.contains("openrouter") {
                if let Some(msgs) = tool_results_msg.as_array() {
                    for msg in msgs {
                        conversation.push(msg.clone());
                    }
                } else {
                    conversation.push(tool_results_msg);
                }
            } else {
                conversation.push(tool_results_msg);
            }

            continue;
        }

        let assistant_msg = tools::build_assistant_message(&data, catalyst_ref);
        conversation.push(assistant_msg);
        break;
    }

    Ok(json!({
        "content": all_text,
        "turns": turns,
        "tool_calls": tool_calls_log,
        "usage": {
            "input_tokens": total_input_tokens,
            "output_tokens": total_output_tokens
        }
    }))
}

// ===========================================================================
// Mode 3: invoke_soldier — self-invoke target for spawned soldier delegation
// ===========================================================================

fn handle_invoke_soldier(parsed: &Value) -> Result<String, String> {
    let soldier = parsed
        .get("soldier")
        .ok_or("Missing required 'soldier'")?;
    let task = parsed
        .get("task")
        .and_then(|v| v.as_str())
        .ok_or("Missing required 'task'")?;
    let access_token = parsed
        .get("access_token")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    let content = helpers::invoke_soldier(soldier, task, access_token)?;

    Ok(json!({
        "content": content
    })
    .to_string())
}

// ===========================================================================
// Mode 2: Hands (execute_job) — mechanical step executor, no orchestration LLM
// ===========================================================================

fn handle_execute_job(parsed: &Value) -> Result<String, String> {
    let caporegime_id = parsed
        .get("caporegime_id")
        .and_then(|v| v.as_str())
        .ok_or("Missing required 'caporegime_id'")?;
    let owner_id = parsed
        .get("owner_id")
        .and_then(|v| v.as_str())
        .ok_or("Missing required 'owner_id'")?;
    let access_token = parsed
        .get("access_token")
        .and_then(|v| v.as_str())
        .ok_or("Missing required 'access_token'")?;

    let sit_down_id = parsed.get("sit_down_id").and_then(|v| v.as_str()).unwrap_or("");

    // Load job definition: from job_id or inline steps
    let (job_name, steps, job_sit_down_id) = if let Some(job_id) = parsed.get("job_id").and_then(|v| v.as_str()) {
        let job = helpers::job_get(job_id, caporegime_id, access_token)?;
        let name = job.get("name").and_then(|v| v.as_str()).unwrap_or("Unnamed Job").to_string();
        let steps = job.get("steps").cloned().unwrap_or(json!([]));
        let job_sid = job.get("sit_down_id").and_then(|v| v.as_str()).unwrap_or("").to_string();
        (name, steps, job_sid)
    } else if let Some(steps) = parsed.get("steps").cloned() {
        let name = parsed.get("name").and_then(|v| v.as_str()).unwrap_or("Inline Job").to_string();
        (name, steps, String::new())
    } else {
        return Err("Missing 'job_id' or 'steps'".to_string());
    };

    // Resolve effective sit_down_id (explicit param > job config)
    let effective_sid = if !sit_down_id.is_empty() {
        sit_down_id.to_string()
    } else {
        job_sit_down_id
    };

    let steps_arr = steps.as_array().ok_or("'steps' must be an array")?;

    // Fetch crew info for soldier lookups
    let crew_info = fetch_crew_info(caporegime_id, owner_id, access_token);

    // Fetch caporegime member name for events
    let member_name_result = helpers::supabase_call(
        "db.select",
        json!({
            "table": "members",
            "select": "name",
            "filters": [{"column": "id", "op": "eq", "value": caporegime_id}],
            "limit": 1,
            "access_token": access_token
        }),
    );
    let member_name = member_name_result
        .as_ref()
        .ok()
        .and_then(|v| v.as_array())
        .and_then(|a| a.first())
        .and_then(|r| r.get("name"))
        .and_then(|v| v.as_str())
        .unwrap_or("Caporegime");

    // Create operation record
    let operation = helpers::supabase_call(
        "db.insert",
        json!({
            "table": "operations",
            "body": {
                "member_id": caporegime_id,
                "owner_id": owner_id,
                "sit_down_id": if effective_sid.is_empty() { Value::Null } else { json!(effective_sid) },
                "status": "running",
                "task_summary": format!("Job: {}", job_name)
            },
            "access_token": access_token
        }),
    );

    let operation_id = operation
        .as_ref()
        .ok()
        .and_then(|v| v.as_array())
        .and_then(|arr| arr.first())
        .and_then(|row| row.get("id"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    if !effective_sid.is_empty() {
        emit_event(&effective_sid, caporegime_id, member_name, json!({
            "kind": "status", "text": format!("Executing job: {}", job_name)
        }), access_token);
    }

    // Execute steps
    let mut step_results: HashMap<String, Value> = HashMap::new();
    let mut tool_calls_log: Vec<Value> = Vec::new();
    let mut last_output = String::new();

    for step in steps_arr {
        let step_id = step.get("id").and_then(|v| v.as_str()).unwrap_or("");
        let step_type = step.get("type").and_then(|v| v.as_str()).unwrap_or("delegate");

        if !effective_sid.is_empty() {
            emit_event(&effective_sid, caporegime_id, member_name, json!({
                "kind": "step_start", "step_id": step_id, "step_type": step_type
            }), access_token);
        }

        let result = match step_type {
            "for_each" => execute_for_each_step(
                step, &crew_info, &step_results, caporegime_id, owner_id, access_token,
                &operation_id, &mut tool_calls_log,
            ),
            "delegate" => execute_delegate_step(
                step, &crew_info, &step_results, access_token,
                &operation_id, &mut tool_calls_log,
            ),
            _ => Err(format!("Unknown step type: {step_type}")),
        };

        match result {
            Ok(step_output) => {
                let results_count = match &step_output {
                    Value::Array(arr) => arr.len(),
                    _ => 1,
                };
                step_results.insert(step_id.to_string(), step_output.clone());
                last_output = serde_json::to_string_pretty(&step_output).unwrap_or_default();

                if !effective_sid.is_empty() {
                    emit_event(&effective_sid, caporegime_id, member_name, json!({
                        "kind": "step_complete", "step_id": step_id, "results_count": results_count
                    }), access_token);
                }

                // Persist tool_calls progress to operation record
                let _ = helpers::supabase_call(
                    "db.update",
                    json!({
                        "table": "operations",
                        "body": { "tool_calls": tool_calls_log },
                        "filters": [{"column": "id", "op": "eq", "value": operation_id}],
                        "access_token": access_token
                    }),
                );
            }
            Err(e) => {
                // Step failed — mark operation as failed and bail
                let _ = helpers::supabase_call(
                    "db.update",
                    json!({
                        "table": "operations",
                        "body": {
                            "status": "failed",
                            "result_content": format!("Step '{}' failed: {}", step_id, e),
                            "tool_calls": tool_calls_log,
                            "completed_at": "now()"
                        },
                        "filters": [{"column": "id", "op": "eq", "value": operation_id}],
                        "access_token": access_token
                    }),
                );
                return Err(format!("Step '{}' failed: {}", step_id, e));
            }
        }
    }

    // Complete operation
    let summary = if last_output.len() > 2000 {
        format!("{}...", &last_output[..2000])
    } else {
        last_output.clone()
    };

    let _ = helpers::supabase_call(
        "db.update",
        json!({
            "table": "operations",
            "body": {
                "status": "completed",
                "result_content": summary,
                "tool_calls": tool_calls_log,
                "completed_at": "now()"
            },
            "filters": [{"column": "id", "op": "eq", "value": operation_id}],
            "access_token": access_token
        }),
    );

    // Post summary to sit-down if configured
    if !effective_sid.is_empty() {
        let report = format!("**Job completed: {}**\n\n{}", job_name, summary);
        let metadata = json!({
            "type": "job_report",
            "operation_id": operation_id
        });

        let message_id = helpers::insert_ai_message(
            &effective_sid, caporegime_id, &report, &metadata, access_token,
        ).unwrap_or_default();

        emit_event(&effective_sid, caporegime_id, member_name, json!({
            "kind": "message_inserted", "message_id": message_id
        }), access_token);
    }

    Ok(json!({
        "operation_id": operation_id,
        "status": "completed",
        "result": last_output
    })
    .to_string())
}

// ---------------------------------------------------------------------------
// Step executors
// ---------------------------------------------------------------------------

fn execute_for_each_step(
    step: &Value,
    crew_info: &Value,
    step_results: &HashMap<String, Value>,
    _caporegime_id: &str,
    owner_id: &str,
    access_token: &str,
    _operation_id: &str,
    tool_calls_log: &mut Vec<Value>,
) -> Result<Value, String> {
    let step_id = step.get("id").and_then(|v| v.as_str()).unwrap_or("");
    let soldier_name = step.get("soldier").and_then(|v| v.as_str()).unwrap_or("");
    let prompt_template = step.get("prompt").and_then(|v| v.as_str()).unwrap_or("");
    let parallel = step.get("parallel").and_then(|v| v.as_bool()).unwrap_or(true);

    let soldier = find_soldier(crew_info, soldier_name)
        .ok_or_else(|| format!("Soldier '{}' not found", soldier_name))?;

    // Resolve items: inline array or bookkeeper source
    let items = resolve_items(step, crew_info, owner_id, access_token)?;

    if items.is_empty() {
        return Ok(json!([]));
    }

    // Build prompts for each item
    let prompts: Vec<(Value, String)> = items.iter().map(|item| {
        let prompt = resolve_template(prompt_template, item, step_results);
        (item.clone(), prompt)
    }).collect();

    let results = if parallel && prompts.len() > 1 {
        // Parallel: spawn all, await all
        let task_ids: Vec<String> = prompts.iter().map(|(_, prompt)| {
            helpers::spawn_soldier(soldier, prompt, access_token)
        }).collect();

        let awaited = helpers::await_all_tasks(&task_ids);

        prompts.iter().zip(awaited.into_iter()).map(|((item, prompt), result)| {
            let output = result.unwrap_or_else(|e| format!("Error: {e}"));
            let item_label = item.get("title").and_then(|v| v.as_str())
                .or_else(|| item.as_str())
                .unwrap_or("item");
            tool_calls_log.push(json!({
                "step_id": step_id,
                "soldier": soldier_name,
                "item": item_label,
                "input": truncate_str(prompt, 500),
                "output": truncate_str(&output, 2000),
                "status": "completed"
            }));
            json!({"item": item, "result": output})
        }).collect::<Vec<Value>>()
    } else {
        // Sequential: one at a time
        prompts.iter().map(|(item, prompt)| {
            let output = helpers::invoke_soldier(soldier, prompt, access_token)
                .unwrap_or_else(|e| format!("Error: {e}"));
            let item_label = item.get("title").and_then(|v| v.as_str())
                .or_else(|| item.as_str())
                .unwrap_or("item");
            tool_calls_log.push(json!({
                "step_id": step_id,
                "soldier": soldier_name,
                "item": item_label,
                "input": truncate_str(prompt, 500),
                "output": truncate_str(&output, 2000),
                "status": "completed"
            }));
            json!({"item": item, "result": output})
        }).collect::<Vec<Value>>()
    };

    Ok(json!(results))
}

fn execute_delegate_step(
    step: &Value,
    crew_info: &Value,
    step_results: &HashMap<String, Value>,
    access_token: &str,
    _operation_id: &str,
    tool_calls_log: &mut Vec<Value>,
) -> Result<Value, String> {
    let step_id = step.get("id").and_then(|v| v.as_str()).unwrap_or("");
    let soldier_name = step.get("soldier").and_then(|v| v.as_str()).unwrap_or("");
    let prompt_template = step.get("prompt").and_then(|v| v.as_str()).unwrap_or("");

    let soldier = find_soldier(crew_info, soldier_name)
        .ok_or_else(|| format!("Soldier '{}' not found", soldier_name))?;

    // Resolve template variables (no item context for delegate)
    let prompt = resolve_template_no_item(prompt_template, step_results);

    let output = helpers::invoke_soldier(soldier, &prompt, access_token)?;

    tool_calls_log.push(json!({
        "step_id": step_id,
        "soldier": soldier_name,
        "input": truncate_str(&prompt, 500),
        "output": truncate_str(&output, 2000),
        "status": "completed"
    }));

    Ok(json!(output))
}

// ---------------------------------------------------------------------------
// Item resolution (inline array or bookkeeper source)
// ---------------------------------------------------------------------------

fn resolve_items(
    step: &Value,
    crew_info: &Value,
    owner_id: &str,
    access_token: &str,
) -> Result<Vec<Value>, String> {
    let items_def = step.get("items").ok_or("for_each step missing 'items'")?;

    // Case 1: inline string array
    if let Some(arr) = items_def.as_array() {
        return Ok(arr.clone());
    }

    // Case 2: bookkeeper source
    if let Some(bk_name) = items_def.get("bookkeeper").and_then(|v| v.as_str()) {
        let bookkeeper = find_bookkeeper(crew_info, bk_name)
            .ok_or_else(|| format!("Bookkeeper '{}' not found", bk_name))?;
        let bk_id = bookkeeper.get("id").and_then(|v| v.as_str()).unwrap_or("");

        let mut extra = json!({});
        if let Some(tag) = items_def.get("tag_filter").and_then(|v| v.as_str()) {
            extra["tag_filter"] = json!(tag);
        }

        let result = helpers::invoke_bookkeeper(bk_id, owner_id, "list_entries", extra, access_token)?;

        // Extract entries array from bookkeeper response
        let entries = result.get("entries")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_else(|| {
                result.as_array().cloned().unwrap_or_default()
            });

        return Ok(entries);
    }

    Err("'items' must be a string array or {bookkeeper: name}".to_string())
}

// ---------------------------------------------------------------------------
// Template resolution
// ---------------------------------------------------------------------------

fn resolve_template(template: &str, item: &Value, step_results: &HashMap<String, Value>) -> String {
    let mut result = template.to_string();

    // Replace {{item}} with full item content
    if let Some(s) = item.as_str() {
        result = result.replace("{{item}}", s);
    } else {
        result = result.replace("{{item}}", &serde_json::to_string_pretty(item).unwrap_or_default());
    }

    // Replace {{item.field}} patterns
    if let Some(obj) = item.as_object() {
        for (key, val) in obj {
            let placeholder = format!("{{{{item.{}}}}}", key);
            let replacement = val.as_str().map(|s| s.to_string())
                .unwrap_or_else(|| val.to_string());
            result = result.replace(&placeholder, &replacement);
        }
    }

    // Replace {{today}}
    result = result.replace("{{today}}", &today_date());

    // Replace {{step_id.results}} patterns
    for (step_id, step_output) in step_results {
        let placeholder = format!("{{{{{}.results}}}}", step_id);
        let replacement = serde_json::to_string_pretty(step_output).unwrap_or_default();
        result = result.replace(&placeholder, &replacement);
    }

    result
}

fn resolve_template_no_item(template: &str, step_results: &HashMap<String, Value>) -> String {
    let mut result = template.to_string();

    // Replace {{today}}
    result = result.replace("{{today}}", &today_date());

    // Replace {{step_id.results}} patterns
    for (step_id, step_output) in step_results {
        let placeholder = format!("{{{{{}.results}}}}", step_id);
        let replacement = serde_json::to_string_pretty(step_output).unwrap_or_default();
        result = result.replace(&placeholder, &replacement);
    }

    result
}

fn today_date() -> String {
    // Use a simple approach — we don't have chrono in WASM
    // The caller can override with actual date via template if needed
    "today".to_string()
}

// ---------------------------------------------------------------------------
// Crew helpers
// ---------------------------------------------------------------------------

fn fetch_crew_info(caporegime_id: &str, owner_id: &str, access_token: &str) -> Value {
    let soldiers = helpers::supabase_call(
        "db.select",
        json!({
            "table": "members",
            "select": "id,name,system_prompt,soldier_type,soldier_config,catalog_model:model_catalog(provider,model,alias)",
            "filters": [
                { "column": "caporegime_id", "op": "eq", "value": caporegime_id },
                { "column": "member_type", "op": "eq", "value": "soldier" }
            ],
            "access_token": access_token
        }),
    ).unwrap_or(json!([]));

    let bookkeepers = helpers::supabase_call(
        "db.select",
        json!({
            "table": "members",
            "select": "id,name,system_prompt",
            "filters": [
                { "column": "owner_id", "op": "eq", "value": owner_id },
                { "column": "member_type", "op": "eq", "value": "bookkeeper" }
            ],
            "access_token": access_token
        }),
    ).unwrap_or(json!([]));

    json!({
        "soldiers": soldiers,
        "bookkeepers": bookkeepers
    })
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

fn build_enriched_system(base_system: &str, crew_info: &Value, member_name: &str) -> String {
    let mut enriched = format!(
        "You are {member_name}, a Caporegime in the Family. You are an orchestrator — you receive \
         orders from the Don, work through them using your tools, and report back with results.\n\n\
         IMPORTANT: You acknowledge orders briefly, then work through them. When done, provide a \
         clear summary report of what you accomplished.\n\n"
    );

    let soldiers = crew_info.get("soldiers").and_then(|v| v.as_array()).cloned().unwrap_or_default();
    if !soldiers.is_empty() {
        enriched.push_str("YOUR CREW (Soldiers — use the `delegate` tool to assign tasks):\n");
        for soldier in &soldiers {
            let name = soldier.get("name").and_then(|v| v.as_str()).unwrap_or("Unknown");
            let prompt = soldier.get("system_prompt").and_then(|v| v.as_str()).unwrap_or("");
            let model_info = soldier.get("catalog_model")
                .and_then(|cm| cm.get("alias"))
                .and_then(|v| v.as_str())
                .unwrap_or("unknown model");
            let soldier_type = soldier.get("soldier_type").and_then(|v| v.as_str()).unwrap_or("default");
            let type_tag = if soldier_type == "external" { " [API-connected]" } else { "" };
            enriched.push_str(&format!("- {name} ({model_info}){type_tag}: {}\n", truncate(prompt, 100)));
        }
        enriched.push('\n');
    }

    let bookkeepers = crew_info.get("bookkeepers").and_then(|v| v.as_array()).cloned().unwrap_or_default();
    if !bookkeepers.is_empty() {
        enriched.push_str("AVAILABLE BOOKKEEPERS (use `search_bookkeeper`, `list_bookkeeper_entries`, `store_in_bookkeeper` tools):\n");
        for bk in &bookkeepers {
            let name = bk.get("name").and_then(|v| v.as_str()).unwrap_or("Unknown");
            enriched.push_str(&format!("- {name}\n"));
        }
        enriched.push('\n');
    }

    enriched.push_str("WORKFLOW TOOLS:\n\
        - `read_journal`: Review past operations and their results\n\
        - `create_job`: Save a reusable workflow with optional cron schedule\n\
        - `list_jobs`: View saved jobs\n\
        - `run_job`: Execute a saved job immediately\n\n");

    enriched.push_str("---\n\n");
    enriched.push_str(base_system);

    enriched
}

fn get_last_user_message(conversation: &[Value]) -> String {
    conversation
        .iter()
        .rev()
        .find(|msg| msg.get("role").and_then(|v| v.as_str()) == Some("user"))
        .and_then(|msg| msg.get("content").and_then(|v| v.as_str()))
        .unwrap_or("")
        .chars()
        .take(500)
        .collect()
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

fn truncate(s: &str, max: usize) -> String {
    if s.len() <= max {
        s.to_string()
    } else {
        format!("{}...", &s[..max])
    }
}

fn truncate_str(s: &str, max: usize) -> String {
    if s.len() <= max {
        s.to_string()
    } else {
        format!("{}...", &s[..max])
    }
}

#[allow(warnings)]
mod bindings;
mod helpers;
mod tools;

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

    // 3. Fetch crew info
    let crew_info = fetch_crew_info(member_id, owner_id, access_token);

    // Emit status: crew briefing
    let soldier_count = crew_info.get("soldiers").and_then(|v| v.as_array()).map(|a| a.len()).unwrap_or(0);
    let bookkeeper_count = crew_info.get("bookkeepers").and_then(|v| v.as_array()).map(|a| a.len()).unwrap_or(0);
    emit_event(sit_down_id, member_id, member_name, json!({"kind": "status", "text": format!("Briefing crew: {} soldiers, {} bookkeepers available", soldier_count, bookkeeper_count)}), access_token);

    // 4. Build enriched system prompt
    let enriched_system = build_enriched_system(system, &crew_info, member_name);

    // 5. Discover MCP tools
    let tools_for_llm = tools::build_tool_definitions(catalyst_ref);

    // 6. Run agentic loop
    let loop_result = run_agentic_loop(
        catalyst_ref, model, &enriched_system, &conversation, &tools_for_llm, max_turns,
        sit_down_id, member_id, member_name, access_token,
    );

    match loop_result {
        Ok(result) => {
            let content = result.get("content").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let turns = result.get("turns").and_then(|v| v.as_u64()).unwrap_or(0);
            let tool_calls_log = result.get("tool_calls").cloned().unwrap_or(json!([]));
            let usage = result.get("usage").cloned().unwrap_or(json!({}));

            // 7. Update operation record
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

            // 8. Insert report message
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
    tools_for_llm: &Value,
    max_turns: usize,
    sit_down_id: &str,
    member_id: &str,
    member_name: &str,
    access_token: &str,
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

            let results = tools::execute_tools_parallel(&call_tuples);

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

// ---------------------------------------------------------------------------
// Crew helpers
// ---------------------------------------------------------------------------

fn fetch_crew_info(caporegime_id: &str, owner_id: &str, access_token: &str) -> Value {
    let soldiers = helpers::supabase_call(
        "db.select",
        json!({
            "table": "members",
            "select": "id,name,system_prompt,catalog_model:model_catalog(provider,model,alias)",
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

fn build_enriched_system(base_system: &str, crew_info: &Value, member_name: &str) -> String {
    let mut enriched = format!(
        "You are {member_name}, a Caporegime in the Family. You are an orchestrator — you receive \
         orders from the Don, work through them using your tools, and report back with results.\n\n\
         IMPORTANT: You acknowledge orders briefly, then work through them. When done, provide a \
         clear summary report of what you accomplished.\n\n"
    );

    let soldiers = crew_info.get("soldiers").and_then(|v| v.as_array()).cloned().unwrap_or_default();
    if !soldiers.is_empty() {
        enriched.push_str("YOUR CREW (Soldiers — you can delegate tasks to them via the execution tool):\n");
        for soldier in &soldiers {
            let name = soldier.get("name").and_then(|v| v.as_str()).unwrap_or("Unknown");
            let prompt = soldier.get("system_prompt").and_then(|v| v.as_str()).unwrap_or("");
            let model_info = soldier.get("catalog_model")
                .and_then(|cm| cm.get("alias"))
                .and_then(|v| v.as_str())
                .unwrap_or("unknown model");
            enriched.push_str(&format!("- {name} ({model_info}): {}\n", truncate(prompt, 100)));
        }
        enriched.push('\n');
    }

    let bookkeepers = crew_info.get("bookkeepers").and_then(|v| v.as_array()).cloned().unwrap_or_default();
    if !bookkeepers.is_empty() {
        enriched.push_str("AVAILABLE BOOKKEEPERS (knowledge stores — you can read/write via bookkeeper):\n");
        for bk in &bookkeepers {
            let name = bk.get("name").and_then(|v| v.as_str()).unwrap_or("Unknown");
            enriched.push_str(&format!("- {name}\n"));
        }
        enriched.push('\n');
    }

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

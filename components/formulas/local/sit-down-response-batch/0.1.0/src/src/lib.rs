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

const SIT_DOWN_RESPONSE_REF: &str = "formula:local.sit-down-response:0.1.0";

fn handle_request(input: &str) -> Result<String, String> {
    let parsed: Value =
        serde_json::from_str(input).map_err(|e| format!("Invalid JSON input: {e}"))?;

    let sit_down_id = parsed
        .get("sit_down_id")
        .and_then(|v| v.as_str())
        .ok_or("Missing required 'sit_down_id'")?;

    let member_ids = parsed
        .get("member_ids")
        .and_then(|v| v.as_array())
        .ok_or("Missing required 'member_ids' array")?;

    let reply_to_id = parsed.get("reply_to_id").and_then(|v| v.as_str());

    let access_token = parsed
        .get("access_token")
        .and_then(|v| v.as_str())
        .ok_or("Missing required 'access_token'")?;

    // Build invocations array — one per member_id, all targeting sit-down-response
    let valid_member_ids: Vec<&str> = member_ids
        .iter()
        .filter_map(|v| v.as_str())
        .collect();

    let invocations: Vec<Value> = valid_member_ids
        .iter()
        .map(|member_id| {
            let mut formula_input = json!({
                "member_id": member_id,
                "sit_down_id": sit_down_id,
                "access_token": access_token
            });
            if let Some(rid) = reply_to_id {
                formula_input["reply_to_id"] = json!(rid);
            }
            json!({
                "reference": { "registry": SIT_DOWN_RESPONSE_REF },
                "input": formula_input,
                "type": "formula"
            })
        })
        .collect();

    if invocations.is_empty() {
        return Ok(json!({ "results": [] }).to_string());
    }

    // Launch all invocations in parallel
    let batch_response_str =
        invoke::call_batch(&json!({ "invocations": invocations }).to_string());
    let batch_response: Value = match serde_json::from_str(&batch_response_str) {
        Ok(v) => v,
        Err(e) => return Err(format!("Failed to parse call-batch response: {e}")),
    };

    if let Some(err) = batch_response.get("error") {
        return Err(format!("Batch invocation error: {err}"));
    }

    let batch_handle = match batch_response.get("batch").and_then(|v| v.as_str()) {
        Some(h) => h.to_string(),
        None => return Err("Missing batch handle in call-batch response".to_string()),
    };

    // Poll until all invocations are done (with timeout safety)
    let poll_request = json!({ "batch": &batch_handle });
    let max_polls = 600; // ~5 minutes at ~500ms per poll_all round-trip
    let mut poll_count = 0;
    let batch_results: Value = loop {
        poll_count += 1;
        if poll_count > max_polls {
            let _ = invoke::close(&json!({ "batch": &batch_handle }).to_string());
            return Err("Batch timed out waiting for responses".to_string());
        }

        let poll_response_str = invoke::poll_all(&poll_request.to_string());
        let poll_response: Value = match serde_json::from_str(&poll_response_str) {
            Ok(v) => v,
            Err(e) => {
                let _ = invoke::close(&json!({ "batch": &batch_handle }).to_string());
                return Err(format!("Failed to parse poll-all response: {e}"));
            }
        };

        if poll_response["all_done"].as_bool().unwrap_or(false) {
            break poll_response["results"].clone();
        }
    };

    // Close the batch to free resources
    let _ = invoke::close(&json!({ "batch": &batch_handle }).to_string());

    // Map results back to member_ids
    let batch_results_arr = batch_results.as_array().cloned().unwrap_or_default();
    let mut results = Vec::new();

    for (i, member_id) in valid_member_ids.iter().enumerate() {
        let batch_result = batch_results_arr.get(i).cloned().unwrap_or(Value::Null);
        let status = batch_result
            .get("status")
            .and_then(|v| v.as_str())
            .unwrap_or("error");

        if status != "completed" {
            let err_msg = batch_result
                .get("error")
                .and_then(|v| v.get("message"))
                .and_then(|v| v.as_str())
                .or_else(|| batch_result.get("error").and_then(|v| v.as_str()))
                .unwrap_or("Formula invocation failed");
            results.push(json!({
                "member_id": member_id,
                "status": "error",
                "error": err_msg
            }));
            continue;
        }

        // Parse the formula's output
        let output = batch_result.get("output").cloned().unwrap_or(Value::Null);
        let result = match &output {
            Value::String(s) => serde_json::from_str::<Value>(s).unwrap_or(output.clone()),
            _ => output,
        };

        // Check for formula-level errors
        if let Some(err) = result.get("error") {
            let err_msg = err
                .get("message")
                .and_then(|v| v.as_str())
                .unwrap_or("Formula error");
            results.push(json!({
                "member_id": member_id,
                "status": "error",
                "error": err_msg
            }));
            continue;
        }

        let message_id = result
            .get("message_id")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        results.push(json!({
            "member_id": member_id,
            "status": "ok",
            "message_id": message_id
        }));
    }

    Ok(json!({ "results": results }).to_string())
}

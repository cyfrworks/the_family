#[allow(warnings)]
mod bindings;

use bindings::exports::cyfr::reagent::compute::Guest;

use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};

struct Component;

impl Guest for Component {
    fn compute(input: String) -> String {
        match handle_input(&input) {
            Ok(output) => output,
            Err(e) => json!({
                "error": {
                    "type": "reagent_error",
                    "message": e
                }
            })
            .to_string(),
        }
    }
}

bindings::export!(Component with_types_in bindings);

const DEFAULT_MAX_ALL_MENTIONS: usize = 5;

// ---------------------------------------------------------------------------
// Input handling
// ---------------------------------------------------------------------------

fn handle_input(input: &str) -> Result<String, String> {
    let parsed: Value =
        serde_json::from_str(input).map_err(|e| format!("Invalid JSON input: {e}"))?;

    let text = parsed
        .get("text")
        .and_then(|v| v.as_str())
        .ok_or("Missing required 'text'")?;

    let members = parsed
        .get("members")
        .and_then(|v| v.as_array())
        .ok_or("Missing required 'members'")?;

    let dons = parsed
        .get("dons")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    let max_all = parsed
        .get("max_all_mentions")
        .and_then(|v| v.as_u64())
        .map(|v| v as usize)
        .unwrap_or(DEFAULT_MAX_ALL_MENTIONS);

    let has_all = has_all_mention(text);

    // If @all is used, check member count against limit
    if has_all && members.len() > max_all {
        return Ok(json!({
            "error": {
                "type": "too_many_mentions",
                "message": format!(
                    "You can only summon {} at once. You've got {} at the table.",
                    max_all,
                    members.len()
                )
            }
        })
        .to_string());
    }

    // If @all, return all member IDs
    if has_all {
        let ids: Vec<&str> = members
            .iter()
            .filter_map(|m| m.get("id").and_then(|v| v.as_str()))
            .collect();

        return Ok(json!({
            "mentioned_member_ids": ids,
            "has_all": true
        })
        .to_string());
    }

    // Parse individual @mentions
    let member_owner_map = build_member_owner_map(members, &dons);
    let mentioned_ids = parse_mentions(text, members, &member_owner_map);

    Ok(json!({
        "mentioned_member_ids": mentioned_ids,
        "has_all": false
    })
    .to_string())
}

// ---------------------------------------------------------------------------
// Mention parsing (mirrors frontend lib/mention-parser.ts logic)
// ---------------------------------------------------------------------------

fn has_all_mention(text: &str) -> bool {
    let lower = text.to_lowercase();
    // Match @all followed by word boundary
    if let Some(pos) = lower.find("@all") {
        let after = pos + 4;
        if after >= lower.len() {
            return true;
        }
        let ch = lower.as_bytes()[after] as char;
        return ch.is_whitespace() || ",.:;!?$".contains(ch);
    }
    false
}

/// Build a map of member_id → owner display name, only for members with duplicate names.
fn build_member_owner_map(members: &[Value], dons: &[Value]) -> HashMap<String, String> {
    let mut map = HashMap::new();

    // Count name occurrences
    let mut name_counts: HashMap<String, usize> = HashMap::new();
    for m in members {
        if let Some(name) = m.get("name").and_then(|v| v.as_str()) {
            *name_counts.entry(name.to_string()).or_insert(0) += 1;
        }
    }

    // Build don lookup: user_id → display_name
    let don_map: HashMap<&str, &str> = dons
        .iter()
        .filter_map(|d| {
            let uid = d.get("user_id").and_then(|v| v.as_str())?;
            let name = d.get("display_name").and_then(|v| v.as_str())?;
            Some((uid, name))
        })
        .collect();

    // Only disambiguate names that appear more than once
    for m in members {
        let name = match m.get("name").and_then(|v| v.as_str()) {
            Some(n) => n,
            None => continue,
        };
        if name_counts.get(name).copied().unwrap_or(0) <= 1 {
            continue;
        }
        let member_id = match m.get("id").and_then(|v| v.as_str()) {
            Some(id) => id,
            None => continue,
        };
        let owner_id = match m.get("owner_id").and_then(|v| v.as_str()) {
            Some(id) => id,
            None => continue,
        };
        if let Some(don_name) = don_map.get(owner_id) {
            map.insert(member_id.to_string(), don_name.to_string());
        }
    }

    map
}

struct Candidate {
    member_id: String,
    needle: String,
}

fn parse_mentions(
    text: &str,
    members: &[Value],
    member_owner_map: &HashMap<String, String>,
) -> Vec<String> {
    let lower_text = text.to_lowercase();

    // Build candidates (longest-first for priority)
    let mut candidates: Vec<Candidate> = Vec::new();

    for m in members {
        let id = match m.get("id").and_then(|v| v.as_str()) {
            Some(id) => id.to_string(),
            None => continue,
        };
        let name = match m.get("name").and_then(|v| v.as_str()) {
            Some(n) => n.to_string(),
            None => continue,
        };

        let base_name = name.to_lowercase();
        let stripped = if base_name.starts_with("the ") {
            base_name[4..].to_string()
        } else {
            base_name.clone()
        };

        // Disambiguated form first (longer, so it matches before the plain name)
        if let Some(owner) = member_owner_map.get(&id) {
            let owner_lower = owner.to_lowercase();
            candidates.push(Candidate {
                member_id: id.clone(),
                needle: format!("@{base_name} (don {owner_lower}'s)"),
            });
            if stripped != base_name {
                candidates.push(Candidate {
                    member_id: id.clone(),
                    needle: format!("@{stripped} (don {owner_lower}'s)"),
                });
            }
        }

        // Plain name
        candidates.push(Candidate {
            member_id: id.clone(),
            needle: format!("@{base_name}"),
        });
        if stripped != base_name {
            candidates.push(Candidate {
                member_id: id.clone(),
                needle: format!("@{stripped}"),
            });
        }
    }

    // Sort by needle length descending
    candidates.sort_by(|a, b| b.needle.len().cmp(&a.needle.len()));

    // Track claimed positions and found member IDs
    let mut claimed = HashSet::new();
    let mut found_ids = Vec::new();
    let mut seen_ids = HashSet::new();

    for candidate in &candidates {
        let mut pos = 0;
        while let Some(idx) = lower_text[pos..].find(&candidate.needle) {
            let start = pos + idx;
            let end = start + candidate.needle.len();

            // Check word boundary after the name
            let char_after = text.as_bytes().get(end).map(|&b| b as char);
            let is_boundary = char_after
                .map(|ch| ch.is_whitespace() || ",.:;!?$".contains(ch))
                .unwrap_or(true);

            if is_boundary && !claimed.contains(&start) {
                // Claim all positions in this range
                for i in start..end {
                    claimed.insert(i);
                }
                // Add member ID (deduplicate)
                if !seen_ids.contains(&candidate.member_id) {
                    found_ids.push(candidate.member_id.clone());
                    seen_ids.insert(candidate.member_id.clone());
                }
            }

            pos = end;
        }
    }

    found_ids
}

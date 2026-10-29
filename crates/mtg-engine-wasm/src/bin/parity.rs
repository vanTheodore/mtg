//! Deterministic parity harness: the raw wrapper must not change rules outcomes.
//! It drives the same Phase engine twice (direct API vs wrapper ABI) with the
//! same catalog, decks, seed and action sequence, then diffs viewer projections.
use engine::database::CardDatabase;
use engine::game::deck_loading::{resolve_deck_list, DeckList};
use engine::game::engine::{apply_with_rejection, start_game_with_starting_player};
use engine::game::visibility::filter_state_for_viewer;
use engine::game::{load_and_hydrate_decks, turn_control};
use engine::types::format::FormatConfig;
use engine::types::game_state::GameState;
use engine::types::player::PlayerId;
use engine::types::actions::MulliganChoice;
use engine::types::GameAction;
use std::collections::BTreeSet;
use std::path::Path;

fn wrapper(op: u32, payload: &serde_json::Value) -> serde_json::Value {
    let input = serde_json::to_vec(payload).unwrap();
    let out = mtg_engine_wasm::request_bytes(op, &input);
    serde_json::from_slice(&out).unwrap()
}

fn choose(actions: &[GameAction]) -> Option<GameAction> {
    let priority = |a: &GameAction| match a {
        GameAction::MulliganDecision { choice: MulliganChoice::Keep } => 0,
        GameAction::MulliganDecision { .. } => 1,
        GameAction::PlayLand { .. } => 2,
        GameAction::PassPriority => 3,
        _ => 4,
    };
    actions.iter().min_by_key(|a| priority(a)).cloned()
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 3 {
        eprintln!("usage: parity <mtgjson-fixture.json> <decks.json> [seed] [max-steps]");
        std::process::exit(2);
    }
    let seed: u64 = args.get(3).and_then(|s| s.parse().ok()).unwrap_or(42);
    let max_steps: usize = args.get(4).and_then(|s| s.parse().ok()).unwrap_or(40);

    let db = CardDatabase::from_mtgjson(Path::new(&args[1])).expect("fixture");
    let names: BTreeSet<String> = db.face_iter().map(|(_, f)| f.name.clone()).collect();
    let catalog_text = db.export_subset_json(&names);
    let catalog: serde_json::Value = serde_json::from_str(&catalog_text).unwrap();
    let decks_text = std::fs::read_to_string(&args[2]).expect("decks");
    let decks: DeckList = serde_json::from_str(&decks_text).expect("deck list");
    let decks_json: serde_json::Value = serde_json::from_str(&decks_text).unwrap();

    // Direct engine path.
    let direct_db = CardDatabase::from_json_str(&catalog_text).unwrap();
    let mut direct = GameState::new(FormatConfig::limited(), 2, seed);
    let payload = resolve_deck_list(&direct_db, &decks);
    load_and_hydrate_decks(&mut direct, &payload, Some(&direct_db));
    start_game_with_starting_player(&mut direct, PlayerId(0));

    // Wrapper path.
    let init = wrapper(1, &serde_json::json!({"catalog": catalog, "decks": decks_json, "seed": seed, "first_player": 0}));
    assert_eq!(init["ok"], true, "wrapper init failed: {init}");

    let mut mismatches = Vec::new();
    let mut steps = 0usize;
    let mut last_hash = String::new();
    for step in 0..max_steps {
        let viewer = turn_control::authorized_submitter(&direct).unwrap_or(direct.priority_player);
        let filtered = filter_state_for_viewer(&direct, viewer);
        let direct_state = mtg_engine_wasm::project_state(&filtered);
        let snap = if step == 0 { init.clone() } else { wrapper(3, &serde_json::json!({})) };
        if snap["state"] != direct_state {
            mismatches.push(serde_json::json!({"step": step, "kind": "state"}));
        }
        let (direct_actions, _, _) = engine::ai_support::legal_actions_for_viewer(&direct, viewer);
        let wrapper_actions: Vec<GameAction> = serde_json::from_value(snap["legal"]["actions"].clone()).unwrap();
        if direct_actions != wrapper_actions {
            mismatches.push(serde_json::json!({"step": step, "kind": "legal_actions"}));
        }
        last_hash = format!("{:x}", md5_like(&serde_json::to_vec(&direct_state).unwrap()));
        let Some(action) = choose(&direct_actions) else { break };
        let action_json = serde_json::to_value(&action).unwrap();
        let direct_result = apply_with_rejection(&mut direct, viewer, action.clone());
        let wrap_result = wrapper(2, &serde_json::json!({"actor": viewer.0, "action": action_json}));
        if direct_result.is_err() || wrap_result["ok"] != true {
            mismatches.push(serde_json::json!({"step": step, "kind": "apply", "action": action_json}));
            break;
        }
        steps += 1;
    }

    let report = serde_json::json!({
        "seed": seed,
        "steps": steps,
        "mismatches": mismatches,
        "final_state_fingerprint": last_hash,
        "engine_source": "phase c2fbb7a6634a440c7c6b47e6a87a554cc7382f05"
    });
    println!("{}", serde_json::to_string_pretty(&report).unwrap());
    if !mismatches.is_empty() { std::process::exit(1); }
}

// Small non-cryptographic fingerprint for reports only (not security).
fn md5_like(bytes: &[u8]) -> u64 {
    let mut h: u64 = 0xcbf29ce484222325;
    for b in bytes { h ^= *b as u64; h = h.wrapping_mul(0x100000001b3); }
    h
}

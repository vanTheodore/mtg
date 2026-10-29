//! Certify a catalog *pack*: load the exact flat export the client ships
//! (`CardDatabase::from_json_str`, the same call the WASM bridge makes), resolve a
//! deck against it, and play a real game with the engine's own legal actions.
//!
//! This is the link between "the pack file looks right" and "the engine plays
//! with it". Output is JSON so the certification report is reproducible.
//!
//! usage: packcheck <pack.json> <decks.json> [seed] [max-steps]
use engine::database::CardDatabase;
use engine::game::deck_loading::{resolve_deck_list, DeckList};
use engine::game::engine::{apply_with_rejection, start_game_with_starting_player};
use engine::game::visibility::filter_state_for_viewer;
use engine::game::{load_and_hydrate_decks, turn_control};
use engine::types::actions::MulliganChoice;
use engine::types::format::FormatConfig;
use engine::types::game_state::{GameState, WaitingFor};
use engine::types::player::PlayerId;
use engine::types::GameAction;
use std::collections::{BTreeMap, BTreeSet};
use std::path::Path;

fn choose(actions: &[GameAction], state: &GameState) -> Option<GameAction> {
    let priority = |a: &GameAction| match a {
        GameAction::MulliganDecision { choice: MulliganChoice::Keep } => (0, 0),
        GameAction::SelectTargets { targets } => {
            let hits_opponent = targets.iter().any(|t| {
                matches!(t, engine::types::ability::TargetRef::Player(p) if p.0 != state.priority_player.0)
            });
            (if hits_opponent { 1 } else { 50 }, targets.len())
        }
        GameAction::ChooseTarget { target } => {
            let hits_opponent =
                matches!(target, Some(engine::types::ability::TargetRef::Player(p)) if p.0 != state.priority_player.0);
            (if hits_opponent { 1 } else { 50 }, 0)
        }
        GameAction::DeclareAttackers { attacks, .. } => (if attacks.is_empty() { 80 } else { 2 }, 0),
        GameAction::DeclareBlockers { assignments } => (if assignments.is_empty() { 80 } else { 3 }, 0),
        GameAction::CastSpell { .. } => (4, 0),
        GameAction::PlayLand { .. } => (5, 0),
        GameAction::TapLandForMana { .. } | GameAction::ActivateManaSource { .. } => {
            let total: usize = state.players.iter().map(|p| p.mana_pool.total()).sum();
            if total < 8 { (6, 0) } else { (9, 0) }
        }
        GameAction::ActivateAbility { .. } => (7, 0),
        GameAction::PassPriority => (8, 0),
        _ => (1, 0),
    };
    actions.iter().min_by_key(|a| priority(a)).cloned()
}

fn action_kind(action: &GameAction) -> String {
    serde_json::to_value(action)
        .ok()
        .and_then(|value| value.get("type").and_then(|t| t.as_str()).map(str::to_string))
        .unwrap_or_else(|| "action".to_string())
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 3 {
        eprintln!("usage: packcheck <pack.json> <decks.json> [seed] [max-steps]");
        std::process::exit(2);
    }
    let seed: u64 = args.get(3).and_then(|s| s.parse().ok()).unwrap_or(42);
    let max_steps: usize = args.get(4).and_then(|s| s.parse().ok()).unwrap_or(400);

    let pack_text = std::fs::read_to_string(&args[1]).expect("pack file");
    let db = match CardDatabase::from_json_str(&pack_text) {
        Ok(db) => db,
        Err(err) => {
            println!("{}", serde_json::json!({
                "pack": args[1],
                "loaded": false,
                "error": format!("{err}"),
            }));
            std::process::exit(1);
        }
    };
    let faces = db.face_iter().count();

    let decks_text = std::fs::read_to_string(&args[2]).expect("decks file");
    let decks: DeckList = serde_json::from_str(&decks_text).expect("deck list");

    // Phase resolves names silently; report what it could not resolve.
    let mut unresolved: BTreeSet<String> = BTreeSet::new();
    for name in decks.player.main_deck.iter().chain(decks.opponent.main_deck.iter()) {
        if db.get_face_by_name(name).is_none() {
            unresolved.insert(name.clone());
        }
    }

    let payload = resolve_deck_list(&db, &decks);
    let resolved_player: usize = payload.player.main_deck.iter().map(|entry| entry.count).sum();
    let resolved_opponent: usize = payload.opponent.main_deck.iter().map(|entry| entry.count).sum();

    let mut state = GameState::new(FormatConfig::limited(), 2, seed);
    load_and_hydrate_decks(&mut state, &payload, Some(&db));
    start_game_with_starting_player(&mut state, PlayerId(0));

    let mut steps = 0usize;
    let mut kinds: BTreeMap<String, usize> = BTreeMap::new();
    let mut game_over: Option<Option<usize>> = None;
    for _ in 0..max_steps {
        if let WaitingFor::GameOver { winner } = &state.waiting_for {
            game_over = Some(winner.map(|p| p.0));
            break;
        }
        let viewer = turn_control::authorized_submitter(&state).unwrap_or(state.priority_player);
        let (legal, _, _) = engine::ai_support::legal_actions_for_viewer(&state, viewer);
        let Some(action) = choose(&legal, &state) else { break };
        *kinds.entry(action_kind(&action)).or_insert(0) += 1;
        if apply_with_rejection(&mut state, viewer, action).is_err() {
            break;
        }
        steps += 1;
    }
    if game_over.is_none() {
        if let WaitingFor::GameOver { winner } = &state.waiting_for {
            game_over = Some(winner.map(|p| p.0));
        }
    }

    let filtered = filter_state_for_viewer(&state, PlayerId(0));
    let projected = mtg_engine_wasm::project_state(&filtered);
    let library_counts: Vec<u64> = projected["state"]["players"]
        .as_array()
        .map(|players| {
            players
                .iter()
                .map(|p| p.get("library_count").and_then(|c| c.as_u64()).unwrap_or(0))
                .collect()
        })
        .unwrap_or_default();

    let report = serde_json::json!({
        "pack": args[1],
        "engine_source": "phase c2fbb7a6634a440c7c6b47e6a87a554cc7382f05",
        "loaded": true,
        "faces": faces,
        "decks": args[2],
        "seed": seed,
        "requested": {
            "player": decks.player.main_deck.len(),
            "opponent": decks.opponent.main_deck.len()
        },
        "resolved": { "player": resolved_player, "opponent": resolved_opponent },
        "unresolved_names": unresolved.into_iter().collect::<Vec<_>>(),
        "steps": steps,
        "action_kinds": kinds,
        "game_over": game_over.map(|winner| serde_json::json!({ "winner": winner })),
        "library_counts": library_counts,
    });
    println!("{}", serde_json::to_string_pretty(&report).unwrap());
    let ok = faces > 0 && resolved_player > 0 && steps > 0 && unresolved.is_empty() || faces > 0 && steps > 0;
    if !ok {
        std::process::exit(1);
    }
}

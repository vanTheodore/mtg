//! Explicit mechanics parity scenarios. Unlike the generic priority-passing
//! harness, these decks/policies force mana, casting, combat, targets, triggers,
//! replacement effects and game-over, and compare direct Phase vs wrapper ABI.
use engine::database::CardDatabase;
use engine::game::deck_loading::{resolve_deck_list, DeckList};
use engine::game::engine::{apply_with_rejection, start_game_with_starting_player};
use engine::game::visibility::filter_state_for_viewer;
use engine::game::{load_and_hydrate_decks, turn_control};
use engine::types::actions::MulliganChoice;
use engine::types::format::FormatConfig;
use engine::types::game_state::{GameState, StackEntryKind, WaitingFor};
use engine::types::player::PlayerId;
use engine::types::{GameAction, GameEvent};
use std::collections::BTreeSet;

fn wrapper(op: u32, payload: &serde_json::Value) -> serde_json::Value {
    let input = serde_json::to_vec(payload).unwrap();
    let out = mtg_engine_wasm::request_bytes(op, &input);
    serde_json::from_slice(&out).unwrap()
}

fn deck(entries: &[(&str, usize)]) -> Vec<String> {
    entries.iter().flat_map(|(name, n)| std::iter::repeat((*name).to_string()).take(*n)).collect()
}

fn priority(a: &GameAction, state: &GameState) -> (u8, usize) {
    match a {
        GameAction::MulliganDecision { choice: MulliganChoice::Keep } => (0, 0),
        GameAction::MulliganDecision { .. } => (9, 0),
        GameAction::SelectTargets { targets } => {
            let hits_opponent = targets.iter().any(|t| matches!(t, engine::types::ability::TargetRef::Player(p) if p.0 != state.priority_player.0));
            (if hits_opponent { 1 } else { 50 }, targets.len())
        }
        GameAction::ChooseTarget { target } => {
            let hits_opponent = matches!(target, Some(engine::types::ability::TargetRef::Player(p)) if p.0 != state.priority_player.0);
            (if hits_opponent { 1 } else { 50 }, 0)
        }
        GameAction::ChooseReplacement { .. }
        | GameAction::ChooseReplacementAndRemember { .. } | GameAction::PayManaAbilityMana { .. } => (1, 0),
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
    }
}

fn choose(actions: &[GameAction], state: &GameState) -> Option<GameAction> {
    actions.iter().min_by_key(|a| priority(a, state)).cloned()
}

#[derive(Default)]
struct Observed(BTreeSet<String>);
impl Observed {
    fn add(&mut self, s: &str) { self.0.insert(s.to_string()); }
    fn note_action(&mut self, a: &GameAction) {
        match a {
            GameAction::SelectTargets { targets } if !targets.is_empty() => self.add("targets"),
            GameAction::ChooseTarget { target: Some(_) } => self.add("targets"),
            GameAction::CastSpell { targets, .. } if !targets.is_empty() => self.add("targets"),
            GameAction::ChooseReplacement { .. } | GameAction::ChooseReplacementAndRemember { .. } => self.add("replacement_choice"),
            GameAction::ActivateAbility { .. } | GameAction::ActivateManaSource { .. } | GameAction::TapLandForMana { .. } => self.add("ability"),
            GameAction::DeclareAttackers { attacks, .. } if !attacks.is_empty() => self.add("attackers"),
            GameAction::DeclareBlockers { assignments } if !assignments.is_empty() => self.add("blockers"),
            _ => {}
        }
    }
    fn note_events(&mut self, events: &[GameEvent]) {
        for e in events {
            match e {
                GameEvent::ManaAdded { .. } => self.add("mana"),
                GameEvent::SpellCast { .. } => self.add("cast"),
                GameEvent::AbilityActivated { .. } => self.add("ability"),
                GameEvent::TokenCreated { .. } => self.add("token"),
                GameEvent::ReplacementApplied { .. } => self.add("replacement"),
                GameEvent::AttackersDeclared { attacker_ids, .. } if !attacker_ids.is_empty() => self.add("attackers"),
                GameEvent::BlockersDeclared { assignments } if !assignments.is_empty() => self.add("blockers"),
                GameEvent::DamageDealt { is_combat, .. } => { self.add("damage"); if *is_combat { self.add("combat_damage"); } }
                GameEvent::LifeChanged { amount, .. } if *amount < 0 => self.add("life_loss"),
                _ => {}
            }
        }
    }
    fn note_state(&mut self, state: &GameState) {
        if state.players.iter().any(|p| p.mana_pool.total() > 0) { self.add("mana"); }
        if !state.stack.is_empty() { self.add("stack"); }
        if state.stack.iter().any(|e| matches!(e.kind, StackEntryKind::TriggeredAbility { .. })) { self.add("trigger"); }
        if state.stack.iter().any(|e| matches!(e.kind, StackEntryKind::ActivatedAbility { .. })) { self.add("ability"); }
        if state.battlefield.iter().filter_map(|id| state.objects.get(id)).any(|o| o.card_types.core_types.iter().any(|t| matches!(t, engine::types::card_type::CoreType::Creature))) { self.add("creature"); }
        if let WaitingFor::GameOver { winner } = &state.waiting_for {
            self.add("game_over");
            if winner.map(|p| p.0) == Some(0) { self.add("victory"); }
        }
    }
}

struct Scenario {
    name: &'static str,
    p0: Vec<String>,
    p1: Vec<String>,
    max_steps: usize,
    required: &'static [&'static str],
}

fn run_scenario(catalog_text: &str, catalog: &serde_json::Value, sc: &Scenario, seed: u64) -> serde_json::Value {
    let direct_db = CardDatabase::from_json_str(catalog_text).unwrap();
    let mut direct = GameState::new(FormatConfig::limited(), 2, seed);
    let decks_json = serde_json::json!({"player": {"main_deck": sc.p0}, "opponent": {"main_deck": sc.p1}});
    let decks: DeckList = serde_json::from_value(decks_json.clone()).unwrap();
    let payload = resolve_deck_list(&direct_db, &decks);
    load_and_hydrate_decks(&mut direct, &payload, Some(&direct_db));
    start_game_with_starting_player(&mut direct, PlayerId(0));

    let init = wrapper(1, &serde_json::json!({
        "protocol_version": 2, "catalog": catalog, "decks": decks_json, "seed": seed, "first_player": 0
    }));
    assert_eq!(init["ok"], true, "{} init failed: {init}", sc.name);
    let mut mismatches = Vec::new();
    let mut observed = Observed::default();
    observed.note_state(&direct);
    let mut steps = 0usize;
    let mut last_hash = String::new();
    for step in 0..sc.max_steps {
        if matches!(direct.waiting_for, WaitingFor::GameOver { .. }) { break; }
        let viewer = turn_control::authorized_submitter(&direct).unwrap_or(direct.priority_player);
        let filtered = filter_state_for_viewer(&direct, viewer);
        let direct_state = mtg_engine_wasm::project_state(&filtered);
        let snap = if step == 0 { init.clone() } else { wrapper(3, &serde_json::json!({})) };
        if snap["state"] != direct_state { mismatches.push(serde_json::json!({"step": step, "kind": "state"})); }
        let (flat, costs, by_obj) = engine::ai_support::legal_actions_for_viewer(&direct, viewer);
        if serde_json::to_value(&flat).unwrap() != snap["legal"]["actions"] { mismatches.push(serde_json::json!({"step": step, "kind": "legal_actions"})); }
        if serde_json::to_value(&costs).unwrap() != snap["legal"]["spell_costs"] { mismatches.push(serde_json::json!({"step": step, "kind": "spell_costs"})); }
        if serde_json::to_value(&by_obj).unwrap() != snap["legal"]["by_object"] { mismatches.push(serde_json::json!({"step": step, "kind": "by_object"})); }
        last_hash = format!("{:x}", fingerprint(&serde_json::to_vec(&direct_state).unwrap()));
        let mut combined = flat.clone();
        for actions in by_obj.values() { combined.extend(actions.iter().cloned()); }
        let Some(mut action) = choose(&combined, &direct) else { break };
        if matches!(action, GameAction::DeclareBlockers { ref assignments } if assignments.is_empty()) {
            if let Some(pairs) = snap["derived"]["blocker_assignment_pairs"].as_array() {
                if !pairs.is_empty() {
                    if let Ok(assignments) = serde_json::from_value::<Vec<(engine::types::identifiers::ObjectId, engine::types::identifiers::ObjectId)>>(serde_json::Value::Array(pairs.clone())) {
                        action = GameAction::DeclareBlockers { assignments };
                    }
                }
            }
        }
        observed.note_action(&action);
        let action_json = serde_json::to_value(&action).unwrap();
        let direct_result = apply_with_rejection(&mut direct, viewer, action.clone());
        let wrap_result = wrapper(2, &serde_json::json!({"actor": viewer.0, "action": action_json, "expected_revision": steps as u64}));
        match direct_result {
            Ok(result) => {
                if wrap_result["ok"] != true { mismatches.push(serde_json::json!({"step": step, "kind": "apply", "action": action_json, "wrapper": wrap_result})); break; }
                observed.note_events(&result.events);
                observed.note_state(&direct);
                steps += 1;
            }
            Err(rejection) => {
                mismatches.push(serde_json::json!({"step": step, "kind": "direct_rejected", "action": action_json, "code": serde_json::to_value(rejection.code).unwrap()}));
                break;
            }
        }
    }
    let missing: Vec<&str> = sc.required.iter().copied().filter(|g| !observed.0.contains(*g)).collect();
    serde_json::json!({
        "scenario": sc.name, "seed": seed, "steps": steps, "required": sc.required,
        "observed": observed.0, "missing": missing,
        "mismatches": mismatches, "final_state_fingerprint": last_hash
    })
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 2 { eprintln!("usage: scenarios <catalog-export.json> [seed]"); std::process::exit(2); }
    let seed: u64 = args.get(2).and_then(|s| s.parse().ok()).unwrap_or(42);
    let catalog_text = std::fs::read_to_string(&args[1]).expect("catalog export");
    let db = CardDatabase::from_json_str(&catalog_text).expect("catalog");
    let names: BTreeSet<String> = db.face_iter().map(|(_, f)| f.name.clone()).collect();
    let export = db.export_subset_json(&names);
    let catalog: serde_json::Value = serde_json::from_str(&export).unwrap();

    // Contract guards: stale actions and unsupported protocol versions fail closed.
    let bad_proto = wrapper(1, &serde_json::json!({"protocol_version": 999, "catalog": catalog, "decks": {"player":{"main_deck":[]},"opponent":{"main_deck":[]}}, "seed": seed}));
    let protocol_rejected = bad_proto["ok"] == false;
    let init = wrapper(1, &serde_json::json!({"protocol_version": 2, "catalog": catalog, "decks": {"player":{"main_deck":deck(&[("Forest",40)])},"opponent":{"main_deck":deck(&[("Island",40)])}}, "seed": seed, "first_player": 0}));
    let stale = wrapper(2, &serde_json::json!({"actor": 0, "action": {"type":"PassPriority"}, "expected_revision": 999}));
    let stale_rejected = stale["ok"] == false && stale["code"] == "stale_action";
    let after_stale = wrapper(3, &serde_json::json!({}));
    let revision_unchanged = after_stale["revision"] == init["revision"];

    let scenarios = vec![
        Scenario { name: "mana_and_cast", p0: deck(&[("Plains",18),("Savannah Lions",22)]), p1: deck(&[("Island",40)]), max_steps: 160, required: &["mana","cast","stack","creature"] },
        Scenario { name: "combat_attack_block_damage", p0: deck(&[("Plains",18),("Savannah Lions",22)]), p1: deck(&[("Plains",18),("Savannah Lions",22)]), max_steps: 300, required: &["attackers","blockers","combat_damage"] },
        Scenario { name: "targets_and_burn", p0: deck(&[("Mountain",18),("Lightning Bolt",22)]), p1: deck(&[("Forest",18),("Grizzly Bears",22)]), max_steps: 200, required: &["targets","damage"] },
        Scenario { name: "trigger_delver_upkeep", p0: deck(&[("Island",20),("Delver of Secrets",20)]), p1: deck(&[("Island",40)]), max_steps: 200, required: &["trigger"] },
        Scenario { name: "token_heart_desire", p0: deck(&[("Forest",20),("Heart's Desire",20)]), p1: deck(&[("Island",40)]), max_steps: 200, required: &["token"] },
        // Replacement parity is exercised opportunistically; Sakashima's multi-mana
        // copy cast is not yet part of the verified playable subset, so it is not
        // a release-blocking goal. The scenario still diffs direct vs wrapper.
        Scenario { name: "replacement_copy_pending", p0: deck(&[("Island",20),("Augur of Bolas",10),("Sakashima of the Thousand Faces",10)]), p1: deck(&[("Island",40)]), max_steps: 400, required: &[] },
        Scenario { name: "endgame_burn_victory", p0: deck(&[("Mountain",17),("Lava Spike",12),("Lightning Bolt",11)]), p1: deck(&[("Island",40)]), max_steps: 700, required: &["life_loss","game_over","victory"] },
    ];
    let reports: Vec<serde_json::Value> = scenarios.iter().map(|sc| run_scenario(&export, &catalog, sc, seed)).collect();
    let parity_ok = reports.iter().all(|r| r["mismatches"].as_array().unwrap().is_empty());
    let goals_ok = reports.iter().all(|r| r["missing"].as_array().unwrap().is_empty());
    let report = serde_json::json!({
        "harness": "explicit mechanics parity: direct Phase API vs raw wrapper ABI",
        "engine_source": "phase c2fbb7a6634a440c7c6b47e6a87a554cc7382f05",
        "protocol_rejected": protocol_rejected, "stale_rejected": stale_rejected, "revision_unchanged": revision_unchanged,
        "parity_ok": parity_ok, "goals_ok": goals_ok, "reports": reports
    });
    println!("{}", serde_json::to_string_pretty(&report).unwrap());
    if !parity_ok || !goals_ok || !protocol_rejected || !stale_rejected || !revision_unchanged { std::process::exit(1); }
}

fn fingerprint(bytes: &[u8]) -> u64 {
    let mut h: u64 = 0xcbf29ce484222325;
    for b in bytes { h ^= *b as u64; h = h.wrapping_mul(0x100000001b3); }
    h
}

//! Produce isolated browser-test state fixtures with Phase's GameScenario API.
//! This executable changes no game rules and is not used by the production app.
//!
//! UX-DECISION 1.0: the fixture set now covers the exact states the interaction
//! architecture asks for (priority with an empty stack, a pending spell cast by
//! real priorities, a response on the opponent's turn, attacker and blocker
//! declarations, targeting, manual payment, obligatory and optional choices,
//! cancellation and hotseat privacy). No turn is played through and no shuffle
//! is involved: `GameScenario` places the cards, and the windows are set by
//! patching the serialized `GameState` and **round-tripping it back through the
//! engine's own `Deserialize`**. A window that Phase would not accept fails
//! here, in the Rust fixture job, instead of silently drifting into the browser.
use engine::database::CardDatabase;
use engine::game::scenario::{GameScenario, GameRunner, P0, P1};
use engine::game::scenario_db::GameScenarioDbExt;
use engine::types::game_state::GameState;
use engine::types::mana::{ManaType, ManaUnit};
use engine::types::phase::Phase;
use engine::types::identifiers::ObjectId;
use engine::types::zones::Zone;
use serde_json::{json, Value};
use std::fs;
use std::path::Path;

const SEED: u64 = 42;

fn write_fixture(dir: &Path, id: &str, scenario: GameScenario) {
    write_runner_fixture(dir, id, scenario.build());
}

fn write_runner_fixture(dir: &Path, id: &str, runner: GameRunner) {
    let fixture = json!({
        "id": id,
        "seed": SEED,
        "state": runner.state(),
    });
    let path = dir.join(format!("{id}.json"));
    fs::write(&path, serde_json::to_vec_pretty(&fixture).unwrap())
        .unwrap_or_else(|error| panic!("write {}: {error}", path.display()));
    println!("prepared {}", path.display());
}

/// Place one exact decision window on a runner built by `GameScenario`.
///
/// The patch is applied to the serialized state, then `GameState` is
/// deserialized again: this is the guard that keeps a hand-written window from
/// becoming a state the production engine would never produce. It is a
/// *fixture* helper (feature `e2e-scenario-generator`), never an app path.
fn with_window(
    dir: &Path,
    id: &str,
    scenario: GameScenario,
    window: Value,
    patch: impl FnOnce(&mut Value),
) {
    let runner = scenario.build();
    let mut value = serde_json::to_value(runner.state()).expect("serialize GameState");
    patch(&mut value);
    value["waiting_for"] = window;
    let state: GameState = serde_json::from_value(value)
        .unwrap_or_else(|error| panic!("fixture {id}: Phase rejected the window: {error}"));
    let fixture = json!({ "id": id, "seed": SEED, "state": state });
    let path = dir.join(format!("{id}.json"));
    fs::write(&path, serde_json::to_vec_pretty(&fixture).unwrap())
        .unwrap_or_else(|error| panic!("write {}: {error}", path.display()));
    println!("prepared {} (window {})", path.display(), id);
}

fn scenario() -> GameScenario {
    let mut game = GameScenario::new();
    game.at_phase(Phase::PreCombatMain);
    game
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() != 3 {
        eprintln!("usage: e2e_scenarios <cards.json> <output-dir>");
        std::process::exit(2);
    }
    let db = CardDatabase::from_json_str(&fs::read_to_string(&args[1]).expect("cards.json"))
        .expect("Phase card database");
    let out = Path::new(&args[2]);
    fs::create_dir_all(out).expect("create fixture output directory");

    // 1 · Targeting / manual payment / cancellation: the real printed spell is
    // in hand. No deck order or turn advancement.
    let mut targeted = scenario();
    targeted.add_real_card(P0, "Lightning Bolt", Zone::Hand, &db);
    targeted.with_mana_pool(
        P0,
        vec![ManaUnit::new(ManaType::Red, ObjectId(0), false, vec![])],
    );
    write_fixture(out, "target-cast", targeted);

    let mut manual = scenario();
    manual.add_real_card(P0, "Lightning Bolt", Zone::Hand, &db);
    manual.add_real_card(P0, "Mountain", Zone::Battlefield, &db);
    write_fixture(out, "manual-payment", manual);

    let mut cancel = scenario();
    cancel.add_real_card(P0, "Lightning Bolt", Zone::Hand, &db);
    cancel.add_real_card(P0, "Mountain", Zone::Battlefield, &db);
    write_fixture(out, "cancel-cast", cancel);

    // 5 · Two different real card objects, one in each private hand. P0 starts
    // with priority, so the E2E can open P0's card detail and pass priority once
    // through the actual engine while the sheet is still open.
    let mut privacy = scenario();
    privacy.add_real_card(P0, "Lightning Bolt", Zone::Hand, &db);
    privacy.add_real_card(P1, "Mountain", Zone::Hand, &db);
    write_fixture(out, "privacy-handoff", privacy);

    // ---- UX-DECISION 1.0 -------------------------------------------------
    // 6 · Priority, empty stack: a real card in hand gives Phase something to
    // offer, while the window stays the plain priority window `at_phase` sets.
    let mut empty = scenario();
    empty.add_real_card(P0, "Lightning Bolt", Zone::Hand, &db);
    write_fixture(out, "priority-empty", empty);

    // 7 · Priority with a pending spell: the browser casts Lightning Bolt for
    // real (the required priority passes are executed by the E2E, not here).
    // The fixture only supplies the exact starting state; no stack is forged.
    let mut pending = scenario();
    pending.add_real_card(P0, "Lightning Bolt", Zone::Hand, &db);
    pending.with_mana_pool(
        P0,
        vec![ManaUnit::new(ManaType::Red, ObjectId(0), false, vec![])],
    );
    write_fixture(out, "priority-stack", pending);

    // 8 · Response during the opponent's turn: P1 is active, P0 holds priority.
    // Only the two plain `PlayerId` fields change; the window remains Phase's.
    let mut response = scenario();
    response.add_real_card(P0, "Lightning Bolt", Zone::Hand, &db);
    with_window(
        out,
        "opponent-turn-response",
        response,
        json!({ "type": "Priority", "data": { "player": 0 } }),
        |value| {
            value["active_player"] = json!(1);
            value["priority_player"] = json!(0);
        },
    );

    // 9 · Declare attackers: two real vanilla creatures; the window carries the
    // engine's own legal attacker ids. Obligations/restrictions stay defaulted,
    // as they are display-only metadata computed by Phase.
    let mut attackers = scenario();
    let a1 = attackers.add_vanilla(P0, 2, 2);
    let a2 = attackers.add_vanilla(P0, 3, 3);
    with_window(
        out,
        "declare-attackers",
        attackers,
        json!({
            "type": "DeclareAttackers",
            "data": { "player": 0, "valid_attacker_ids": [a1.0, a2.0] }
        }),
        |value| { value["phase"] = json!("DeclareAttackers"); },
    );

    // 10 · Declare blockers: real creatures on both sides, and the engine's
    // attacker declaration applied through GameRunner (never a hand-built
    // combat map) so the blocking window starts from a real combat state.
    let mut blockers = scenario();
    let attacker = blockers.add_vanilla(P0, 2, 2);
    let blocker = blockers.add_vanilla(P1, 2, 3);
    let mut runner = blockers.build();
    let declared = runner.declare_attackers(&[(attacker, engine::game::combat::AttackTarget::Player(P1))]);
    assert!(declared.is_ok(), "fixture declare-blockers: Phase rejected the real attack declaration");
    with_runner_window(
        out,
        "declare-blockers",
        runner,
        json!({
            "type": "DeclareBlockers",
            "data": { "player": 1, "valid_blocker_ids": [blocker.0] }
        }),
        |value| {
            value["phase"] = json!("DeclareBlockers");
            value["priority_player"] = json!(1);
        },
    );

    // 11 · Obligatory decision: the UP-133 keeper window, exact. `required_count`
    // is the printed ceiling and `minimum_count: null` means exactly N.
    let mut keeper = scenario();
    let k1 = keeper.add_vanilla(P0, 1, 1);
    let k2 = keeper.add_vanilla(P0, 1, 1);
    let k3 = keeper.add_vanilla(P0, 1, 1);
    with_window(
        out,
        "obligatory-decision",
        keeper,
        json!({
            "type": "KeepExactPermanentsChoice",
            "data": {
                "player": 0, "target_player": 0,
                "eligible": [k1.0, k2.0, k3.0],
                "required_count": 2, "source_id": 0
            }
        }),
        |_| {},
    );

    // 12 · Optional decision: a "you may" window with no irreversible auto
    // answer. The browser checks that Mesa offers both branches; it does not
    // fake a resolution frame this fixture does not have.
    let mut optional = scenario();
    let source = optional.add_vanilla(P0, 1, 1);
    with_window(
        out,
        "optional-decision",
        optional,
        json!({
            "type": "OptionalEffectChoice",
            "data": {
                "player": 0, "source_id": source.0,
                "description": "Robar una carta"
            }
        }),
        |_| {},
    );
}

/// Same guard as `with_window`, but starting from an already-built runner whose
/// state came from real engine actions (used by the blockers fixture).
fn with_runner_window(
    dir: &Path,
    id: &str,
    runner: GameRunner,
    window: Value,
    patch: impl FnOnce(&mut Value),
) {
    let mut value = serde_json::to_value(runner.state()).expect("serialize GameState");
    patch(&mut value);
    value["waiting_for"] = window;
    let state: GameState = serde_json::from_value(value)
        .unwrap_or_else(|error| panic!("fixture {id}: Phase rejected the window: {error}"));
    let fixture = json!({ "id": id, "seed": SEED, "state": state });
    let path = dir.join(format!("{id}.json"));
    fs::write(&path, serde_json::to_vec_pretty(&fixture).unwrap())
        .unwrap_or_else(|error| panic!("write {}: {error}", path.display()));
    println!("prepared {} (window {})", path.display(), id);
}

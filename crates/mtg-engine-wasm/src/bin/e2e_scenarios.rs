//! Produce isolated browser-test state fixtures with Phase's GameScenario API.
//! This executable changes no game rules and is not used by the production app.
use engine::database::CardDatabase;
use engine::game::scenario::{GameScenario, P0, P1};
use engine::game::scenario_db::GameScenarioDbExt;
use engine::types::mana::{ManaType, ManaUnit};
use engine::types::phase::Phase;
use engine::types::identifiers::ObjectId;
use engine::types::zones::Zone;
use serde_json::json;
use std::fs;
use std::path::Path;

const SEED: u64 = 42;

fn write_fixture(dir: &Path, id: &str, scenario: GameScenario) {
    let runner = scenario.build();
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

    // 1 · Targeting: the real printed spell is in hand and the real engine has
    // the red mana already available; no deck order or turn advancement.
    let mut targeted = scenario();
    targeted.add_real_card(P0, "Lightning Bolt", Zone::Hand, &db);
    targeted.with_mana_pool(
        P0,
        vec![ManaUnit::new(ManaType::Red, ObjectId(0), false, vec![])],
    );
    write_fixture(out, "target-cast", targeted);

    // 2 · Manual payment: a real untapped Mountain is the only mana source.
    // The UI must choose Manual, enter ManaPayment, tap it, and finish the cast.
    let mut manual = scenario();
    manual.add_real_card(P0, "Lightning Bolt", Zone::Hand, &db);
    manual.add_real_card(P0, "Mountain", Zone::Battlefield, &db);
    write_fixture(out, "manual-payment", manual);

    // 3 · Cancellation uses the same genuine pending-cast payment window.
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
}

//! Per-card coverage evidence for one catalog pack.
//!
//! `packcheck` proves a pack *loads* and that a game can be played with it. It
//! does not say which cards the engine actually understands. Phase already
//! answers that: `analyze_coverage` walks every face and reports, per card,
//! whether every keyword, ability, trigger and static it parsed has a handler.
//!
//! This binary turns that into an artifact the client can consult, with the
//! states kept apart on purpose:
//!
//!   present          the name is in the pack (always true here)
//!   parsed           Phase deserialized the face (always true here: the pack
//!                    would not load otherwise)
//!   coverage_known   `supported` is known for the card, and the gaps are listed
//!   exercised        the card appeared in the certifying game (see packcheck →
//!                    `exercised_names`, passed as an optional third argument)
//!
//! `supported: false` means "the parser met something with no handler", which is
//! *evidence of a known limitation*, not proof that the card is broken: an
//! unimplemented trigger can still leave a card perfectly playable. The client
//! policy is what turns this into a decision, and it is documented next to it.
//!
//! usage: coveragepack <pack.json> [exercised.json]   (JSON on stdout)
//!
//! The SHA-256 of the pack is added by `scripts/build-coverage.ts`: it reads the
//! bytes and checks them against the index before writing the artifact, so the
//! digest and the coverage can never describe different files.
use engine::database::CardDatabase;
use engine::game::coverage::analyze_coverage;
use std::collections::BTreeSet;

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 2 {
        eprintln!("usage: coveragepack <pack.json> [exercised.json]");
        std::process::exit(2);
    }

    let text = std::fs::read_to_string(&args[1]).expect("pack file");
    let bytes = text.len();

    let db = match CardDatabase::from_json_str(&text) {
        Ok(db) => db,
        Err(err) => {
            eprintln!("el pack no se deserializa: {err}");
            std::process::exit(1);
        }
    };
    let faces = db.face_iter().count();

    let mut exercised: BTreeSet<String> = BTreeSet::new();
    if let Some(path) = args.get(2) {
        let raw = std::fs::read_to_string(path).expect("exercised file");
        let value: serde_json::Value = serde_json::from_str(&raw).expect("exercised json");
        if let Some(names) = value.get("exercised_names").and_then(|n| n.as_array()) {
            for name in names {
                if let Some(name) = name.as_str() {
                    exercised.insert(name.to_lowercase());
                }
            }
        }
    }

    let summary = analyze_coverage(&db);
    let mut cards = Vec::new();
    let mut supported_count = 0usize;
    let mut exercised_count = 0usize;
    for card in &summary.cards {
        let key = card.card_name.to_lowercase();
        let gaps: Vec<String> = card
            .gap_details
            .iter()
            .map(|gap| match &gap.source_text {
                Some(text) => format!("{}: {}", gap.handler, text),
                None => gap.handler.clone(),
            })
            .collect();
        if card.supported {
            supported_count += 1;
        }
        if exercised.contains(&key) {
            exercised_count += 1;
        }
        cards.push(serde_json::json!({
            "name": card.card_name,
            "key": key,
            "supported": card.supported,
            "gap_count": card.gap_count,
            "gaps": gaps,
            // `exercised` is about the certifying game, not about support.
            "exercised": exercised.contains(&key),
        }));
    }
    cards.sort_by(|a, b| a["key"].as_str().cmp(&b["key"].as_str()));

    let report = serde_json::json!({
        "generated_by": "coveragepack (phase engine)",
        "engine_source": "phase c2fbb7a6634a440c7c6b47e6a87a554cc7382f05",
        "pack": args[1],
        "pack_bytes": bytes,
        "faces": faces,
        "levels": {
            "present": "el nombre está en el pack",
            "parsed": "Phase deserializó la cara (CardDatabase::from_json_str)",
            "coverage_known": "analyze_coverage conoce el soporte de reglas y las limitaciones",
            "exercised": "la carta apareció en la partida de certificación"
        },
        "summary": {
            "cards": cards.len(),
            "supported": supported_count,
            "with_known_gaps": cards.len().saturating_sub(supported_count),
            "exercised": exercised_count
        },
        "cards": cards,
    });
    println!("{}", serde_json::to_string_pretty(&report).unwrap());
    eprintln!(
        "{} caras · {} soportadas · {} con limitaciones conocidas · {} ejercitadas",
        cards.len(),
        supported_count,
        cards.len().saturating_sub(supported_count),
        exercised_count
    );
}

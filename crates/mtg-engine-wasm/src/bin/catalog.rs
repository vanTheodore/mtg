use engine::database::CardDatabase;
use std::collections::BTreeSet;
use std::path::Path;

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() != 3 {
        eprintln!("usage: catalog <mtgjson-fixture.json> <out-dir>");
        std::process::exit(2);
    }
    let db = CardDatabase::from_mtgjson(Path::new(&args[1])).expect("parse fixture");
    let names: BTreeSet<String> = db.face_iter().map(|(_, f)| f.name.clone()).collect();
    let export = db.export_subset_json(&names);
    let out = Path::new(&args[2]);
    std::fs::create_dir_all(out).expect("out dir");
    std::fs::write(out.join("cards.json"), export).expect("write cards");
    let mut meta = serde_json::Map::new();
    for (_, face) in db.face_iter() {
        let key = face.scryfall_oracle_id.clone().unwrap_or_else(|| face.name.to_lowercase());
        meta.insert(key, serde_json::json!({
            "name": face.name,
            "mana_cost": face.mana_cost,
            "card_type": face.card_type,
            "power": face.power,
            "toughness": face.toughness,
            "oracle_text": face.oracle_text,
            "oracle_id": face.scryfall_oracle_id,
        }));
    }
    std::fs::write(out.join("card-meta.json"), serde_json::to_string(&meta).unwrap()).expect("write meta");
    eprintln!("exported {} faces", names.len());
}

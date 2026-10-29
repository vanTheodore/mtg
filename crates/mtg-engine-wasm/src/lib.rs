//! Raw JSON bridge to the Phase rules engine. No React, no wasm-bindgen glue.
//! The engine remains the sole authority for rules, legality and visibility.
use engine::database::CardDatabase;
use engine::game::deck_loading::{resolve_deck_list, DeckList};
use engine::game::derived_views::derive_filtered_views;
use engine::game::engine::{apply_with_rejection, start_game_with_starting_player};
use engine::game::visibility::filter_state_for_viewer;
use engine::game::{load_and_hydrate_decks, turn_control};
use engine::types::format::FormatConfig;
use engine::types::game_state::GameState;
use engine::types::identifiers::ObjectId;
use engine::types::player::PlayerId;
use engine::types::{GameAction, ActionResult};
use serde::{Deserialize, Serialize};
use std::cell::RefCell;
use std::sync::Arc;
use web_time::Instant;

#[cfg(target_arch = "wasm32")]
mod wasm_random {
    fn unsupported(_buf: &mut [u8]) -> Result<(), getrandom::Error> {
        Err(getrandom::Error::UNSUPPORTED)
    }
    getrandom::register_custom_getrandom!(unsupported);
}

struct Session {
    state: GameState,
    db: Arc<CardDatabase>,
    seed: u64,
    actions: u64,
}

thread_local! {
    static SESSION: RefCell<Option<Session>> = const { RefCell::new(None) };
}

#[derive(Deserialize)]
struct InitRequest {
    catalog: serde_json::Value,
    decks: DeckList,
    seed: u64,
    #[serde(default)]
    first_player: Option<u8>,
}

#[derive(Deserialize)]
struct ActionRequest {
    actor: u8,
    action: GameAction,
}

#[derive(Serialize)]
struct ErrorReply {
    ok: bool,
    error: String,
}

fn err(msg: impl Into<String>) -> Vec<u8> {
    serde_json::to_vec(&ErrorReply { ok: false, error: msg.into() }).unwrap()
}

fn initialize(input: &[u8]) -> Vec<u8> {
    let req: InitRequest = match serde_json::from_slice(input) {
        Ok(v) => v,
        Err(e) => return err(format!("init payload: {e}")),
    };
    let catalog_text = match serde_json::to_string(&req.catalog) {
        Ok(v) => v,
        Err(e) => return err(format!("catalog encode: {e}")),
    };
    let db = match CardDatabase::from_json_str(&catalog_text) {
        Ok(v) => Arc::new(v),
        Err(e) => return err(format!("catalog load: {e}")),
    };
    let integrity = db.export_integrity_errors();
    if !integrity.is_empty() {
        return err(format!("catalog integrity: {}", integrity.join("; ")));
    }
    let format = FormatConfig::limited();
    let mut state = GameState::new(format, 2, req.seed);
    let payload = resolve_deck_list(&db, &req.decks);
    load_and_hydrate_decks(&mut state, &payload, Some(&db));
    let first = PlayerId(req.first_player.unwrap_or(0));
    let result = start_game_with_starting_player(&mut state, first);
    let session = Session { state, db, seed: req.seed, actions: 0 };
    SESSION.with(|s| *s.borrow_mut() = Some(session));
    snapshot_reply(result, 0.0, 0.0)
}

fn submit(input: &[u8]) -> Vec<u8> {
    let req: ActionRequest = match serde_json::from_slice(input) {
        Ok(v) => v,
        Err(e) => return err(format!("action payload: {e}")),
    };
    SESSION.with(|s| {
        let mut borrow = s.borrow_mut();
        let session = match borrow.as_mut() {
            Some(v) => v,
            None => return err("engine not initialized"),
        };
        let started = Instant::now();
        let actor = PlayerId(req.actor);
        let result = match apply_with_rejection(&mut session.state, actor, req.action) {
            Ok(r) => r,
            Err(rejection) => {
                return serde_json::to_vec(&serde_json::json!({
                    "ok": false,
                    "rejected": true,
                    "code": format!("{:?}", rejection.code),
                    "error": "La acción no es legal en este estado."
                })).unwrap();
            }
        };
        let engine_ms = started.elapsed().as_secs_f64() * 1000.0;
        session.actions += 1;
        snapshot_reply(result, engine_ms, 0.0)
    })
}

fn current_viewer(state: &GameState) -> PlayerId {
    turn_control::authorized_submitter(state).unwrap_or(state.priority_player)
}

fn snapshot_reply(result: ActionResult, engine_ms: f64, _serialize_ms: f64) -> Vec<u8> {
    SESSION.with(|s| {
        let borrow = s.borrow();
        let session = borrow.as_ref().expect("session");
        let viewer = current_viewer(&session.state);
        let started = Instant::now();
        let filtered = filter_state_for_viewer(&session.state, viewer);
        let derived = derive_filtered_views(&session.state, &filtered, Some(viewer));
        let (actions, spell_costs, by_object) =
            engine::ai_support::legal_actions_for_viewer(&session.state, viewer);
        let state_json = project_state(&filtered);
        let reply = serde_json::json!({
            "ok": true,
            "viewer": viewer.0,
            "seed": session.seed,
            "actions_applied": session.actions,
            "state": state_json,
            "derived": derived,
            "legal": {
                "actions": actions,
                "spell_costs": spell_costs,
                "by_object": by_object,
            },
            "events": result.events,
            "waiting_for": result.waiting_for,
            "metrics": {
                "engine_ms": engine_ms,
                "serialize_ms": started.elapsed().as_secs_f64() * 1000.0,
                "objects": filtered.objects.len(),
            }
        });
        serde_json::to_vec(&reply).unwrap()
    })
}

pub fn project_state(state: &GameState) -> serde_json::Value {
    let players: Vec<serde_json::Value> = state.players.iter().map(|p| {
        serde_json::json!({
            "id": p.id,
            "life": p.life,
            "mana_pool": p.mana_pool,
            "hand": p.hand,
            "library_count": p.library.len(),
            "graveyard": p.graveyard,
            "exile": state.exile.iter().filter(|id| state.objects.get(id).map(|o| o.owner == p.id).unwrap_or(false)).copied().collect::<Vec<_>>(),
            "is_eliminated": p.is_eliminated,
            "poison_counters": p.poison_counters,
            "energy": p.energy,
            "lands_played_this_turn": p.lands_played_this_turn,
        })
    }).collect();
    serde_json::json!({
        "turn_number": state.turn_number,
        "active_player": state.active_player,
        "priority_player": state.priority_player,
        "phase": state.phase,
        "waiting_for": state.waiting_for,
        "players": players,
        "battlefield": state.battlefield,
        "stack": state.stack,
        "exile": state.exile,
        "objects": state.objects,
        "combat": state.combat,
    })
}

/// Native entry point for the parity harness; identical to the WASM ABI path.
pub fn request_bytes(op: u32, input: &[u8]) -> Vec<u8> { dispatch(op, input) }

fn dispatch(op: u32, input: &[u8]) -> Vec<u8> {
    match op {
        1 => initialize(input),
        2 => submit(input),
        3 => SESSION.with(|s| {
            if s.borrow().is_none() { return err("engine not initialized"); }
            let waiting = s.borrow().as_ref().unwrap().state.waiting_for.clone();
            snapshot_reply(ActionResult::applied(vec![], waiting), 0.0, 0.0)
        }),
        4 => {
            let viewer: u8 = match serde_json::from_slice(input) { Ok(v) => v, Err(e) => return err(format!("viewer: {e}")) };
            SESSION.with(|s| {
                let borrow = s.borrow();
                let session = match borrow.as_ref() { Some(v) => v, None => return err("engine not initialized") };
                let filtered = filter_state_for_viewer(&session.state, PlayerId(viewer));
                let derived = derive_filtered_views(&session.state, &filtered, Some(PlayerId(viewer)));
                let (actions, spell_costs, by_object) = engine::ai_support::legal_actions_for_viewer(&session.state, PlayerId(viewer));
                serde_json::to_vec(&serde_json::json!({
                    "ok": true, "viewer": viewer, "state": project_state(&filtered), "derived": derived,
                    "legal": {"actions": actions, "spell_costs": spell_costs, "by_object": by_object},
                    "metrics": {"objects": filtered.objects.len()}
                })).unwrap()
            })
        }
        _ => err("unknown operation"),
    }
}

/// Allocate a writable buffer for the host. The host must free it with mtg_free.
#[no_mangle]
pub extern "C" fn mtg_alloc(len: usize) -> *mut u8 {
    let mut buf = Vec::<u8>::with_capacity(len);
    let ptr = buf.as_mut_ptr();
    std::mem::forget(buf);
    ptr
}

/// Free a buffer previously returned by mtg_alloc.
#[no_mangle]
pub extern "C" fn mtg_free(ptr: *mut u8, len: usize) {
    if !ptr.is_null() { unsafe { drop(Vec::from_raw_parts(ptr, len, len)); } }
}

/// Request/response ABI. Returns (ptr << 32) | len. Host reads UTF-8 JSON and
/// frees the response with mtg_free. All calls are serialized by the Worker.
#[no_mangle]
pub extern "C" fn mtg_request(op: u32, ptr: *const u8, len: usize) -> u64 {
    let input = unsafe { std::slice::from_raw_parts(ptr, len) };
    let out = dispatch(op, input);
    let len = out.len() as u64;
    let ptr = out.as_ptr() as u64;
    std::mem::forget(out);
    (ptr << 32) | len
}

/// Catalog export helper shared by the native catalog binary and tests.
pub fn export_catalog(db: &CardDatabase, names: &std::collections::BTreeSet<String>) -> String {
    db.export_subset_json(names)
}

/// Stable object identity helper for UI keyed lists.
pub fn object_key(id: ObjectId) -> u64 { id.0 }

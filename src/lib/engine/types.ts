export type PlayerId = number;
export type ObjectId = number;

export interface GameAction {
  type: string;
  data?: Record<string, unknown>;
}

export interface GameObject {
  id: ObjectId;
  card_id: number;
  owner: PlayerId;
  controller: PlayerId;
  zone: string;
  name: string;
  display_visible_to_viewer?: boolean;
  tapped?: boolean;
  face_down?: boolean;
  transformed?: boolean;
  flipped?: boolean;
  modal_back_face?: boolean;
  attached_to?: unknown;
  attachments?: ObjectId[];
  power?: number | string | null;
  toughness?: number | string | null;
  damage_marked?: number;
  printed_ref?: { oracle_id: string; face_name: string } | null;
  back_face?: { name?: string } | null;
  display_source?: string;
  token_image_ref?: unknown;
  card_types?: { core_types?: string[]; subtypes?: string[]; supertypes?: string[] };
  mana_cost?: unknown;
  oracle_text?: string | null;
  [key: string]: unknown;
}

export interface PlayerView {
  id: PlayerId;
  life: number;
  mana_pool: unknown;
  hand: ObjectId[];
  library_count: number;
  graveyard: ObjectId[];
  exile: ObjectId[];
  is_eliminated: boolean;
  poison_counters: number;
  energy: number;
  lands_played_this_turn: number;
}

export interface EngineSnapshot {
  ok: true;
  viewer: PlayerId;
  seed: number;
  actions_applied: number;
  state: {
    turn_number: number;
    active_player: PlayerId;
    priority_player: PlayerId;
    phase: string;
    waiting_for: { type: string; data?: Record<string, unknown> };
    players: PlayerView[];
    battlefield: ObjectId[];
    stack: unknown[];
    exile: ObjectId[];
    objects: Record<string, GameObject>;
    combat?: unknown;
  };
  derived: Record<string, unknown>;
  legal: {
    actions: GameAction[];
    spell_costs: Record<string, unknown>;
    by_object: Record<string, GameAction[]>;
  };
  events?: unknown[];
  waiting_for?: { type: string };
  metrics: {
    engine_ms?: number;
    serialize_ms?: number;
    response_bytes?: number;
    objects?: number;
    worker_ms?: number;
    wasm_compile_ms?: number;
  };
}

export interface EngineError {
  ok: false;
  error: string;
  rejected?: boolean;
  code?: string;
}

export type EngineReply = EngineSnapshot | EngineError;

export interface CardMeta {
  name: string;
  mana_cost?: unknown;
  card_type?: { core_types?: string[]; subtypes?: string[]; supertypes?: string[] };
  power?: unknown;
  toughness?: unknown;
  oracle_text?: string | null;
  oracle_id?: string | null;
}

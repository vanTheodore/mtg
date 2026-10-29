export type PlayerId = number;
export type ObjectId = number;

export interface GameAction {
  type: string;
  data?: Record<string, unknown>;
}

export interface TokenImageRef {
  scryfall_id: string;
  scryfall_oracle_id?: string;
  face_name?: string;
  preset_id: string;
}

export interface TokenArtDescriptor {
  power?: number | null;
  toughness?: number | null;
  colors: string[];
  subtypes: string[];
  keywords?: string[];
  has_abilities: boolean;
}

/** Phase serializes TargetRef as an externally tagged enum: {Player: id} | {Object: id}. */
export type TargetRef = { Player: PlayerId } | { Object: ObjectId };
/** AttackTarget has a tagged wire shape; TargetRef does not. */
export type AttackTarget = { type: 'Player'; data: PlayerId } | { type: 'Planeswalker' | 'Battle'; data: ObjectId };
export interface TargetProgress {
  current_slot: number;
  selected_slots?: (TargetRef | null)[];
  current_legal_targets: TargetRef[];
}
export interface WaitingFor {
  type: string;
  data?: {
    player?: PlayerId;
    selection?: TargetProgress;
    target_slots?: unknown[];
    mode_labels?: (string | null)[];
    pending_cast?: { object_id: ObjectId; cost: unknown };
    valid_attacker_ids?: ObjectId[];
    valid_attack_targets_by_attacker?: Record<string, AttackTarget[]>;
    attacker_constraints?: Record<string, unknown>;
    valid_blocker_ids?: ObjectId[];
    valid_block_targets?: Record<string, ObjectId[]>;
    block_requirements?: Record<string, { count: number }>;
    blocker_constraints?: Record<string, unknown>;
    [key: string]: unknown;
  };
}
export interface CombatView {
  attackers: { object_id: ObjectId; defending_player: PlayerId; attack_target: AttackTarget; blocked: boolean }[];
  blockers: Record<string, ObjectId[]>;
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
  is_token?: boolean;
  is_copy?: boolean;
  summoning_sick?: boolean;
  counters?: Record<string, number> | [string, number][];
  keywords?: unknown[];
  abilities?: unknown[];
  color?: string[];
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
  token_image_ref?: TokenImageRef | null;
  token_art?: TokenArtDescriptor | null;
  is_emblem?: boolean;
  emblem_source?: { name: string; printed_ref?: { oracle_id: string; face_name: string } | null } | null;
  card_types?: { core_types?: string[]; subtypes?: string[]; supertypes?: string[] };
  mana_cost?: unknown;
  oracle_text?: string | null;
  [key: string]: unknown;
}

export const ENGINE_PROTOCOL_VERSION = 2 as const;

export interface ManaPoolSummary {
  total: number; white: number; blue: number; black: number; red: number; green: number; colorless: number;
}

export interface GameOutcome { winner: number | null; draw: boolean }

export interface PlayerView {
  id: PlayerId;
  life: number;
  mana_pool: ManaPoolSummary;
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
  protocol_version?: number;
  viewer: PlayerId;
  seed: number;
  revision: number;
  actions_applied: number;
  outcome?: GameOutcome | null;
  state: {
    turn_number: number;
    active_player: PlayerId;
    priority_player: PlayerId;
    phase: string;
    waiting_for: WaitingFor;
    players: PlayerView[];
    battlefield: ObjectId[];
    stack: unknown[];
    exile: ObjectId[];
    objects: Record<string, GameObject>;
    combat?: CombatView | null;
  };
  derived: Record<string, unknown>;
  legal: {
    actions: GameAction[];
    spell_costs: Record<string, unknown>;
    by_object: Record<string, GameAction[]>;
  };
  events?: unknown[];
  auto_pass_recommended?: boolean;
  waiting_for?: { type: string };
  metrics: {
    engine_ms?: number;
    legal_ms?: number;
    projection_ms?: number;
    serialize_ms?: number;
    encode_ms?: number;
    wasm_call_ms?: number;
    decode_ms?: number;
    transport_ms?: number;
    svelte_commit_ms?: number;
    presentation_ms?: number;
    event_timing_ms?: number;
    projection_bytes?: number;
    response_bytes?: number;
    objects?: number;
    worker_ms?: number;
    wasm_compile_ms?: number;
    wasm_transfer_bytes?: number;
    wasm_memory_bytes?: number;
  };
}

export interface EngineError {
  ok: false;
  error: string;
  rejected?: boolean;
  code?: string;
  disposition?: string;
  revision?: number;
  expected_revision?: number;
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

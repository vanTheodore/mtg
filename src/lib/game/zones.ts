import type { EngineSnapshot, GameObject, ObjectId, PlayerView } from '#lib/engine/types.ts';

/**
 * Zones a player can look into from the table.
 *
 * `library` is deliberately different: Phase only sends a count (and, when the
 * engine projects a reveal, the object itself). This module never reconstructs
 * an order the engine did not send, so a library viewer cannot leak the top
 * card of a hidden library.
 */
export type TableZone = 'graveyard' | 'exile' | 'library';

export const ZONE_LABELS: Record<TableZone, string> = {
  graveyard: 'Cementerio',
  exile: 'Exilio',
  library: 'Biblioteca'
};

export function playerOf(snapshot: EngineSnapshot | null, playerId: number): PlayerView | undefined {
  return snapshot?.state.players.find((player) => player.id === playerId) ?? snapshot?.state.players[playerId];
}

/** How many cards the engine reports in that zone for that seat. */
export function zoneCount(snapshot: EngineSnapshot | null, playerId: number, zone: TableZone): number {
  const player = playerOf(snapshot, playerId);
  if (!player) return 0;
  if (zone === 'library') return player.library_count ?? 0;
  return (player[zone] ?? []).length;
}

function resolve(snapshot: EngineSnapshot | null, ids: readonly ObjectId[]): GameObject[] {
  const objects = snapshot?.state.objects ?? {};
  return ids.map((id) => objects[String(id)]).filter((object): object is GameObject => !!object);
}

/**
 * The cards a viewer may see in a zone, in the order the pile is stacked.
 *
 * Graveyard and exile arrive as id lists from the engine (append order), so the
 * **last** element is the visible top of the pile. The library has no id list
 * on the wire; it resolves to `[]` and the caller shows the count only.
 */
export function zoneCards(snapshot: EngineSnapshot | null, playerId: number, zone: TableZone): GameObject[] {
  const player = playerOf(snapshot, playerId);
  if (!player || zone === 'library') return [];
  return resolve(snapshot, player[zone] ?? []);
}

/** The card at the top of a pile, or `undefined` for an empty/hidden zone. */
export function zoneTop(snapshot: EngineSnapshot | null, playerId: number, zone: TableZone): GameObject | undefined {
  const cards = zoneCards(snapshot, playerId, zone);
  return cards.length ? cards[cards.length - 1] : undefined;
}

/**
 * Library cards the engine explicitly projected for this viewer.
 *
 * Phase marks such cards with `display_visible_to_viewer`; anything else stays
 * out of the list even if its object id appears in a derived artifact.
 */
export function revealedLibraryCards(snapshot: EngineSnapshot | null, playerId: number): GameObject[] {
  const player = playerOf(snapshot, playerId);
  if (!player) return [];
  const ids = (player as PlayerView & { library?: ObjectId[] }).library;
  if (!Array.isArray(ids)) return [];
  return resolve(snapshot, ids).filter((object) => object.display_visible_to_viewer === true);
}

import type { GameObject } from '#lib/engine/types.ts';
import { targetLabel } from './interaction.ts';

export interface HistoryEntry { id: number; revision: number; text: string; kind: 'damage' | 'life' | 'stack' | 'cast' }
/** Summarize public events already filtered by Phase; never infer a rules result. */
export function summarizeEvents(events: unknown[], objects: Record<string, GameObject>, revision: number, nextId: () => number): HistoryEntry[] {
  const result: HistoryEntry[] = [];
  const push = (entry: Omit<HistoryEntry, 'id' | 'revision'>) => result.push({ ...entry, id: nextId(), revision });
  for (const raw of events) {
    const e = raw as { type?: string; data?: Record<string, unknown> };
    const d = e.data ?? {};
    const name = objects[String(d.object_id)]?.name ?? objects[String(d.source_id)]?.name ?? 'La habilidad';
    if (e.type === 'DamageDealt') {
      push({ kind: 'damage', text: `${name} hace ${d.amount} de daño${d.is_combat ? ' de combate' : ''} a ${targetLabel(d.target, objects)}.` });
    } else if (e.type === 'LifeChanged' && typeof d.amount === 'number' && d.amount !== 0) {
      push({ kind: 'life', text: `Jugador ${Number(d.player_id) + 1} ${d.amount > 0 ? 'gana' : 'pierde'} ${Math.abs(d.amount)} vidas.` });
    } else if (e.type === 'StackResolved') {
      push({ kind: 'stack', text: `Se resuelve: ${name}.` });
    } else if (e.type === 'SpellCast') {
      push({ kind: 'cast', text: `Jugador ${Number(d.controller) + 1} lanza ${name}.` });
    } else if (e.type === 'SpellCountered') {
      push({ kind: 'stack', text: `${name} fue contrarrestado.` });
    }
  }
  return result;
}

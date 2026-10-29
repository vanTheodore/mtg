import type { GameAction, GameObject } from '#lib/engine/types.ts';

const LABELS: Record<string, string> = {
  PassPriority: 'Pasar prioridad',
  PlayLand: 'Jugar tierra',
  CastSpell: 'Lanzar hechizo',
  DeclareAttackers: 'Declarar atacantes',
  DeclareBlockers: 'Declarar bloqueadoras',
  KeepHand: 'Conservar mano',
  Mulligan: 'Hacer mulligan',
  ChooseOption: 'Elegir opción',
  ActivateAbility: 'Activar habilidad'
};

export function describeAction(action: GameAction, objects: Record<string, GameObject> = {}): string {
  const base = LABELS[action.type] ?? action.type;
  const data = action.data ?? {};
  const id = (data.object_id ?? data.source_id) as number | undefined;
  const obj = id !== undefined ? objects[String(id)] : undefined;
  if (obj && (action.type === 'PlayLand' || action.type === 'CastSpell' || action.type === 'ActivateAbility')) {
    return `${base}: ${obj.name}`;
  }
  if (action.type === 'DeclareAttackers' && Array.isArray(data.attacks)) {
    return `Atacar con ${data.attacks.length} criatura${data.attacks.length === 1 ? '' : 's'}`;
  }
  if (action.type === 'DeclareBlockers' && Array.isArray(data.assignments)) {
    return `Bloquear (${data.assignments.length} asignación${data.assignments.length === 1 ? '' : 'es'})`;
  }
  return base;
}

export function actionsForObject(byObject: Record<string, GameAction[]>, id: number): GameAction[] {
  return byObject[String(id)] ?? [];
}

export function isPassPriority(action: GameAction): boolean {
  return action.type === 'PassPriority';
}

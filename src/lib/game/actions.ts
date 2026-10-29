import type { GameAction, GameObject } from '#lib/engine/types.ts';

const LABELS: Record<string, string> = {
  PassPriority: 'Pasar prioridad',
  PlayLand: 'Jugar tierra',
  CastSpell: 'Lanzar hechizo',
  DeclareAttackers: 'Declarar atacantes',
  DeclareBlockers: 'Declarar bloqueadoras',
  MulliganDecision: 'Decisión de mulligan',
  ChooseOption: 'Elegir opción',
  ActivateAbility: 'Activar habilidad'
};

export function describeAction(action: GameAction, objects: Record<string, GameObject> = {}): string {
  const base = LABELS[action.type] ?? action.type;
  const data = action.data ?? {};
  if (action.type === 'MulliganDecision') {
    const choice = mulliganChoice(action);
    if (choice === 'Keep') return 'Conservar mano';
    if (choice === 'Mulligan') return 'Hacer mulligan';
    if (choice === 'FreeReveal') return 'Revelar y robar de nuevo';
    return 'Usar Serum Powder';
  }
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

/** Keep the safest, most common decision visible without scrolling. */
export function mulliganChoice(action: GameAction): string | undefined {
  const choice = action.data?.choice;
  if (typeof choice === 'string') return choice;
  if (choice && typeof choice === 'object' && 'type' in choice) return String((choice as { type: unknown }).type);
  return undefined;
}

export function isKeepHand(action: GameAction): boolean {
  return action.type === 'MulliganDecision' && mulliganChoice(action) === 'Keep';
}

export function actionPriority(action: GameAction): number {
  if (action.type === 'PassPriority') return 0;
  if (isKeepHand(action)) return 0;
  if (action.type === 'PlayLand') return 1;
  if (action.type === 'CastSpell') return 2;
  if (action.type === 'DeclareAttackers' || action.type === 'DeclareBlockers') return 2;
  return 3;
}

export function isPassPriority(action: GameAction): boolean {
  return action.type === 'PassPriority';
}

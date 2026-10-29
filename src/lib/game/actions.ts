import type { GameAction, GameObject } from '#lib/engine/types.ts';

const LABELS: Record<string, string> = {
  PassPriority: 'Pasar prioridad',
  PlayLand: 'Jugar tierra',
  CastSpell: 'Lanzar hechizo',
  DeclareAttackers: 'Declarar atacantes',
  DeclareBlockers: 'Declarar bloqueadoras',
  MulliganDecision: 'Decisión de mulligan',
  ChooseOption: 'Elegir opción',
  ActivateAbility: 'Activar habilidad',
  TapLandForMana: 'Girar tierra para maná',
  ActivateManaSource: 'Activar fuente de maná',
  SelectTargets: 'Elegir objetivos',
  ChooseTarget: 'Elegir objetivo',
  ChooseReplacement: 'Elegir efecto de reemplazo',
  PayManaAbilityMana: 'Pagar maná',
  Equip: 'Equipar',
  Foretell: 'Predecir'
};

function actionObjectId(action: GameAction): number | undefined {
  const data = action.data ?? {};
  const selection = data.selection as { source?: { object_id?: number } } | undefined;
  const id = data.object_id ?? data.source_id ?? selection?.source?.object_id;
  return typeof id === 'number' ? id : undefined;
}

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
  const id = actionObjectId(action);
  const obj = id !== undefined ? objects[String(id)] : undefined;
  if (action.type === 'TapLandForMana' || action.type === 'ActivateManaSource') {
    return obj ? `Girar ${obj.name} para producir maná` : base;
  }
  if (obj && (action.type === 'PlayLand' || action.type === 'CastSpell' || action.type === 'ActivateAbility' || action.type === 'Equip' || action.type === 'Foretell')) {
    if (action.type === 'CastSpell') {
      const manual = (data.payment_mode as { type?: string } | string | undefined);
      const mode = typeof manual === 'string' ? manual : manual?.type;
      const targets = Array.isArray(data.targets) && data.targets.length ? ` · ${data.targets.length} objetivo(s)` : '';
      return `Lanzar ${obj.name}${targets} · ${mode === 'Manual' ? 'pago manual' : 'pago automático'}`;
    }
    return `${base}: ${obj.name}`;
  }
  if (action.type === 'DeclareAttackers' && Array.isArray(data.attacks)) {
    const names = data.attacks.map((a) => {
      const oid = Array.isArray(a) ? a[0] : (a as { object_id?: number }).object_id;
      return objects[String(oid)]?.name;
    }).filter(Boolean);
    if (names.length === data.attacks.length && names.length) return `Atacar con ${names.join(', ')}`;
    return data.attacks.length ? `Atacar con ${data.attacks.length} criatura${data.attacks.length === 1 ? '' : 's'}` : 'No atacar';
  }
  if (action.type === 'DeclareBlockers' && Array.isArray(data.assignments)) {
    if (!data.assignments.length) return 'No bloquear';
    const pairs = data.assignments.map((pair) => {
      const [blocker, attacker] = Array.isArray(pair) ? pair : [undefined, undefined];
      const b = objects[String(blocker)]?.name; const a = objects[String(attacker)]?.name;
      return b && a ? `${b} bloquea a ${a}` : null;
    }).filter(Boolean);
    return pairs.length === data.assignments.length ? pairs.join(' · ') : `Bloquear (${data.assignments.length} asignación${data.assignments.length === 1 ? '' : 'es'})`;
  }
  if (action.type === 'SelectTargets' && Array.isArray(data.targets)) return `Elegir ${data.targets.length} objetivo(s)`;
  if (action.type === 'ChooseTarget') return data.target ? 'Confirmar objetivo' : 'Sin objetivo';
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
  if (action.type === 'TapLandForMana' || action.type === 'ActivateManaSource') return 1;
  return 3;
}

export function isPassPriority(action: GameAction): boolean {
  return action.type === 'PassPriority';
}

const PHASE_GUIDE: Record<string, string> = {
  Untap: 'Se enderezan tus permanentes.',
  Upkeep: 'Mantenimiento: resuelve habilidades o pasa prioridad.',
  Draw: 'Robas carta. Después podrás jugar tierras y hechizos.',
  PreCombatMain: 'Fase principal: juega una tierra, gira tierras para maná y lanza hechizos.',
  BeginCombat: 'Inicio de combate: puedes responder antes de declarar atacantes.',
  DeclareAttackers: 'Declara qué criaturas atacan, o pasa para no atacar.',
  DeclareBlockers: 'Declara bloqueadoras para las criaturas atacantes, o pasa.',
  CombatDamage: 'Se asigna y resuelve el daño de combate.',
  EndCombat: 'Fin de combate: últimas respuestas antes de la fase principal.',
  PostCombatMain: 'Fase principal posterior: puedes lanzar hechizos si te queda maná.',
  End: 'Final del turno: responde o pasa.',
  Cleanup: 'Limpieza: se descartan cartas y termina el turno.'
};

export function decisionGuide(waitingType: string | undefined, phase: string | undefined, priorityPlayer: number | undefined): string {
  switch (waitingType) {
    case 'MulliganDecision': return '¿Conservas esta mano o haces mulligan?';
    case 'SelectTargets': return 'Elige los objetivos del hechizo o habilidad.';
    case 'ChooseTarget': return 'Elige un objetivo válido.';
    case 'ManaPayment': case 'PayManaAbilityMana': return 'Paga el coste de maná seleccionando fuentes disponibles.';
    case 'ChooseReplacement': return 'Varios efectos de reemplazo aplican; elige el orden.';
    case 'GameOver': return 'La partida terminó.';
    case 'Priority': return PHASE_GUIDE[phase ?? ''] ?? `Prioridad del Jugador ${(priorityPlayer ?? 0) + 1}: juega cartas, activa habilidades o pasa.`;
    default: return waitingType ? `Decisión pendiente: ${waitingType}` : 'Selecciona una carta para ver sus acciones.';
  }
}

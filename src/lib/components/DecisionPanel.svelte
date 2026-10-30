<script lang="ts">
  import { session } from '#lib/game/session.svelte.ts';
  import { actionPriority, actionsForObject, decisionGuide, describeAction, isKeepHand } from '#lib/game/actions.ts';
  import { manaText } from '#lib/game/cards.ts';
  import { actionObjectId, attackLabel, attackTargets, blockTargets, isManaAction, isManaPrompt, isTargetPrompt, manaActions, manualCast, targetLabel } from '#lib/game/interaction.ts';
  import type { GameAction } from '#lib/engine/types.ts';

  const s = $derived(session.snapshot);
  const waiting = $derived(s?.state.waiting_for);
  const kind = $derived(waiting?.type);
  const objects = $derived(s?.state.objects ?? {});
  const actions = $derived.by(() => {
    const seen = new Set<string>();
    return [...(s?.legal.actions ?? [])].sort((a, b) => actionPriority(a) - actionPriority(b)).filter((a) => {
      const key = JSON.stringify(a); if (seen.has(key)) return false; seen.add(key); return true;
    });
  });
  const selected = $derived(session.selected !== null ? objects[String(session.selected)] : undefined);
  const selectedActions = $derived(selected ? actionsForObject(s?.legal.by_object ?? {}, selected.id) : []);
  const casts = $derived(selectedActions.filter((a) => a.type === 'CastSpell'));
  const selectedMana = $derived(selected ? manaActionsFor(selected.id) : []);
  const otherSelected = $derived(selectedActions.filter((a) => a.type !== 'CastSpell' && !isManaAction(a)));
  const targetPrompt = $derived(isTargetPrompt(s));
  const manaPrompt = $derived(isManaPrompt(s));
  const progress = $derived(waiting?.data?.selection);
  const pendingId = $derived(waiting?.data?.pending_cast?.object_id);
  const pending = $derived(pendingId !== undefined ? objects[String(pendingId)] : undefined);
  const pendingCost = $derived(waiting?.data?.pending_cast?.cost ?? (pendingId !== undefined ? s?.legal.spell_costs[String(pendingId)] : undefined));
  const targetChoices = $derived(actions.filter((a) => a.type === 'ChooseTarget'));
  const sources = $derived(manaActionsFor());
  const pass = $derived(actions.find((a) => a.type === 'PassPriority'));
  const cancel = $derived(actions.find((a) => a.type === 'CancelCast'));
  const handled = new Set(['PassPriority', 'CancelCast', 'ChooseTarget', 'DeclareAttackers', 'DeclareBlockers', 'CastSpell', 'PlayLand', 'TapLandForMana', 'ActivateManaSource', 'MulliganDecision', 'SelectCards']);
  const REPRESENTED = new Set(['Priority', 'MulliganDecision', 'DiscardToHandSize', 'ConniveDiscard', 'TargetSelection', 'TriggerTargetSelection', 'ManaPayment', 'ManaAbilityManaPayment', 'ManaSourceSelection', 'DeclareAttackers', 'DeclareBlockers', 'GameOver', 'UnlessPayment']);
  const manaExtras = new Set(['UntapLandForMana', 'BackToManaPayment', 'PayManaAbilityMana', 'ChooseManaColor']);
  const globalActions = $derived(actions.filter((a) => !handled.has(a.type) && actionObjectId(a) === undefined && !isManaAction(a) && !(manaPrompt && manaExtras.has(a.type))));
  const attackDraft = $derived(Object.entries(session.attacks));
  const blockDraft = $derived(Object.entries(session.blocks));
  const selectedDestinations = $derived(selected ? attackTargets(s, selected.id) : []);
  const selectedBlockTargets = $derived(selected ? blockTargets(s, selected.id) : []);
  const canDeclare = $derived(actions.some((a) => a.type === kind));
  const discard = $derived(session.discardPrompt);
  const PHASES: Record<string, string> = { Untap: 'Enderezar', Upkeep: 'Mantenimiento', Draw: 'Robar', PreCombatMain: 'Fase principal', BeginCombat: 'Inicio de combate', DeclareAttackers: 'Ataque', DeclareBlockers: 'Bloqueo', CombatDamage: 'Daño de combate', EndCombat: 'Fin de combate', PostCombatMain: 'Fase principal posterior', End: 'Final', Cleanup: 'Limpieza' };
  function manaActionsFor(id?: number) { return manaActions(s, id); }
  function play(action: GameAction) { void session.dispatch(action); }
  function costFor(id: number) { return manaText(s?.legal.spell_costs[String(id)] ?? objects[String(id)]?.mana_cost) || 'Sin coste de maná'; }
  function manaLabel(a: GameAction) {
    const selection = a.data?.selection as { mana_type?: string; atomic_combination?: string[]; penalty?: { type?: string } } | undefined;
    const colors: Record<string, string> = { White: 'blanco', Blue: 'azul', Black: 'negro', Red: 'rojo', Green: 'verde', Colorless: 'incoloro' };
    const output = selection?.atomic_combination?.map((c) => colors[c] ?? c).join(' + ') ?? colors[selection?.mana_type ?? ''] ?? 'maná';
    const penalty = selection?.penalty?.type;
    const warning = penalty && penalty !== 'None' ? ' · tiene un coste adicional' : '';
    return `Producir ${output}${warning}`;
  }
</script>

<section class="decision" aria-label="Decisión pendiente" data-waiting={kind ?? 'none'}>
  <h2>Tu siguiente decisión</h2>
  {#if s}
    <p class="phase">Turno {s.state.turn_number} · {PHASES[s.state.phase] ?? s.state.phase} · Jugador {s.state.priority_player + 1}</p>
    <p class="waiting" aria-label="Guía de decisión" aria-live="polite">{decisionGuide(kind, s.state.phase, s.state.priority_player)}</p>

    {#if discard && discard.player === s.viewer}
      <div class="prompt" aria-label="Descartar hasta siete cartas">
        <strong>Descartar {discard.count} carta{discard.count === 1 ? '' : 's'}</strong>
        <p>Al terminar el turno solo puedes conservar siete cartas. Selecciona las cartas de tu mano que descartas.</p>
        <ul class="draft">{#each session.choosing as id (id)}<li>{objects[String(id)]?.name ?? `Carta ${id}`}</li>{#if !session.choosing.length}<li>Sin cartas elegidas.</li>{/if}{/each}</ul>
        <button type="button" class="primary" disabled={session.busy || session.choosing.length !== discard.count} onclick={() => session.confirmDiscard()}>Confirmar descarte ({session.choosing.length}/{discard.count})</button>
      </div>
    {:else if targetPrompt}
      <div class="prompt" aria-label="Objetivos del hechizo">
        <strong>{pending?.name ?? 'Elige un objetivo'}</strong>
        {#if pendingCost}<span>Coste: {manaText(pendingCost) || 'sin coste de maná'}</span>{/if}
        {#if progress}<span>Objetivo {progress.current_slot + 1} de {waiting?.data?.target_slots?.length ?? 1}</span>{/if}
        {#if waiting?.data?.mode_labels?.[progress?.current_slot ?? 0]}<span>{waiting.data.mode_labels[progress?.current_slot ?? 0]}</span>{/if}
        {#if progress?.selected_slots?.length}
          <ul class="draft">{#each progress.selected_slots as target, i (i)}<li>Objetivo {i + 1}: {targetLabel(target ?? undefined, objects)}</li>{/each}</ul>
        {/if}
        <p>Las cartas y jugadores válidos tienen el marcador ◎. Selecciónalos para elegir.</p>
        <details>
          <summary>Elegir desde una lista accesible ({targetChoices.length})</summary>
          <div class="actions">
            {#each targetChoices as action, i (i)}
              <button type="button" disabled={session.busy} onclick={() => play(action)}>{action.data?.target ? `Elegir ${targetLabel(action.data.target, objects)}` : 'No elegir objetivo'}</button>
            {/each}
          </div>
        </details>
      </div>
    {:else if manaPrompt}
      <div class="prompt" aria-label="Pago de maná">
        <strong>{pending?.name ?? 'Pago pendiente'}</strong>
        <span>Coste: {manaText(pendingCost) || 'sin coste de maná'}</span>
        <p>Selecciona una fuente resaltada para producir maná. La reserva aparece junto a tu vida. Phase comprobará el pago al confirmar.</p>
        {#if selected}
          <span>Fuente seleccionada: {selected.name}</span>
          <div class="actions">{#each selectedMana as action, i (i)}<button type="button" disabled={session.busy} onclick={() => play(action)}>{manaLabel(action)}</button>{/each}</div>
        {:else if sources.length}
          <p class="muted">{new Set(sources.map(actionObjectId)).size} fuente(s) disponible(s). Puedes elegirlas en el campo de batalla.</p>
        {/if}
        <div class="actions">
          {#each actions.filter((a) => a.type === 'UntapLandForMana' || a.type === 'BackToManaPayment' || a.type === 'PayManaAbilityMana' || a.type === 'ChooseManaColor') as action, i (i)}
            <button type="button" disabled={session.busy} onclick={() => play(action)}>{describeAction(action, objects)}</button>
          {/each}
        </div>
      </div>
    {:else if kind === 'DeclareAttackers'}
      <div class="prompt" aria-label="Preparar ataque">
        <p>Selecciona tus criaturas válidas. Si hay varios destinos, elige después un jugador, planeswalker o batalla.</p>
        {#if selected && selectedDestinations.length}
          <strong>Destino de {selected.name}</strong>
          <div class="actions">{#each selectedDestinations as destination, i (i)}<button type="button" onclick={() => session.chooseAttackDestination(selected.id, destination)}>Atacar a {attackLabel(destination, objects)}</button>{/each}</div>
        {/if}
        <ul class="draft" aria-label="Atacantes elegidos">
          {#each attackDraft as [id, destination] (id)}<li>{objects[id]?.name} → {attackLabel(destination, objects)} <button type="button" class="link" aria-label={`Quitar ${objects[id]?.name} del ataque`} onclick={() => session.removeAttack(Number(id))}>Quitar</button></li>{/each}
          {#if !attackDraft.length}<li>No has elegido atacantes.</li>{/if}
        </ul>
        {#if Object.keys(waiting?.data?.attacker_constraints ?? {}).length}<p class="muted">Hay criaturas con obligación de atacar; Phase indicará si falta alguna.</p>{/if}
      </div>
    {:else if kind === 'DeclareBlockers'}
      <div class="prompt" aria-label="Preparar bloqueo">
        <p>Selecciona una criatura atacante y después una bloqueadora válida, o al revés. Repite para asignar más bloqueadoras.</p>
        {#if selected && selectedBlockTargets.length}
          <strong>{selected.name} puede bloquear a:</strong>
          <div class="actions">{#each selectedBlockTargets as id (id)}<button type="button" onclick={() => session.selectObject(id)}>{objects[String(id)]?.name}</button>{/each}</div>
        {/if}
        <ul class="draft" aria-label="Bloqueos elegidos">
          {#each blockDraft as [blocker, attacker] (blocker)}<li>{objects[blocker]?.name} bloquea a {objects[String(attacker)]?.name} <button type="button" class="link" aria-label={`Quitar bloqueo de ${objects[blocker]?.name}`} onclick={() => session.removeBlock(Number(blocker))}>Quitar</button></li>{/each}
          {#if !blockDraft.length}<li>No has elegido bloqueos.</li>{/if}
        </ul>
        {#each Object.entries(waiting?.data?.block_requirements ?? {}) as [id, requirement] (id)}<p class="muted">{objects[id]?.name}: necesita {requirement.count} bloqueadoras.</p>{/each}
      </div>
    {:else if selected}
      <div class="prompt" aria-label={`Carta seleccionada: ${selected.name}`}>
        <strong>{selected.name}</strong>
        {#if casts.length}<span>Coste actual: {costFor(selected.id)}</span>{/if}
        <div class="actions">
          {#each casts as action, i (i)}
            <button type="button" class="primary" disabled={session.busy} onclick={() => play(action)}>Lanzar {selected.name}{casts.length > 1 ? ` · opción ${i + 1}` : ''}</button>
            <button type="button" disabled={session.busy} onclick={() => play(manualCast(action))}>Elegir maná manualmente</button>
          {/each}
          {#each otherSelected as action, i (i)}<button type="button" disabled={session.busy} onclick={() => play(action)}>{describeAction(action, objects)}</button>{/each}
          {#each selectedMana as action, i (i)}<button type="button" disabled={session.busy} onclick={() => play(action)}>{manaLabel(action)}</button>{/each}
        </div>
        {#if !selectedActions.length}<span class="muted">Esta carta no tiene una acción disponible ahora.</span>{/if}
        <button type="button" class="link" onclick={() => { session.inspect = selected.id; }}>Ampliar carta</button>
      </div>
    {:else if kind === 'MulliganDecision'}
      <div class="prompt" aria-label="Mulligan">
        <p>Puedes conservar esta mano de siete cartas o hacer mulligan. Phase aplicará la regla de Londres al robar de nuevo.</p>
        <div class="actions">{#each actions.filter((a) => a.type === 'MulliganDecision') as action, i (i)}<button type="button" class:primary={isKeepHand(action)} disabled={session.busy} onclick={() => play(action)}>{describeAction(action, objects)}</button>{/each}</div>
      </div>
    {:else if kind === 'Priority'}
      <p class="muted">Selecciona una carta de tu mano para jugarla o un permanente para ver sus opciones.</p>
      {#if session.autoPassPending}<p class="muted">Phase no ofrece acciones en esta ventana: se pasará la prioridad automáticamente.</p>{/if}
    {:else if !REPRESENTED.has(kind ?? '') && kind !== 'GameOver'}
      <p class="muted">Esta decisión todavía no tiene una representación visual completa. Puedes elegir una de las opciones legales que ofrece Phase:</p>
      <div class="actions">{#each actions.filter((a) => a.type !== 'PassPriority' && actionObjectId(a) === undefined).slice(0, 12) as action, i (i)}<button type="button" disabled={session.busy} onclick={() => play(action)}>{describeAction(action, objects)}</button>{/each}</div>
    {/if}

    <div class="actions confirmations">
      {#if discard && discard.player === s.viewer}
      {#if session.choosing.length !== discard.count}<span class="muted">Elige exactamente {discard.count} carta(s).</span>{/if}
    {:else if kind === 'DeclareAttackers'}
        <button type="button" class="primary" disabled={session.busy || !canDeclare} onclick={() => session.confirmAttackers()}>{attackDraft.length ? `Confirmar ataque (${attackDraft.length})` : 'No atacar'}</button>
      {:else if kind === 'DeclareBlockers'}
        <button type="button" class="primary" disabled={session.busy || !canDeclare} onclick={() => session.confirmBlockers()}>{blockDraft.length ? `Confirmar bloqueos (${blockDraft.length})` : 'No bloquear'}</button>
      {:else if manaPrompt && pass}
        <button type="button" class="primary" disabled={session.busy} onclick={() => play(pass)}>Confirmar pago</button>
      {:else if !targetPrompt && pass}
        <button type="button" class="primary" disabled={session.busy} onclick={() => play(pass)}>{s.state.stack.length ? 'Pasar · permitir respuestas' : 'Pasar'}</button>
      {/if}
      {#if (targetPrompt || manaPrompt) && cancel}<button type="button" disabled={session.busy} onclick={() => play(cancel)}>Cancelar lanzamiento</button>{/if}
      {#each globalActions as action, i (i)}
        <button type="button" class:primary={isKeepHand(action)} disabled={session.busy} onclick={() => play(action)}>{describeAction(action, objects)}</button>
      {/each}
    </div>
    {#if s.outcome}<p class="finished">{s.outcome.draw ? 'La partida terminó en empate.' : `Jugador ${s.outcome.winner! + 1} gana la partida.`}</p>{/if}
  {:else}<p class="muted">Inicia una partida para jugar.</p>{/if}
</section>

<style>
  .decision { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: .8rem; min-width: 0; }
  h2 { margin: 0 0 .4rem; font-size: .95rem; }
  .phase { margin: .2rem 0; font-size: .8rem; color: var(--ink-muted); }
  .waiting { margin: .2rem 0 .6rem; font-size: .88rem; font-weight: 600; }
  .prompt { display: grid; gap: .45rem; border: 1px solid var(--line); border-radius: 10px; padding: .65rem; background: var(--surface-2); }
  .prompt strong { font-size: .9rem; }
  .prompt span, .prompt p { font-size: .82rem; margin: 0; }
  .actions { display: flex; flex-direction: column; gap: .4rem; }
  .actions button, .confirmations > button { text-align: left; border: 1px solid var(--line); background: var(--surface); color: var(--ink); border-radius: 9px; padding: .55rem .65rem; font-size: .84rem; min-height: 36px; }
  .actions button.primary, .confirmations > button.primary { background: var(--accent); color: var(--accent-ink); border-color: var(--accent); font-weight: 650; }
  .confirmations { margin-top: .65rem; }
  .link { background: none; border: none; color: var(--focus); font-size: .78rem; padding: .2rem; text-align: left; }
  .muted { color: var(--ink-muted); font-size: .82rem; }
  .draft { margin: .2rem 0; padding-left: 1.1rem; font-size: .82rem; display: grid; gap: .3rem; }
  details { font-size: .8rem; }
  summary { cursor: pointer; padding: .3rem 0; }
  .finished { font-weight: 700; color: var(--ok); }
  button:disabled { opacity: .55; cursor: wait; }
</style>

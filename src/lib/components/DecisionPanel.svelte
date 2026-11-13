<script lang="ts">
  import { session } from '#lib/game/session.svelte.ts';
  import { actionPriority, actionsForObject, decisionGuide, describeAction, isKeepHand } from '#lib/game/actions.ts';
  import DamageAssignment from './DamageAssignment.svelte';
  import DiscardPrompt from './DiscardPrompt.svelte';
  import ChooseXPrompt from './ChooseXPrompt.svelte';
  import TriggerOrderPrompt from './TriggerOrderPrompt.svelte';
  import ModeChoicePrompt from './ModeChoicePrompt.svelte';
  import SearchPrompt from './SearchPrompt.svelte';
  import DigPrompt from './DigPrompt.svelte';
  import OptionalEffectPrompt from './OptionalEffectPrompt.svelte';
  import PayAmountPrompt from './PayAmountPrompt.svelte';
  import RevealPrompt from './RevealPrompt.svelte';
  import UnlessPrompt from './UnlessPrompt.svelte';
  import PairPrompt from './PairPrompt.svelte';
  import TokenHostPrompt from './TokenHostPrompt.svelte';
  import UnlessBranchPrompt from './UnlessBranchPrompt.svelte';
  import TributePrompt from './TributePrompt.svelte';
  import WardSacrificePrompt from './WardSacrificePrompt.svelte';
  import StartingPlayerPrompt from './StartingPlayerPrompt.svelte';
  import ScryPrompt from './ScryPrompt.svelte';
  import TapPowerPrompt from './TapPowerPrompt.svelte';
  import EquipPrompt from './EquipPrompt.svelte';
  import StationPrompt from './StationPrompt.svelte';
  import MultiTargetPrompt from './MultiTargetPrompt.svelte';
  import DistributePrompt from './DistributePrompt.svelte';
  import MoveCountersPrompt from './MoveCountersPrompt.svelte';
  import { manaText } from '#lib/game/cards.ts';
  import { actionObjectId, attackLabel, attackTargets, blockTargets, isManaAction, isManaPrompt, isTargetPrompt, manaActions, manualCast, targetLabel } from '#lib/game/interaction.ts';
  import type { GameAction } from '#lib/engine/types.ts';

  const s = $derived(session.snapshot);

  /**
   * En el teléfono este panel se fija al borde de la pantalla (arena.css, «un
   * teléfono es una pantalla»), así que deja de ocupar su fila en el flujo. La
   * mesa que hay detrás necesita saber cuánto mide para reservar ese alto: si
   * no, lo último del campo quedaría siempre debajo del panel.
   *
   * Se publica como `--decision-h` en el elemento raíz, medido de verdad y no
   * estimado, y se recalcula con cada cambio de contenido (la guía de Phase
   * pasa de dos a tres líneas según lo que pregunte).
   */
  let root = $state<HTMLElement | null>(null);
  $effect(() => {
    const element = root;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const publish = () => {
      const height = Math.ceil(element.getBoundingClientRect().height);
      document.documentElement.style.setProperty('--decision-h', `${height}px`);
    };
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(element);
    return () => observer.disconnect();
  });
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
  const REPRESENTED = new Set(['Priority', 'MulliganDecision', 'DiscardToHandSize', 'ConniveDiscard', 'TargetSelection', 'TriggerTargetSelection', 'ManaPayment', 'ManaAbilityManaPayment', 'ManaSourceSelection', 'DeclareAttackers', 'DeclareBlockers', 'AssignCombatDamage', 'AssignBlockerDamage', 'DiscardChoice', 'WardDiscardChoice', 'ChooseXValue', 'OrderTriggers', 'ModeChoice', 'AbilityModeChoice', 'SearchChoice', 'DigChoice', 'OptionalEffectChoice', 'OpponentMayChoice', 'PayAmountChoice', 'RevealChoice', 'PairChoice', 'ChooseTokenHost', 'GameOver', 'UnlessPayment', 'UnlessPaymentChooseCost', 'TributeChoice', 'WardSacrificeChoice', 'ChooseStartingPlayer', 'ScryChoice', 'SurveilChoice', 'CrewVehicle', 'SaddleMount', 'EquipTarget', 'StationTarget', 'MultiTargetSelection', 'DistributeAmong', 'MoveCountersDistribution']);
  const manaExtras = new Set(['UntapLandForMana', 'BackToManaPayment', 'PayManaAbilityMana', 'ChooseManaColor']);
  const globalActions = $derived(actions.filter((a) => !handled.has(a.type) && actionObjectId(a) === undefined && !isManaAction(a) && !(manaPrompt && manaExtras.has(a.type))));
  const attackDraft = $derived(Object.entries(session.attacks));
  const blockDraft = $derived(Object.entries(session.blocks));
  const selectedDestinations = $derived(selected ? attackTargets(s, selected.id) : []);
  const selectedBlockTargets = $derived(selected ? blockTargets(s, selected.id) : []);
  const canDeclare = $derived(actions.some((a) => a.type === kind));
  const discard = $derived(session.discardPrompt);
  // CR 107.3a: only the spell's controller announces X.
  const chooseX = $derived(session.chooseXPrompt);
  // CR 603.3b: only the controller of the triggered abilities orders them.
  const triggerOrder = $derived(session.triggerOrderPrompt);
  // CR 700.2: the modal's controller chooses its modes.
  const modes = $derived(session.modeChoicePrompt);
  // CR 701.23: a search lists the cards Phase will accept.
  const search = $derived(session.searchPrompt);
  // CR 701.20e: a "look at the top N" shows the cards and where each pile goes.
  const dig = $derived(session.digPrompt);
  // CR 608.2d: "you may …" asks the controller.
  const optional = $derived(session.optionalEffectPrompt);
  // CR 107.1c: an amount inside an engine-owned window.
  const pay = $derived(session.payAmountPrompt);
  // CR 701.20a: which card is shown, if any.
  const reveal = $derived(session.revealPrompt);
  // CR 118.12: pay or let the effect happen. Ahead of the mana block, which
  // still owns the tapping needed to pay.
  const unless = $derived(session.unlessPrompt);
  // CR 702.95a: soulbond partner, optional.
  const pair = $derived(session.pairPrompt);
  // Alchemy batch entry: the host the token enters with.
  const host = $derived(session.tokenHostPrompt);
  // CR 118.12a: "unless they X or Y" — which cost, not whether to pay.
  const branches = $derived(session.unlessBranchPrompt);
  // CR 702.104a: an opponent pays the tribute or denies it.
  const tribute = $derived(session.tributePrompt);
  // CR 702.21b: which permanents pay the ward cost.
  const wardSacrifice = $derived(session.wardSacrificePrompt);
  // CR 103.1: the roll winner names who starts.
  const startingPlayer = $derived(session.startingPlayerPrompt);
  // CR 701.22a / CR 701.25a: look at the top and keep any of it on top.
  const scry = $derived(session.scryPrompt);
  // CR 702.122a / CR 702.171a: tap creatures for crew or saddle.
  const tapPower = $derived(session.tapPowerPrompt);
  // CR 702.6a: which permanent the equipment attaches to.
  const equip = $derived(session.equipPrompt);
  // CR 702.184a: which single creature pays the station cost.
  const station = $derived(session.stationPrompt);
  // CR 601.2c: the set of targets a multi-target spell or ability asks for.
  const multiTarget = $derived(session.multiTargetPrompt);
  // CR 601.2d / CR 608.2d: the division of an amount among recipients.
  const distribute = $derived(session.distributePrompt);
  // CR 122.5: which counters leave the source, and where they land.
  const moveCounters = $derived(session.moveCountersPrompt);
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

<section class="decision" aria-label="Decisión pendiente" data-waiting={kind ?? 'none'} bind:this={root}>
  <!-- The heading block is a unit so the Arena HUD can put the prompt before
       the log without splitting the announced decision guide from its title. -->
  <div class="decision-head">
    <h2>Tu siguiente decisión</h2>
    {#if s}
      <p class="phase">Turno {s.state.turn_number} · {PHASES[s.state.phase] ?? s.state.phase} · Jugador {s.state.priority_player + 1}</p>
      <p class="waiting" aria-label="Guía de decisión" aria-live="polite">{decisionGuide(kind, s.state.phase, s.state.priority_player)}</p>
    {/if}
  </div>
  {#if s}

    {#if tapPower && tapPower.player === s.viewer}
      <TapPowerPrompt />
    {:else if equip && equip.player === s.viewer}
      <EquipPrompt />
    {:else if station && station.player === s.viewer}
      <StationPrompt />
    {:else if multiTarget && multiTarget.player === s.viewer}
      <MultiTargetPrompt />
    {:else if distribute && distribute.player === s.viewer}
      <DistributePrompt />
    {:else if moveCounters && moveCounters.player === s.viewer}
      <MoveCountersPrompt />
    {:else if scry && scry.player === s.viewer}
      <ScryPrompt />
    {:else if startingPlayer && startingPlayer.player === s.viewer}
      <StartingPlayerPrompt />
    {:else if wardSacrifice && wardSacrifice.player === s.viewer}
      <WardSacrificePrompt />
    {:else if tribute && tribute.player === s.viewer}
      <TributePrompt />
    {:else if branches && branches.player === s.viewer}
      <UnlessBranchPrompt />
    {:else if host && host.player === s.viewer}
      <TokenHostPrompt />
    {:else if pair && pair.player === s.viewer}
      <PairPrompt />
    {:else if unless && unless.player === s.viewer}
      <UnlessPrompt />
    {:else if reveal && reveal.player === s.viewer}
      <RevealPrompt />
    {:else if pay && pay.player === s.viewer}
      <PayAmountPrompt />
    {:else if optional && optional.player === s.viewer}
      <OptionalEffectPrompt />
    {:else if dig && dig.player === s.viewer}
      <DigPrompt />
    {:else if search && search.player === s.viewer}
      <SearchPrompt />
    {:else if modes && modes.player === s.viewer}
      <ModeChoicePrompt />
    {:else if triggerOrder && triggerOrder.player === s.viewer}
      <TriggerOrderPrompt />
    {:else if chooseX && chooseX.player === s.viewer}
      <ChooseXPrompt />
    {:else if discard && discard.player === s.viewer}
      <DiscardPrompt />
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
    {:else if kind === 'AssignCombatDamage' || kind === 'AssignBlockerDamage'}
      <DamageAssignment />
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
      {#if !session.discardReady}<span class="muted">{discard.upTo ? `Puedes descartar hasta ${discard.count} carta(s).` : `Elige exactamente ${discard.count} carta(s).`}</span>{/if}
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

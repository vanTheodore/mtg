<script lang="ts">
  import { session } from '#lib/game/session.svelte.ts';
  import { actionsForObject, describeAction } from '#lib/game/actions.ts';
  import type { GameAction } from '#lib/engine/types.ts';

  const snapshot = $derived(session.snapshot);
  const waiting = $derived(snapshot?.state.waiting_for);
  const actions = $derived(snapshot?.legal.actions ?? []);
  const objects = $derived(snapshot?.state.objects ?? {});
  let showAll = $state(false);
  const visible = $derived(showAll ? actions : actions.slice(0, 8));
  const selectedObject = $derived(session.selected !== null ? objects[String(session.selected)] : undefined);
  const selectedActions = $derived(selectedObject ? actionsForObject(snapshot?.legal.by_object ?? {}, selectedObject.id) : []);

  const PHASES: Record<string, string> = {
    Untap: 'Enderezar', Upkeep: 'Mantenimiento', Draw: 'Robar',
    PreCombatMain: 'Fase principal', BeginCombat: 'Inicio de combate',
    DeclareAttackers: 'Declarar atacantes', DeclareBlockers: 'Declarar bloqueadoras',
    CombatDamage: 'Daño de combate', EndCombat: 'Fin de combate',
    PostCombatMain: 'Fase principal posterior', End: 'Final', Cleanup: 'Limpieza'
  };

  function play(action: GameAction) { session.dispatch(action); }
</script>

<section class="decision" aria-label="Decisión pendiente" aria-live="polite">
  <h2>Decisión</h2>
  {#if snapshot}
    <p class="phase">Turno {snapshot.state.turn_number} · {PHASES[snapshot.state.phase] ?? snapshot.state.phase}</p>
    <p class="waiting">{waiting?.type === 'Priority' ? `Prioridad: Jugador ${snapshot.state.priority_player + 1}` : waiting?.type ?? '—'}</p>
    {#if selectedObject}
      <div class="selected" aria-label={`Acciones para ${selectedObject.name}`}>
        <strong>{selectedObject.name}</strong>
        {#if selectedActions.length}
          {#each selectedActions as action, i (i)}
            <button type="button" disabled={session.busy} onclick={() => play(action)}>{describeAction(action, objects)}</button>
          {/each}
        {:else}
          <span class="muted">Sin acciones legales para esta carta.</span>
        {/if}
        <button type="button" class="link" onclick={() => { session.inspect = selectedObject.id; }}>Ampliar carta</button>
      </div>
    {/if}
    {#if actions.length === 0}
      <p class="muted">No hay acciones legales disponibles.</p>
    {:else}
      <div class="actions">
        {#each visible as action, i (i)}
          <button type="button" class:primary={action.type === 'PassPriority' || action.type === 'KeepHand'} disabled={session.busy} onclick={() => play(action)}>
            {describeAction(action, objects)}
          </button>
        {/each}
      </div>
      {#if actions.length > 8}
        <button type="button" class="link" onclick={() => showAll = !showAll}>
          {showAll ? 'Mostrar menos' : `Ver ${actions.length - 8} acciones más`}
        </button>
      {/if}
    {/if}
  {:else}
    <p class="muted">Inicia una partida para ver las decisiones del motor.</p>
  {/if}
</section>

<style>
  .decision { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: .8rem; }
  h2 { margin: 0 0 .4rem; font-size: .95rem; }
  .phase { margin: .2rem 0; font-size: .82rem; color: var(--ink-muted); }
  .waiting { margin: .2rem 0 .6rem; font-size: .85rem; font-weight: 600; }
  .actions { display: flex; flex-direction: column; gap: .4rem; }
  .actions button { text-align: left; border: 1px solid var(--line); background: var(--surface-2); color: var(--ink); border-radius: 9px; padding: .5rem .65rem; font-size: .84rem; }
  .actions button.primary { background: var(--accent); color: var(--accent-ink); border-color: var(--accent); font-weight: 650; }
  .link { margin-top: .45rem; background: none; border: none; color: var(--focus); font-size: .8rem; padding: 0; }
  .muted { color: var(--ink-muted); font-size: .84rem; }
  .selected { display: grid; gap: .35rem; border: 1px solid var(--line); border-radius: 10px; padding: .55rem; margin-bottom: .6rem; background: var(--surface-2); }
  .selected strong { font-size: .84rem; }
  .selected button { text-align: left; border: 1px solid var(--line); background: var(--surface); color: var(--ink); border-radius: 8px; padding: .4rem .55rem; font-size: .82rem; }
</style>

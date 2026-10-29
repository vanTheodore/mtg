<script lang="ts">
  import CardView from './CardView.svelte';
  import { session } from '#lib/game/session.svelte.ts';
  import { actionsForObject, describeAction } from '#lib/game/actions.ts';
  import type { CardMeta, GameAction, GameObject } from '#lib/engine/types.ts';

  let {
    metas,
    objects,
    byObject
  }: {
    metas: Record<string, CardMeta>;
    objects?: Record<string, GameObject>;
    byObject?: Record<string, GameAction[]>;
  } = $props();
  let dialog: HTMLDialogElement | undefined = $state();
  const allObjects = $derived(objects ?? session.snapshot?.state.objects ?? {});
  const object = $derived(session.inspect !== null ? allObjects[String(session.inspect)] : undefined);
  const actions = $derived(object ? actionsForObject(byObject ?? session.snapshot?.legal.by_object ?? {}, object.id) : []);

  $effect(() => {
    if (object && dialog && !dialog.open) dialog.showModal();
    else if (!object && dialog?.open) dialog.close();
  });

  function close() { session.inspect = null; }
  function metaFor() {
    if (!object) return undefined;
    return metas[object.printed_ref?.oracle_id ?? ''] ?? metas[object.name.toLowerCase()];
  }
</script>

<dialog bind:this={dialog} onclose={close} aria-label="Carta ampliada">
  {#if object}
    <div class="inspect-body">
      <div class="inspect-card" style="--card-w: min(72vw, 320px)">
        <CardView {object} meta={metaFor()} />
      </div>
      <div class="inspect-info">
        <h2>{object.name}</h2>
        <p class="muted">Zona: {object.zone} · Controlador: Jugador {object.controller + 1}</p>
        {#if object.tapped}<p>Girada</p>{/if}
        {#if object.transformed}<p>Transformada</p>{/if}
        {#if actions.length}
          <h3>Acciones legales</h3>
          <div class="actions">
            {#each actions as action, i (i)}
              <button type="button" disabled={session.busy} onclick={() => { session.dispatch(action); close(); }}>
                {describeAction(action, allObjects)}
              </button>
            {/each}
          </div>
        {:else}
          <p class="muted">Sin acciones legales para esta carta ahora.</p>
        {/if}
        <button type="button" class="close" onclick={close}>Cerrar</button>
      </div>
    </div>
  {/if}
</dialog>

<style>
  dialog { border: 1px solid var(--line); border-radius: 16px; background: var(--surface); color: var(--ink); padding: 1.2rem; max-width: min(92vw, 680px); box-shadow: var(--shadow); }
  dialog::backdrop { background: rgb(0 0 0 / 55%); }
  .inspect-body { display: flex; gap: 1.2rem; flex-wrap: wrap; align-items: flex-start; }
  .inspect-info { flex: 1; min-width: 220px; }
  h2 { margin: 0 0 .4rem; font-size: 1.1rem; }
  h3 { margin: .8rem 0 .4rem; font-size: .9rem; }
  .muted { color: var(--ink-muted); font-size: .84rem; }
  .actions { display: flex; flex-direction: column; gap: .4rem; }
  .actions button { text-align: left; border: 1px solid var(--line); background: var(--surface-2); color: var(--ink); border-radius: 9px; padding: .5rem .65rem; }
  .close { margin-top: 1rem; border: 1px solid var(--line); background: var(--surface-2); color: var(--ink); border-radius: 9px; padding: .45rem .8rem; }
</style>

<script lang="ts">
  import CardView from './CardView.svelte';
  import { session } from '#lib/game/session.svelte.ts';
  import { actionsForObject, describeAction } from '#lib/game/actions.ts';
  import { isHidden } from '#lib/game/cards.ts';
  import { impressions } from '#lib/game/impressions.svelte.ts';
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
  const hidden = $derived(object ? isHidden(object) : false);
  const actions = $derived(object && !hidden ? actionsForObject(byObject ?? session.snapshot?.legal.by_object ?? {}, object.id) : []);
  const spanishText = $derived(object ? impressions.lookup.text(object.name) : undefined);

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
        <h2>{hidden ? 'Carta oculta' : object.name}</h2>
        <p class="muted">Zona: {object.zone} · Controlador: Jugador {object.controller + 1}</p>
        {#if !hidden && object.tapped}<p>Girada</p>{/if}
        {#if !hidden && object.transformed}<p>Transformada</p>{/if}
        {#if !hidden && spanishText}
          <section class="impression" aria-label="Texto de la impresión en español">
            <h3>Texto en español <span class="tag">impresión {impressions.lookup.printing(object.name)?.set ?? '—'}</span></h3>
            <p lang="es">{spanishText}</p>
            <p class="muted">Identidad de carta y reglas: {object.name} (motor Phase). El nombre impreso se mantiene en inglés cuando la fuente no publica el nombre localizado.</p>
          </section>
        {/if}
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
  .impression { border-top: 1px solid var(--line); padding-top: .5rem; margin-top: .5rem; display: grid; gap: .3rem; }
  .impression h3 { margin: 0; font-size: .88rem; display: flex; gap: .4rem; align-items: baseline; flex-wrap: wrap; }
  .impression p { margin: 0; font-size: .82rem; line-height: 1.4; }
  .tag { font-size: .7rem; border: 1px solid var(--line); border-radius: 999px; padding: .05rem .4rem; color: var(--ink-muted); font-weight: 500; }
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

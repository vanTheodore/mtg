<script lang="ts">
  /**
   * `WaitingFor::EquipTarget` — CR 301.5 + CR 702.6a: an equipment's equip
   * ability is paid and then the equipment attaches to a permanent it may
   * legally attach to.
   *
   * The engine lists those permanents and one `Equip` action per target, so this
   * block is only that list: nothing to compose, no threshold to check, and no
   * target legality of its own.
   */
  import { session } from '#lib/game/session.svelte.ts';

  const prompt = $derived(session.equipPrompt);
  const mine = $derived(prompt !== null && prompt.player === session.snapshot?.viewer);
  const objects = $derived(session.snapshot?.state.objects ?? {});
  const equipment = $derived(prompt ? objects[String(prompt.equipmentId)]?.name : undefined);
  const nameOf = (id: number) => objects[String(id)]?.name ?? `Objeto ${id}`;
</script>

{#if prompt && mine}
  <div class="prompt" aria-label="Equipar" data-equip-prompt>
    <strong>Equipar{equipment ? ` · ${equipment}` : ''}</strong>
    <p class="hint">Elige a quién se anexa. Los candidatos son los que acepta Phase (CR 702.6a).</p>
    {#if prompt.targets.length}
      <ul class="rows">
        {#each prompt.targets as id (id)}
          <li>
            <button type="button" class="row" disabled={session.busy} onclick={() => session.equipTo(id)}>
              {nameOf(id)}
            </button>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="hint">Phase no ofrece ningún permanente al que anexar.</p>
    {/if}
  </div>
{/if}

<style>
  .prompt {
    display: grid;
    gap: .45rem;
    padding: .65rem;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--surface-2);
  }
  strong { font-size: .9rem; }
  .hint { margin: 0; font-size: .78rem; color: var(--ink-2); }
  .rows { margin: 0; padding: 0; list-style: none; display: grid; gap: .3rem; }
  .row {
    width: 100%;
    min-height: 44px;
    padding: .45rem .55rem;
    border: 1px solid var(--line);
    border-radius: 9px;
    background: var(--surface-3);
    color: var(--ink);
    font: inherit;
    font-size: .84rem;
    font-weight: 650;
    text-align: left;
    cursor: pointer;
  }
  .row:disabled { opacity: .55; cursor: not-allowed; }
  .row:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
</style>

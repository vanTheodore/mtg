<script lang="ts">
  /**
   * `WaitingFor::CopyTargetChoice` — CR 707.2 + CR 707.9.
   *
   * One variant, three meanings, and the engine says which one it is:
   *   - `copy`: the entering object becomes a copy of the chosen permanent and
   *     takes its copiable values (Clone, Phantasmal Image, Vesuva);
   *   - `latch` (CR 707.2c): the chosen permanent's values are latched onto the
   *     source Aura's host — the Aura never becomes the copy (Metamorphic
   *     Alteration);
   *   - `tokenSource` (CR 707.1): the chosen permanent is the source a
   *     token-creation substitution copies (Esix, Fractal Bloom), and nothing is
   *     transformed.
   *
   * Copying does not target (CR 707.9), so hexproof and shroud do not narrow the
   * list: the block shows the permanents Phase published and nothing else. A
   * printed mana-value ceiling is a sentence about a list the engine already
   * filtered, never a second filter here.
   */
  import { session } from '#lib/game/session.svelte.ts';
  import { distinctTargetLabels, objectTarget } from '#lib/game/interaction.ts';
  import { manaText, typeLine as cardTypeLine } from '#lib/game/cards.ts';

  const prompt = $derived(session.copyTargetPrompt);
  const mine = $derived(prompt !== null && prompt.player === session.snapshot?.viewer);
  const objects = $derived(session.snapshot?.state.objects ?? {});
  const labels = $derived(distinctTargetLabels((prompt?.targets ?? []).map((id) => objectTarget(id)), objects));
  const nameOf = (id: number) => {
    const index = (prompt?.targets ?? []).indexOf(id);
    return (index >= 0 ? labels[index] : undefined) ?? objects[String(id)]?.name ?? `Objeto ${id}`;
  };
  const sourceName = $derived(prompt ? objects[String(prompt.sourceId)]?.name ?? `Objeto ${prompt.sourceId}` : '');
  const title = $derived.by(() => {
    if (!prompt) return '';
    if (prompt.purpose === 'latch') return '¿A quién imita el Aura?';
    if (prompt.purpose === 'tokenSource') return '¿De qué permanente son copia las fichas?';
    return `¿Qué permanente copia ${sourceName}?`;
  });
  // The board's own Spanish type line, so a copy candidate reads like a card and
  // not like the engine's DTO.
  function typeOf(id: number) {
    const object = objects[String(id)];
    return object ? cardTypeLine(object) : 'Permanente';
  }
  function costOf(id: number) {
    return manaText(objects[String(id)]?.mana_cost) ?? '';
  }
</script>

{#if prompt && mine}
  <div
    class="prompt"
    aria-label="Qué permanente se copia"
    data-copy-target
    data-copy-target-purpose={prompt.purpose}
    data-copy-target-count={prompt.targets.length}
    data-copy-target-ceiling={prompt.maxManaValue ?? ''}>
    <strong>{title}</strong>
    <p class="hint" data-copy-target-rule>
      {#if prompt.purpose === 'latch'}
        CR 707.2c: los valores copiables del permanente elegido se fijan sobre el huésped del Aura; el
        Aura no se convierte en copia y el original no cambia.
      {:else if prompt.purpose === 'tokenSource'}
        CR 707.1: el permanente elegido es la fuente de la copia que crea la sustitución. No se
        transforma nada: las fichas nacen copiando al elegido.
      {:else}
        CR 707.2: {sourceName} entra en el campo como copia del permanente que elijas y recibe sus
        valores copiables (nombre, tipos, coste de maná, texto y, si es criatura, fuerza y
        resistencia).
      {/if}
      Copiar no es objetivo (CR 707.9), así que la guardia y el velo no reducen esta lista.
    </p>
    {#if prompt.maxManaValue !== null}
      <p class="hint" data-copy-target-ceiling-note>
        La instrucción pone un techo de valor de maná {prompt.maxManaValue}; Phase ya filtró la lista.
      </p>
    {/if}
    <ul class="rows">
      {#each prompt.targets as id (id)}
        <li>
          <button
            type="button"
            class="row"
            data-copy-target-option={id}
            disabled={session.busy}
            onclick={() => session.chooseCopySource(id)}>
            <span class="name">{nameOf(id)}</span>
            <span class="type">{typeOf(id)}</span>
            {#if costOf(id)}<span class="cost">{costOf(id)}</span>{/if}
          </button>
        </li>
      {/each}
    </ul>
    <p class="hint" data-copy-target-excuse>
      La lista es la que publica Phase: no incluye al propio permanente que copia ni a nada que la
      instrucción excluya.
    </p>
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
    display: flex;
    align-items: baseline;
    gap: .45rem;
    width: 100%;
    min-height: 44px;
    padding: .35rem .55rem;
    border: 1px solid var(--line);
    border-radius: 9px;
    background: var(--surface-3);
    color: var(--ink);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .name { font-size: .84rem; font-weight: 650; }
  .type, .cost { font-size: .74rem; color: var(--ink-2); }
  .cost { margin-left: auto; }
  .row:disabled { opacity: .55; cursor: not-allowed; }
  .row:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
</style>

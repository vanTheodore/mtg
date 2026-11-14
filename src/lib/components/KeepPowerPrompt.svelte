<script lang="ts">
  /**
   * `WaitingFor::KeepWithinTotalPowerChoice` — CR 107.1c + CR 701.21a: keep any
   * number of your creatures whose **combined power** is at most the cap, then
   * sacrifice the rest (Slaughter the Strong, cap 4).
   *
   * This is the first block of the port whose window is a **sum** instead of a
   * count, so the running total is the interface: it says how much of the cap is
   * spent, it disables the creatures that would overflow it, and it never claims a
   * number it cannot compute — if Phase does not publish a power, the total is
   * marked incomplete and the engine stays the authority on the cap.
   *
   * Zero is legal ("any number" may be fewer, and zero) and it sacrifices
   * everything, so the button says that instead of looking broken.
   */
  import { session } from '#lib/game/session.svelte.ts';
  import { distinctTargetLabels, objectTarget } from '#lib/game/interaction.ts';

  const prompt = $derived(session.keepPowerPrompt);
  const mine = $derived(prompt !== null && prompt.player === session.snapshot?.viewer);
  const objects = $derived(session.snapshot?.state.objects ?? {});
  const labels = $derived(distinctTargetLabels((prompt?.eligible ?? []).map((id) => objectTarget(id)), objects));
  const nameOf = (id: number) => {
    const index = (prompt?.eligible ?? []).indexOf(id);
    return (index >= 0 ? labels[index] : undefined) ?? objects[String(id)]?.name ?? `Criatura ${id}`;
  };
  const total = $derived(session.keepPowerTotal);
  const picked = $derived(session.keepPowerPick.length);
  const incomplete = $derived(
    (prompt?.eligible ?? []).some((id) => session.powerOf(id) === undefined) && total === null
  );

  const totalLine = $derived.by(() => {
    if (!prompt) return '';
    if (total === null) {
      return `Fuerza elegida desconocida · el tope es ${prompt.cap}: Phase no publica la fuerza de todo lo elegido, así que la suma no se inventa.`;
    }
    return `Fuerza elegida ${total} de ${prompt.cap} · quedan ${Math.max(0, prompt.cap - total)}`;
  });

  const scopeLine = $derived.by(() => {
    if (!prompt) return '';
    if (prompt.chooserScope === 'forAll') {
      return `Eliges tú por todos los jugadores del efecto (CR 101.4), y ahora te toca el Jugador ${prompt.targetPlayer + 1}.`;
    }
    return `Eliges de entre las criaturas del Jugador ${prompt.targetPlayer + 1}; las demás se sacrifican (CR 701.21a).`;
  });

  const confirmLabel = $derived.by(() => {
    if (!prompt) return '';
    if (!picked) return 'Confirmar sin conservar ninguna';
    const sum = total === null ? 'suma sin publicar' : `suma ${total}`;
    const after = prompt.remainingPlayers.length ? ` · después elige el Jugador ${prompt.remainingPlayers[0] + 1}` : '';
    return `Conservar ${picked === 1 ? '1 criatura' : `${picked} criaturas`} (${sum}) y sacrificar el resto${after}`;
  });
</script>

{#if prompt && mine}
  <div class="prompt" aria-label="Conservar criaturas por fuerza total" data-keep-power data-keep-power-cap={prompt.cap}>
    <strong>Conservar criaturas · hasta {prompt.cap} de fuerza</strong>
    <p class="hint">
      Elige las criaturas que quieres conservar: lo que se mide no es cuántas, sino la <em>suma de su fuerza</em>, que no
      puede pasar de {prompt.cap} (CR 107.1c). Todas las demás se sacrifican.
    </p>
    <p class="hint">{scopeLine}</p>
    <p class="hint total" data-keep-power-total>{totalLine}</p>
    {#if incomplete}
      <p class="hint" data-keep-power-incomplete>Sólo cuentan las fuerzas que Phase publica; si falta alguna, confirma lo que quieras y deja que el motor haga la cuenta final.</p>
    {/if}
    {#if prompt.eligible.length}
      <ul class="rows">
        {#each prompt.eligible as id (id)}
          {@const power = session.powerOf(id)}
          {@const chosen = session.keepPowerIsPicked(id)}
          <li>
            <button
              type="button"
              class="row"
              aria-pressed={chosen}
              disabled={session.busy || (!chosen && !session.keepPowerFits(id))}
              data-keep-power-object={id}
              onclick={() => session.toggleKeepPower(id)}>
              <span class="tick" aria-hidden="true">{chosen ? '✓' : ''}</span>
              <span class="name">{nameOf(id)}</span>
              <span class="power">{power === undefined ? 'fuerza sin publicar' : `fuerza ${power}`}</span>
            </button>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="hint">Phase no publica criaturas que conservar.</p>
    {/if}
    <button
      type="button"
      class="primary"
      disabled={session.busy}
      data-keep-power-picked={picked}
      onclick={() => session.confirmKeepPower()}>
      {confirmLabel}
    </button>
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
  .total { font-weight: 650; color: var(--ink); }
  .rows { margin: 0; padding: 0; list-style: none; display: grid; gap: .3rem; }
  .row {
    display: flex;
    align-items: center;
    gap: .45rem;
    width: 100%;
    min-height: 44px;
    padding: .35rem .5rem;
    border: 1px solid var(--line);
    border-radius: 9px;
    background: var(--surface-3);
    color: var(--ink);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .row[aria-pressed='true'] {
    border-color: var(--accent);
    background: var(--surface-1);
    box-shadow: inset 3px 0 0 var(--accent);
  }
  .row:disabled { opacity: .55; cursor: not-allowed; }
  .row:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  .tick { width: 1.1ch; font-size: .9rem; font-weight: 800; color: var(--accent); }
  .name { flex: 1; font-size: .84rem; font-weight: 650; }
  .power { font-size: .7rem; letter-spacing: .04em; text-transform: uppercase; color: var(--ink-2); }
  .primary {
    min-height: 44px;
    padding: .45rem .7rem;
    border: 1px solid var(--accent);
    border-radius: 9px;
    background: var(--accent);
    color: var(--accent-ink);
    font: inherit;
    font-size: .84rem;
    font-weight: 650;
    cursor: pointer;
  }
  .primary:disabled { opacity: .55; cursor: not-allowed; }
  .primary:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
</style>

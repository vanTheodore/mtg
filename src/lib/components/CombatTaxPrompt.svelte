<script lang="ts">
  /**
   * `WaitingFor::CombatTaxPayment` — CR 508.1d + CR 508.1h + CR 509.1c + CR 509.1d.
   * A combat declaration the engine already validated and priced, paused before
   * anything is tapped or committed. Ghostly Prison, Propaganda, Sphere of
   * Safety, Norn's Annex: «creatures can't attack you unless you pay {2} for
   * each», and the same shape on the block side.
   *
   * The price is the engine's, twice: `total_cost` is the locked-in aggregate
   * and `per_creature` the breakdown for this exact proposal. The block prints
   * both and never re-prices them — a second price would be a second opinion
   * about a number the engine already froze (CR 508.1i–j, CR 509.1e–f).
   *
   * The answer is a bare boolean, `PayCombatTax { accept }`. Accept pays the
   * total and commits the paused declaration; decline discards the **whole**
   * proposal and rebuilds a fresh declare prompt (CR 508.1d, CR 509.1d), so
   * declining is a real move, not a dead end, and it is offered with its
   * consequence named.
   *
   * `pending` is the paused declaration itself, snapshotted as incarnation
   * references (CR 508.1k + CR 400.7): the block names the creatures and their
   * targets so the player sees what the accept commits, and never sends them
   * back — the engine re-validates its own snapshot.
   */
  import { session } from '#lib/game/session.svelte.ts';
  import { attackLabel, distinctTargetLabels, objectTarget } from '#lib/game/interaction.ts';
  import ManaCost from './ManaCost.svelte';

  const prompt = $derived(session.combatTaxPrompt);
  const mine = $derived(prompt !== null && prompt.player === session.snapshot?.viewer);
  const objects = $derived(session.snapshot?.state.objects ?? {});
  const nameOf = (id: number) => objects[String(id)]?.name ?? `Objeto ${id}`;
  const breakdown = $derived(prompt?.perCreature ?? []);
  const labels = $derived(
    distinctTargetLabels(breakdown.map((entry) => objectTarget(entry.id)), objects)
  );
  const labelOf = (index: number) => labels[index] ?? nameOf(breakdown[index]?.id ?? 0);
  const pending = $derived(prompt?.pending ?? { kind: 'unknown' as const });
  const joinEs = (names: string[]) =>
    names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`;
  const pendingLabels = $derived.by(() => {
    if (!prompt) return [];
    if (pending.kind === 'attack') {
      const labels = distinctTargetLabels(
        pending.attackers.map((attacker) => objectTarget(attacker.id)),
        objects
      );
      return pending.attackers.map((attacker, index) => {
        const name = labels[index] ?? nameOf(attacker.id);
        return attacker.target ? `${name} → ${attackLabel(attacker.target, objects)}` : name;
      });
    }
    if (pending.kind === 'block') {
      // Two Grizzly Bears, one on each side, are not the same creature. The
      // controller is published, so it is what separates them (CR 400.2).
      const labels = distinctTargetLabels(pending.pairs.flat().map(objectTarget), objects);
      return pending.pairs.map(
        (_, index) => `${labels[index * 2] ?? 'Criatura'} bloquea a ${labels[index * 2 + 1] ?? 'atacante'}`
      );
    }
    return [];
  });
  const bandLabels = $derived(
    pending.kind === 'attack'
      ? pending.bands
          .map((band) => joinEs(distinctTargetLabels(band.map(objectTarget), objects)))
          .filter((label) => label.length > 0)
      : []
  );
  const bandCount = $derived(pending.kind === 'attack' ? pending.bands.length : 0);
  const attacking = $derived(prompt?.context === 'attacking');
  const title = $derived(
    prompt?.context === 'attacking'
      ? 'Impuesto de ataque'
      : prompt?.context === 'blocking'
        ? 'Impuesto de bloqueo'
        : 'Impuesto de combate'
  );
  const rule = $derived(
    attacking
      ? 'CR 508.1d + CR 508.1h: el motor ya validó tu declaración y fijó el precio; pagar lo cobra y la declaración se completa, rechazar la descarta entera y vuelves a declarar.'
      : prompt?.context === 'blocking'
        ? 'CR 509.1c + CR 509.1d: el jugador defensor determina el coste total de bloquear y puede pagar o rechazar; rechazar descarta toda la declaración de bloqueo.'
        : 'CR 508.1d + CR 509.1c: el motor ya fijó el precio de esta declaración; pagar lo cobra y la declaración se completa, rechazar la descarta entera.'
  );
  const decline = $derived(
    attacking
      ? 'Rechazar descarta la declaración entera: ninguna criatura ataca y vuelves a declarar desde cero.'
      : prompt?.context === 'blocking'
        ? 'Rechazar descarta la declaración entera: ninguna criatura bloquea y vuelves a declarar bloqueos desde cero.'
        : 'Rechazar descarta la declaración entera y vuelves a declarar desde cero.'
  );
</script>

{#if prompt}
  <div
    class="prompt"
    aria-label={title}
    data-combat-tax
    data-combat-tax-context={prompt.context}
    data-combat-tax-creatures={breakdown.length}
    data-combat-tax-pending={pending.kind}
    data-combat-tax-bands={bandCount}>
    <strong>{title}</strong>
    <p class="hint" data-combat-tax-rule>{rule}</p>
    <p class="hint" data-combat-tax-total>
      Total fijado por el motor: <ManaCost cost={prompt.totalCost} label="Impuesto total" />
    </p>
    {#if breakdown.length}
      <ul class="rows">
        {#each breakdown as entry, index (entry.id)}
          <li class="row">
            <span class="name">{labelOf(index)}</span>
            <span class="cost"><ManaCost cost={entry.cost} label={`Impuesto de ${labelOf(index)}`} size="small" /></span>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="hint" data-combat-tax-empty>
        El motor no publica el desglose por criatura de este impuesto.
      </p>
    {/if}
    {#if pendingLabels.length}
      <p class="hint" data-combat-tax-pending-list>
        {attacking ? 'La declaración en pausa' : 'Los bloqueos en pausa'}: {pendingLabels.join('; ')}.
        {#if bandLabels.length}
          Incluye {bandLabels.length} {bandLabels.length === 1 ? 'banda' : 'bandas'}: {bandLabels.join('; ')}
          (CR 702.22c).
        {/if}
      </p>
    {/if}
    {#if !mine}
      <p class="hint" data-combat-tax-other>
        Este impuesto lo paga el Jugador {prompt.player + 1}: no es tu decisión. El precio y la
        declaración en pausa son públicos (CR 400.2).
      </p>
    {:else}
      <p class="hint" data-combat-tax-consequence>{decline}</p>
      <div class="actions">
        <button
          type="button"
          class="primary"
          data-combat-tax-accept
          disabled={session.busy}
          onclick={() => session.answerCombatTax(true)}>
          Pagar y completar la declaración
        </button>
        <button
          type="button"
          class="ghost"
          data-combat-tax-decline
          disabled={session.busy}
          onclick={() => session.answerCombatTax(false)}>
          Rechazar y volver a declarar
        </button>
      </div>
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
    display: flex;
    align-items: center;
    gap: .45rem;
    padding: .35rem .55rem;
    border: 1px solid var(--line);
    border-radius: 9px;
    background: var(--surface-3);
  }
  .name { font-size: .84rem; font-weight: 650; }
  .cost { margin-left: auto; }
  .actions { display: flex; gap: .4rem; flex-wrap: wrap; }
  .primary,
  .ghost {
    min-height: 44px;
    padding: .55rem .7rem;
    border-radius: 9px;
    font: inherit;
    font-size: .82rem;
    font-weight: 650;
    cursor: pointer;
  }
  .primary { border: 1px solid var(--accent); background: var(--accent); color: var(--accent-ink); }
  .ghost { border: 1px solid var(--line); background: var(--surface-3); color: var(--ink); }
  .primary:disabled,
  .ghost:disabled { opacity: .55; cursor: not-allowed; }
  .primary:focus-visible,
  .ghost:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
</style>

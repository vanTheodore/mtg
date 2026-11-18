<script lang="ts">
  /**
   * `WaitingFor::UnlessPaymentChooseCost` — CR 118.12a: a **disjunctive**
   * unless-cost, "unless they X or Y". Tergrid's Lantern is the reference card:
   * "unless they sacrifice a nonland permanent of their choice or discard a
   * card".
   *
   * This is not `UnlessPrompt`. There the question is pay-or-not for a single
   * cost; here the question is *which* cost, so the block cannot borrow that
   * sentence: each branch is an answer, and declining is the third answer,
   * which runs the effect.
   *
   * Where a branch cannot be named the block says so and shows the engine's
   * position instead of printing a rule the table only half knows. Phase still
   * accepts it — the ordinal is the same index the engine published.
   */
  import { session } from '#lib/game/session.svelte.ts';

  const prompt = $derived(session.unlessBranchPrompt);
  const mine = $derived(prompt !== null && prompt.player === session.snapshot?.viewer);
  const picked = $derived(session.branchPick);
  /** CR 702.24a: a run of disjunctions, one per age counter. */
  const sequence = $derived(prompt !== null && prompt.remainingChoices > 0);
</script>

{#if prompt && mine}
  <div class="prompt" aria-label="Elegir qué coste pagar" data-unless-branch>
    <strong>¿Qué pagas?</strong>
    <p class="hint">
      Pagas una de estas cosas.{#if prompt.effect} Si no pagas ninguna: <q>{prompt.effect}</q>.{/if}
    </p>
    {#if sequence}
      <p class="hint" data-sequence>
        Elección {prompt.chosen + 1} de {prompt.chosen + 1 + prompt.remainingChoices}
      </p>
    {/if}
    {#if prompt.branches.length === 0}
      <p class="hint">Phase no ofrece ningún coste que pagar.</p>
    {:else}
      <ul class="rows">
        {#each prompt.branches as branch (branch.index)}
          <li>
            <button
              type="button"
              class="row"
              aria-pressed={picked === branch.index}
              onclick={() => session.pickBranch(branch.index)}>
              {branch.label ?? `Opción ${branch.index + 1} · la mesa no nombra este coste`}
            </button>
          </li>
        {/each}
      </ul>
    {/if}
    <div class="actions">
      <button
        type="button"
        class="primary"
        disabled={session.busy || picked === null}
        onclick={() => session.confirmBranch()}>
        {picked === null || !prompt.branches[picked]
          ? 'Pagar el coste elegido'
          : `Pagar: ${prompt.branches[picked].label ?? `opción ${picked + 1}`}`}
      </button>
      <button
        type="button"
        class="ghost"
        disabled={session.busy}
        onclick={() => session.declineBranch()}>
        No pagar
      </button>
    </div>
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
  q { font-style: italic; }
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
  .row[aria-pressed='true'] { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }
  .actions { display: flex; gap: .4rem; flex-wrap: wrap; }
  .primary,
  .ghost {
    min-height: 44px;
    padding: .55rem .7rem;
    border-radius: 9px;
    font: inherit;
    font-size: .84rem;
    font-weight: 650;
    cursor: pointer;
  }
  .primary { flex: 1; border: 1px solid var(--accent); background: var(--accent); color: var(--accent-ink); }
  .primary:disabled { opacity: .55; cursor: not-allowed; }
  .ghost { border: 1px solid var(--line); background: var(--surface-3); color: var(--ink); }
  .row:focus-visible, .primary:focus-visible, .ghost:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }
</style>

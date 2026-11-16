<script lang="ts">
  /**
   * `WaitingFor::ExertChoice` — CR 508.1g + CR 701.43d. As attackers are declared,
   * the active player may pay the optional «exert this creature as it attacks»
   * cost on each eligible occurrence, one creature at a time; Phase re-prompts with
   * the rest of the queue (`remaining`) exactly like `UntapChoice`.
   *
   * The payoff and the price are both on the card: the ability that says «when you
   * exert», and CR 701.43b — it won't untap during your next untap step. The block
   * states the price because that is the decision.
   *
   * The identity of the occurrence never crosses. `permission` binds a source
   * incarnation and an occurrence, and it is opaque: the answer is the boolean and
   * the engine re-validates its own latched permission. So the «yes» here cannot
   * name the wrong ability — it names none.
   */
  import { session } from '#lib/game/session.svelte.ts';

  const prompt = $derived(session.exertPrompt);
  const mine = $derived(prompt !== null && prompt.player === session.snapshot?.viewer);
  const objects = $derived(session.snapshot?.state.objects ?? {});
  const nameOf = (id: number) => objects[String(id)]?.name ?? `Objeto ${id}`;
  const pending = $derived(prompt?.remaining.length ?? 0);
  const queued = $derived(prompt?.remaining ?? []);
</script>

{#if prompt && mine}
  <div
    class="prompt"
    aria-label="Exertar al atacar"
    data-exert
    data-exert-attacker={prompt.attacker}
    data-exert-pending={pending}
    data-exert-permission={prompt.permissionPublished ? 'published' : 'omitted'}>
    <strong>Exertar · {nameOf(prompt.attacker)}</strong>
    <p class="hint" data-exert-rule>
      CR 508.1g + CR 701.43d: al declarar atacantes puedes pagar el coste opcional «exertar esta
      criatura al atacar». Si lo pagas, CR 701.43b: no se endereza durante tu próximo paso de
      enderezar.
    </p>
    <p class="hint" data-exert-count>
      {pending === 0
        ? 'Es la última criatura de esta declaración que puede exertarse.'
        : `Quedan ${pending} ${pending === 1 ? 'criatura' : 'criaturas'} por decidir en esta declaración: ${queued
            .map(nameOf)
            .join(', ')}.`}
    </p>
    {#if prompt.permissionPublished}
      <p class="hint" data-exert-permission-note>
        La habilidad que se paga la identifica el motor por objeto, encarnación y ocurrencia; la
        respuesta sólo dice sí o no, así que no puede señalar otra.
      </p>
    {/if}
    <div class="row">
      <button
        type="button"
        class="primary"
        data-exert-accept
        disabled={session.busy}
        onclick={() => session.answerExert(true)}>
        Exertar {nameOf(prompt.attacker)}
      </button>
      <button
        type="button"
        class="ghost"
        data-exert-decline
        disabled={session.busy}
        onclick={() => session.answerExert(false)}>
        No exertar
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
  .row { display: flex; gap: .4rem; flex-wrap: wrap; }
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

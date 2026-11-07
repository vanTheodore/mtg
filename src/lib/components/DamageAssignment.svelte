<script lang="ts">
  /**
   * Combat-damage assignment — the view for `WaitingFor::AssignCombatDamage`
   * and `WaitingFor::AssignBlockerDamage` (CR 510.1c/d), the one table prompt
   * that used to fall back to a raw list of legal actions.
   *
   * The distributions are **Phase's own candidates**: `ai_support` publishes
   * them in `legal.actions` (lethal-first remainder, and "as though unblocked"
   * when that mode applies). This component only names them. It never computes
   * a split of its own, so a number shown here is a number the engine will
   * accept.
   */
  import { session } from '#lib/game/session.svelte.ts';
  import { describeAction } from '#lib/game/actions.ts';
  import type { GameAction, GameObject } from '#lib/engine/types.ts';

  type Slot = { blocker_id: number; lethal_minimum: number };
  type Data = {
    attacker_id?: number;
    blocker_id?: number;
    total_damage?: number;
    blockers?: Slot[];
    attackers?: number[];
    trample?: unknown;
    defending_player?: number;
    attack_target?: { type?: string; data?: number };
  };

  const s = $derived(session.snapshot);
  const waiting = $derived(s?.state.waiting_for);
  const data = $derived((waiting?.data ?? {}) as Data);
  const objects = $derived((s?.state.objects ?? {}) as Record<string, GameObject>);
  const combat = $derived(waiting?.type === 'AssignCombatDamage');
  const source = $derived(objects[String(combat ? data.attacker_id : data.blocker_id)]);
  const slots = $derived(combat ? (data.blockers ?? []) : (data.attackers ?? []).map((id) => ({ blocker_id: id, lethal_minimum: 0 })));
  const total = $derived(data.total_damage ?? 0);

  const candidates = $derived(
    (s?.legal.actions ?? []).filter((action) => action.type === 'AssignCombatDamage' || action.type === 'AssignBlockerDamage')
  );

  function nameOf(id: number): string {
    return objects[String(id)]?.name ?? `Objeto ${id}`;
  }

  /** Names the distribution the engine's candidate already carries. */
  function summary(action: GameAction): string {
    const payload = (action.data ?? {}) as {
      mode?: string;
      assignments?: [number, number][];
      trample_damage?: number;
      controller_damage?: number;
    };
    if (payload.mode === 'AsThoughUnblocked') return 'Repartir como si no estuviera bloqueada';
    const pairs = payload.assignments ?? [];
    const parts = pairs.filter(([, amount]) => amount > 0).map(([id, amount]) => `${amount} a ${nameOf(id)}`);
    const trample = payload.trample_damage ?? 0;
    const controller = payload.controller_damage ?? 0;
    if (trample > 0) {
      const defender = data.defending_player !== undefined ? `Jugador ${data.defending_player + 1}` : 'el defensor';
      parts.push(`${trample} de exceso a ${defender}`);
    }
    if (controller > 0) parts.push(`${controller} al controlador del planeswalker`);
    if (!parts.length) return 'Confirmar la asignación de Phase';
    return parts.join(', ');
  }

  function play(action: GameAction) {
    void session.dispatch(action);
  }
</script>

<section class="damage" aria-label="Asignación de daño de combate">
  <p class="lede">
    <strong>{combat ? 'Daño de combate' : 'Daño de bloqueadora'}</strong>
    {#if source}<span> · {source.name}</span>{/if}
    <span> · reparte {total}</span>
  </p>

  {#if slots.length}
    <ul class="slots" aria-label="Receptores">
      {#each slots as slot (slot.blocker_id)}
        <li>
          <span class="who">{nameOf(slot.blocker_id)}</span>
          {#if slot.lethal_minimum > 0}<span class="lethal">mínimo letal {slot.lethal_minimum}</span>{/if}
        </li>
      {/each}
    </ul>
  {/if}

  {#if candidates.length}
    <div class="options">
      {#each candidates as action, i (i)}
        <button type="button" disabled={session.busy} onclick={() => play(action)}>{summary(action)}</button>
      {/each}
    </div>
    <p class="note">Las cantidades las propone Phase; el motor las vuelve a validar al confirmar.</p>
  {:else}
    <p class="note">
      Phase no ha publicado una asignación para esta ventana. Elige entre las acciones legales que aparecen debajo: la
      interfaz no inventa repartos.
    </p>
    <div class="options">
      {#each (s?.legal.actions ?? []).filter((action) => action.type !== 'PassPriority').slice(0, 12) as action, i (i)}
        <button type="button" disabled={session.busy} onclick={() => play(action)}>{describeAction(action, objects)}</button>
      {/each}
    </div>
  {/if}
</section>

<style>
  .damage { display: grid; gap: .45rem; }
  .lede { margin: 0; font-size: .9rem; }
  .slots {
    display: flex;
    flex-wrap: wrap;
    gap: .4rem;
    list-style: none;
    margin: 0;
    padding: 0;
    font-size: .78rem;
  }
  .slots li {
    display: flex;
    gap: .35rem;
    align-items: baseline;
    border: 1px solid var(--line);
    border-radius: 999px;
    padding: .1rem .5rem;
  }
  .who { color: var(--ink); font-weight: 650; }
  .lethal { color: var(--ink-muted); }
  .options { display: flex; flex-wrap: wrap; gap: .4rem; }
  .options button {
    border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--line));
    border-radius: 9px;
    background: color-mix(in srgb, var(--accent) 12%, var(--surface));
    color: var(--ink);
    font: inherit;
    font-size: .8rem;
    padding: .35rem .6rem;
    min-height: 32px;
    cursor: pointer;
  }
  .options button:hover { border-color: var(--accent); }
  .options button:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  .note { margin: 0; font-size: .74rem; color: var(--ink-muted); }
</style>

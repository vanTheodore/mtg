<script lang="ts">
  /**
   * `WaitingFor::CastingVariantChoice` — CR 601.2b.
   *
   * More than one cast permission applies. Each button is the published
   * `ChooseCastingVariant` for that index. An option whose index is absent
   * from `legal.actions` is not rebuilt, and a published index past the option
   * list is not a button either. `CancelCast` appears only when it is legal.
   *
   * The face name is the object's: `Right` is the back face, anything else is
   * the face this seat can already see. The other seat sees the options and
   * gets no button (CR 400.2).
   */
  import { session } from '#lib/game/session.svelte.ts';
  import { castingVariantOffers, counterLabel, namedAbilityCost } from '#lib/game/interaction.ts';
  import ManaCost from './ManaCost.svelte';

  const prompt = $derived(session.castingVariantPrompt);
  const mine = $derived(prompt !== null && prompt.player === session.snapshot?.viewer);
  const objects = $derived(session.snapshot?.state.objects ?? {});
  const offers = $derived(castingVariantOffers(session.snapshot?.legal.actions ?? []));
  const object = $derived(prompt?.objectId != null ? objects[String(prompt.objectId)] : undefined);

  const VARIANT: Record<string, string> = {
    Normal: 'Lanzar normalmente',
    Adventure: 'Lanzar como Aventura',
    Omen: 'Lanzar como Presagio',
    Warp: 'Lanzar con Distorsión',
    Escape: 'Lanzar con Escape',
    Retrace: 'Lanzar con Retrazar',
    Harmonize: 'Lanzar con Armonizar',
    Mayhem: 'Lanzar con Mayhem',
    Flashback: 'Lanzar con Flashback',
    Aftermath: 'Lanzar con Secuela',
    Disturb: 'Lanzar con Perturbar',
    GraveyardPermission: 'Lanzar desde el cementerio',
    HandPermission: 'Lanzar desde la mano',
    Miracle: 'Lanzar con Milagro',
    Madness: 'Lanzar con Locura',
    Evoke: 'Lanzar con Evocar',
    Suspend: 'Lanzar desde Suspender',
    Plot: 'Lanzar desde Tramar',
    Foretell: 'Lanzar desde Predecir',
    Overload: 'Lanzar con Sobrecarga',
    Bestow: 'Lanzar con Otorgar',
    Blitz: 'Lanzar con Blitz',
    Mutate: 'Lanzar con Mutar',
    Awaken: 'Lanzar con Despertar',
    Cleave: 'Lanzar con Cleave',
    Impending: 'Lanzar con Impending',
    MoreThanMeetsTheEye: 'Lanzar convertida',
    Prototype: 'Lanzar con Prototipo',
    FaceDown: 'Lanzar boca abajo',
    Freerunning: 'Lanzar con Freerunning',
    Fuse: 'Lanzar con Fusión'
  };
  const SLOT: Record<string, string> = {
    Creature: 'criatura',
    Artifact: 'artefacto',
    Enchantment: 'encantamiento',
    Land: 'tierra',
    Planeswalker: 'planeswalker',
    Battle: 'batalla'
  };

  function faceLabel(face: string) {
    if (face === 'Right') return object?.back_face?.name ?? '';
    return object?.name ?? '';
  }
  function variantLabel(variant: string) {
    if (!variant) return 'Lanzamiento que el motor no nombró';
    return VARIANT[variant] ?? `Lanzar con ${variant}`;
  }
  function sourceName(id: number | null) {
    if (id == null || id === 0) return '';
    const source = objects[String(id)];
    if (!source || source.display_visible_to_viewer === false) return '';
    return source.name ?? '';
  }
  function authorityLine(option: NonNullable<typeof prompt>['options'][number]) {
    const authority = option.authority;
    if (!authority) return '';
    const parts: string[] = [];
    const via = sourceName(authority.sourceId);
    if (via) parts.push(`mediante ${via}`);
    if (authority.extraCost) {
      const named = namedAbilityCost(authority.extraCost);
      const cost = named.label ?? 'un coste que publica el motor';
      parts.push(authority.extraMode === 'Alternative'
        ? `en lugar de su coste de maná: ${cost}`
        : authority.extraMode === 'Additional'
          ? `además: ${cost}`
          : cost);
    }
    if (authority.counter) parts.push(`entra con un contador de ${counterLabel(authority.counter)}`);
    if (authority.frequency === 'OncePerTurnPerPermanentType') {
      parts.push(authority.slotType
        ? `usa su espacio de ${SLOT[authority.slotType] ?? authority.slotType}`
        : 'elige un tipo de permanente');
    } else if (authority.frequency === 'OncePerTurn') {
      parts.push('una vez este turno');
    } else if (authority.frequency && authority.frequency !== 'Unlimited') {
      parts.push(`frecuencia ${authority.frequency}`);
    }
    return parts.join(' · ');
  }
</script>

{#if prompt}
  <div
    class="prompt"
    aria-label="Elegir lanzamiento"
    data-cast-variant
    data-cast-variant-count={prompt.options.length}
    data-cast-variant-payment={prompt.paymentMode}>
    <strong>Elegir lanzamiento{object?.name ? ` · ${object.name}` : ''}</strong>
    <p class="hint" data-cast-variant-rule>
      CR 601.2b: más de un permiso vale para este hechizo. Eliges el que publicó el motor.
    </p>
    {#if prompt.paymentMode !== 'Auto'}
      <p class="hint" data-cast-variant-mode>El pago que sigue es el que publicó el motor: {prompt.paymentMode}.</p>
    {/if}
    {#if !mine}
      <ul class="faces" data-cast-variant-faces>
        {#each prompt.options as option (option.index)}
          <li>{variantLabel(option.variant)}{faceLabel(option.face) ? ` ${faceLabel(option.face)}` : ''}</li>
        {/each}
      </ul>
      <p class="hint" data-cast-variant-other>
        Este lanzamiento lo elige el Jugador {prompt.player + 1}: no es tu decisión (CR 400.2).
      </p>
    {:else}
      <div class="actions">
        {#each prompt.options as option (option.index)}
          {@const action = offers.byIndex.get(option.index)}
          {#if action}
            <button
              type="button"
              class="primary"
              data-cast-variant-option={option.index}
              data-cast-variant-kind={option.variant || 'unknown'}
              disabled={session.busy}
              onclick={() => session.answerCastingVariant(action)}>
              <span>{variantLabel(option.variant)}{faceLabel(option.face) ? ` ${faceLabel(option.face)}` : ''}</span>
              {#if option.manaCost}
                <ManaCost cost={option.manaCost} label="Coste de esta variante" size="small" />
              {/if}
              {#if option.additionalCost}
                {@const extra = namedAbilityCost(option.additionalCost)}
                <span class="type">{extra.label ?? 'un coste que publica el motor'}</span>
              {/if}
              {#if authorityLine(option)}
                <span class="type" data-cast-variant-authority>{authorityLine(option)}</span>
              {/if}
            </button>
          {/if}
        {/each}
        {#if offers.cancel}
          <button
            type="button"
            class="ghost"
            data-cast-variant-cancel
            disabled={session.busy}
            onclick={() => session.cancelCastingVariant()}>
            Cancelar
          </button>
        {/if}
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
  .faces { margin: 0; padding-left: 1.1rem; font-size: .78rem; }
  .actions { display: flex; gap: .4rem; flex-wrap: wrap; }
  .primary,
  .ghost {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: .2rem;
    min-height: 44px;
    padding: .55rem .7rem;
    border-radius: 9px;
    font: inherit;
    font-size: .82rem;
    font-weight: 650;
    cursor: pointer;
    text-align: left;
  }
  .primary { border: 1px solid var(--accent); background: var(--accent); color: var(--accent-ink); }
  .primary .type { font-size: .72rem; font-weight: 650; color: var(--accent-ink); }
  .ghost { border: 1px solid var(--line); background: var(--surface-3); color: var(--ink); }
  .primary:disabled,
  .ghost:disabled { opacity: .55; cursor: not-allowed; }
  .primary:focus-visible,
  .ghost:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
</style>

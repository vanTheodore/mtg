<script lang="ts">
  /**
   * `WaitingFor::AlternativeCastChoice` — CR 118.9.
   *
   * The caster pays the printed mana cost or the keyword-granted alternative.
   * The keyword chooses the words, not the envelope: both buttons dispatch the
   * published `ChooseAlternativeCast`, and a side the engine did not publish
   * is not rebuilt. `CancelCast` appears only when it is itself legal.
   *
   * CR 702.119a: an Emerge sacrifice is the engine's description, not a second
   * reading of the cost filter. The other seat sees the two prices and gets
   * no button (CR 400.2).
   */
  import { session } from '#lib/game/session.svelte.ts';
  import { alternativeCastOffers, emergeSacrificeLabel, namedAbilityCost } from '#lib/game/interaction.ts';
  import ManaCost from './ManaCost.svelte';

  const prompt = $derived(session.alternativeCastPrompt);
  const mine = $derived(prompt !== null && prompt.player === session.snapshot?.viewer);
  const objects = $derived(session.snapshot?.state.objects ?? {});
  const offers = $derived(alternativeCastOffers(session.snapshot?.legal.actions ?? []));
  const spell = $derived(
    prompt?.objectId != null ? objects[String(prompt.objectId)]?.name ?? '' : ''
  );
  const sacrifice = $derived(emergeSacrificeLabel(prompt?.additionalDescription));
  const extra = $derived(namedAbilityCost(prompt?.additionalCost));

  const KEYWORD: Record<string, { name: string; rule: string; suffix?: string }> = {
    Warp: { name: 'Distorsión', rule: 'Si pagas distorsión, la carta se exilia en el siguiente paso final.', suffix: 'se exilia en el paso final' },
    Evoke: { name: 'Evocar', rule: 'CR 702.74a: si pagas evocar, la criatura se sacrifica al entrar.' },
    Emerge: { name: 'Emerger', rule: 'CR 702.119a: pagas emerger y sacrificas lo que nombra el motor. El valor de maná de ese permanente reduce el coste.' },
    Dash: { name: 'Dash', rule: 'CR 702.109a: gana prisa y vuelve a la mano en el paso final.', suffix: 'gana prisa y vuelve a la mano' },
    Blitz: { name: 'Blitz', rule: 'CR 702.152a: gana prisa y robas si muere; se sacrifica en el paso final.' },
    Overload: { name: 'Sobrecarga', rule: 'CR 702.96a: el coste alternativo cambia «objetivo» por «cada».' },
    Bestow: { name: 'Otorgar', rule: 'CR 702.103a: se lanza como un aura con encantar criatura.' },
    Awaken: { name: 'Despertar', rule: 'CR 702.113a: además, una tierra tuya se convierte en una criatura elemental 0/0 con prisa.' },
    Cleave: { name: 'Cleave', rule: 'CR 702.148a: se quitan las palabras entre corchetes.' },
    Mutate: { name: 'Mutar', rule: 'CR 702.140a: se fusiona con una criatura no humana que controlas.' },
    Impending: { name: 'Impending', rule: 'CR 702.176a: entra con contadores de tiempo y no es criatura hasta retirar el último.' },
    Prototype: { name: 'Prototipo', rule: 'CR 702.160a: mientras sea criatura usa la fuerza, la resistencia y el coste de prototipo.' },
    Spectacle: { name: 'Espectáculo', rule: 'CR 702.137a: el coste alternativo está disponible porque un oponente perdió vidas este turno.' },
    Prowl: { name: 'Prowl', rule: 'CR 702.76a: el coste alternativo está disponible porque una criatura del tipo hizo daño de combate.' },
    FaceDown: { name: 'boca abajo', rule: 'CR 702.37c: se lanza boca abajo como una criatura 2/2.', suffix: 'criatura 2/2 hasta que se ponga boca arriba' },
    Surge: { name: 'Surge', rule: 'CR 702.117a: el coste alternativo está disponible porque se lanzó otro hechizo este turno.' },
    MoreThanMeetsTheEye: { name: 'More Than Meets the Eye', rule: 'CR 702.162a: se lanza convertida, con la cara trasera hacia arriba.' }
  };
  const copy = $derived(prompt ? KEYWORD[prompt.keyword] : undefined);
  const keywordName = $derived(copy?.name ?? (prompt?.keyword || 'la palabra que publicó el motor'));
  const rule = $derived(
    prompt?.keyword === 'Emerge'
      ? `CR 702.119a: pagas emerger y sacrificas ${sacrifice ?? 'un permanente que cumpla los requisitos'}. El valor de maná de ese permanente reduce el coste.`
      : copy?.rule ?? 'El motor publicó esta palabra clave. Esta mesa no inventa lo que hace después de pagar.'
  );
  const extraText = $derived(
    sacrifice ?? (extra.label ? extra.label : prompt?.additionalCost ? 'un coste que publica el motor' : '')
  );
</script>

{#if prompt}
  <div
    class="prompt"
    aria-label="Elegir coste de lanzamiento"
    data-alt-cast
    data-alt-cast-keyword={prompt.keyword || 'unknown'}
    data-alt-cast-payment={prompt.paymentMode}>
    <strong>Elegir coste de lanzamiento{spell ? ` · ${spell}` : ''}</strong>
    <p class="hint" data-alt-cast-rule>{rule}</p>
    {#if prompt.paymentMode !== 'Auto'}
      <p class="hint" data-alt-cast-mode>El pago que sigue es el que publicó el motor: {prompt.paymentMode}.</p>
    {/if}
    {#if !mine}
      <p class="hint" data-alt-cast-other>
        Este coste lo elige el Jugador {prompt.player + 1}: no es tu decisión (CR 400.2).
      </p>
    {:else}
      <div class="actions">
        {#if offers.normal}
          <button
            type="button"
            class="primary"
            data-alt-cast-normal
            disabled={session.busy}
            onclick={() => session.answerAlternativeCast(offers.normal!)}>
            <span>Lanzar normalmente</span>
            {#if prompt.normalCost}
              <ManaCost cost={prompt.normalCost} label="Coste impreso" size="small" />
            {/if}
          </button>
        {/if}
        {#if offers.alternative}
          <button
            type="button"
            class="primary"
            data-alt-cast-alternative
            disabled={session.busy}
            onclick={() => session.answerAlternativeCast(offers.alternative!)}>
            <span>Lanzar con {keywordName}</span>
            {#if prompt.alternativeCost}
              <ManaCost cost={prompt.alternativeCost} label="Coste alternativo" size="small" />
            {/if}
            {#if extraText}<span class="type">{extraText}</span>{/if}
            {#if copy?.suffix}<span class="type">{copy.suffix}</span>{/if}
          </button>
        {/if}
        {#if offers.cancel}
          <button
            type="button"
            class="ghost"
            data-alt-cast-cancel
            disabled={session.busy}
            onclick={() => session.cancelAlternativeCast()}>
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

<script lang="ts">
  /**
   * The bounded amount control shared by every prompt that asks for a number
   * inside an engine-owned window (`ChooseXValue`, `PayAmountChoice`).
   *
   * The window is a prop: this component holds no bound, no default and no
   * fallback. `value` is the caller's `parseAmount` reading, so `null` means
   * "not a number Phase would take" and the caller decides what to do with it.
   * The steppers stay live while `value === null`: they are the only way out of
   * an invalid entry without typing, and they step from the digits the player
   * typed rather than from the sanitised value, so a refused 99 is not thrown
   * away. Clamping happens here, recovery only — never on submission.
   */
  type Props = {
    raw: string;
    min: number;
    max: number;
    value: number | null;
    /** Prefix for the hint/error ids, so two prompts never share them. */
    name: string;
    inputLabel: string;
    decreaseLabel: string;
    increaseLabel: string;
    maxLabel: string;
    hint: string;
    error: string;
    oninput: (raw: string) => void;
    onstep: (delta: number) => void;
    onmaximum: () => void;
    onenter: () => void;
  };
  let {
    raw,
    min,
    max,
    value,
    name,
    inputLabel,
    decreaseLabel,
    increaseLabel,
    maxLabel,
    hint,
    error,
    oninput,
    onstep,
    onmaximum,
    onenter
  }: Props = $props();
  const hintId = $derived(`${name}-hint`);
  const errorId = $derived(`${name}-error`);
</script>

<div class="amount">
  <button
    type="button"
    class="step"
    aria-label={decreaseLabel}
    disabled={value !== null && value <= min}
    onclick={() => onstep(-1)}>−</button>
  <input
    class="field"
    type="text"
    inputmode="numeric"
    autocomplete="off"
    role="spinbutton"
    aria-label={inputLabel}
    aria-valuenow={value ?? undefined}
    aria-valuemin={min}
    aria-valuemax={max}
    aria-invalid={value === null}
    aria-describedby={`${hintId} ${errorId}`}
    value={raw}
    oninput={(event) => oninput(event.currentTarget.value)}
    onkeydown={(event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        onenter();
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        onstep(1);
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        onstep(-1);
      }
    }}
  />
  <button
    type="button"
    class="step"
    aria-label={increaseLabel}
    disabled={value !== null && value >= max}
    onclick={() => onstep(1)}>+</button>
  <button type="button" class="step wide" aria-label={maxLabel} onclick={onmaximum}>Máximo</button>
</div>
<p class="hint" id={hintId}>{hint}</p>
<!-- Pre-exists and only changes text: a region mounted together with its
     message does not announce it. -->
<p class="error" id={errorId} role="status" aria-live="polite">{error}</p>

<style>
  .amount { display: flex; align-items: center; gap: .35rem; flex-wrap: wrap; }
  .step {
    min-height: 44px;
    min-width: 44px;
    height: 44px;
    border: 1px solid var(--line);
    border-radius: 9px;
    background: var(--surface-3);
    color: var(--ink);
    font: inherit;
    font-size: 1.05rem;
    font-weight: 650;
    cursor: pointer;
  }
  .step.wide { min-width: 84px; padding: 0 .6rem; font-size: .84rem; }
  .step:disabled { opacity: .5; cursor: not-allowed; }
  .field {
    width: 5.5rem;
    height: 44px;
    border: 1px solid var(--line);
    border-radius: 9px;
    background: var(--surface-1);
    color: var(--ink);
    font: inherit;
    font-size: 1rem;
    font-weight: 650;
    text-align: center;
  }
  .field[aria-invalid='true'] { border-color: var(--danger, #e5484d); }
  .hint, .error { margin: 0; font-size: .78rem; }
  .hint { color: var(--ink-2); }
  .error { min-height: 1rem; color: var(--danger, #e5484d); }
  .step:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
</style>

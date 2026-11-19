import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

/**
 * The port's own bookkeeping, guarded.
 *
 * `REPRESENTED` is the list of `WaitingFor` variants that have a block of their
 * own in `DecisionPanel`; everything else falls back to the generic list of legal
 * actions. Adding a view means adding the name there, and three passes in a row
 * added a view *without* the name — the `replace()` that was supposed to append it
 * matched nothing and returned the file unchanged, so the counter in the docs said
 * 64 while the set still said 61.
 *
 * These assertions read both sources of truth: the engine enum and the panel. A
 * stale name (a variant the pin no longer has) fails, as does a count that moved
 * without this file moving with it.
 */
const PANEL = readFileSync('src/lib/components/DecisionPanel.svelte', 'utf8');
const ENGINE = readFileSync('crates/phase-engine/src/types/game_state.rs', 'utf8');

/** Every `WaitingFor` variant name, in declaration order. */
function variants(): string[] {
  const start = ENGINE.indexOf('pub enum WaitingFor {');
  expect(start).toBeGreaterThan(-1);
  let depth = 0;
  let end = start;
  for (; end < ENGINE.length; end += 1) {
    const char = ENGINE[end];
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  const body = ENGINE.slice(start, end).split('\n').slice(1);
  const names: string[] = [];
  let nesting = 0;
  for (const line of body) {
    const stripped = line.trim();
    if (nesting === 0) {
      const name = stripped.match(/^([A-Z][A-Za-z0-9]*)/)?.[1];
      const opensVariant =
        name !== undefined &&
        (stripped.startsWith(`${name} {`) ||
          stripped.startsWith(`${name},`) ||
          stripped.startsWith(`${name}(`) ||
          stripped === name);
      if (opensVariant) names.push(name);
    }
    nesting += (line.match(/\{/g)?.length ?? 0) - (line.match(/\}/g)?.length ?? 0);
  }
  return names;
}

/** The names inside `const REPRESENTED = new Set([...])`. */
function represented(): string[] {
  const set = PANEL.match(/const REPRESENTED = new Set\(\[(.*?)\]\);/s)?.[1];
  expect(set).toBeDefined();
  return [...(set as string).matchAll(/'([A-Za-z0-9]+)'/g)].map((entry) => entry[1]);
}

test('the engine still declares the variants this port counts against', () => {
  // Pinned 0.128.0 (`576e2bf5`): 148 variants. A pin bump that changes this number
  // has to move this constant and the docs' census together.
  expect(variants().length).toBe(148);
});

test('every represented name is a real variant of the pinned engine', () => {
  const known = new Set(variants());
  const stale = represented().filter((name) => !known.has(name));
  expect(stale).toEqual([]);
});

test('the represented set is exactly the number the docs publish', () => {
  // If a pass adds a view, it adds the name here and this number, together.
  expect(represented().length).toBe(102);
  // Duplicates would silently undercount the coverage.
  expect(new Set(represented()).size).toBe(represented().length);
});

test('the last passes are registered, not just rendered', () => {
  // The three that were rendered without being registered while this test did not
  // exist: the block drew fine in the lab because `/ux` mounts components itself,
  // so nothing caught the missing names.
  const names = represented();
  for (const name of ['EntryAttackTargetChoice', 'ReplacementChoice', 'CopyTargetChoice', 'ResolveAllConsent', 'UntapChoice', 'ChooseUntapSubset', 'ExertChoice', 'EnlistChoice', 'PayCost', 'PhyrexianPayment', 'CombatTaxPayment', 'OptionalCostChoice', 'DefilerPayment', 'ChooseFromZoneChoice', 'ModalFaceChoice', 'AlternativeCastChoice', 'CastingVariantChoice', 'ChoosePermanentTypeSlot', 'SpliceOffer', 'MutateMergeChoice', 'CipherEncodeChoice', 'OrderCostReductions', 'ResolutionOptionalPaymentChoice', 'RippleBottomOrder', 'RevealUntilBottomOrder', 'DigBottomOrder', 'ChooseRingBearer', 'ChooseLegend', 'BattleProtectorChoice', 'ChooseDungeon', 'ChooseDungeonRoom', 'BeholdChoice', 'PopulateChoice', 'SpecializeColor', 'ChooseRoomDoor']) {
    expect(names).toContain(name);
  }
});

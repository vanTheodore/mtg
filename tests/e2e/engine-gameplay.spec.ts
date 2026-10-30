import { expect, test } from '@playwright/test';

// Drives the real Rust/WASM engine through the production worker/ABI in Chromium.
// No mocks: catalog, decks, legal actions, mana, stack, combat and victory come
// from Phase. The policy only chooses among engine-authored legal actions.
test('motor real: maná, lanzamiento, objetivos, combate y victoria determinista', async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto('/');
  const result = await page.evaluate(async () => {
    // @ts-expect-error Vite serves this browser module at runtime inside Chromium.
    const { EngineClient } = await import('/src/lib/engine/client.ts');
    const catalog = await fetch('/data/cards.json').then((r) => r.json());
    const deck = (entries: [string, number][]) => entries.flatMap(([name, n]) => Array(n).fill(name));
    const legal = (snap: any) => {
      const out = [...snap.legal.actions];
      for (const actions of Object.values(snap.legal.by_object ?? {}) as any[][]) out.push(...actions);
      return out;
    };
    const priority = (a: any, snap: any) => {
      const d = a.data ?? {};
      if (a.type === 'MulliganDecision') return JSON.stringify(d.choice).includes('Keep') ? 0 : 90;
      if (['SelectTargets', 'ChooseTarget'].includes(a.type)) {
        const opponent = 1 - snap.viewer;
        const targets = a.type === 'SelectTargets' ? (d.targets ?? []) : (d.target ? [d.target] : []);
        const hitsOpponent = targets.some((t: any) => t?.Player === opponent || (t?.type === 'Player' && t?.data === opponent));
        return hitsOpponent ? 1 : 50;
      }
      if (['ChooseReplacement', 'PayManaAbilityMana'].includes(a.type)) return 1;
      if (a.type === 'DeclareAttackers') return (d.attacks?.length ?? 0) > 0 ? 2 : 80;
      if (a.type === 'DeclareBlockers') return (d.assignments?.length ?? 0) > 0 ? 3 : 80;
      if (a.type === 'CastSpell') return 4;
      if (a.type === 'PlayLand') return 5;
      if (a.type === 'TapLandForMana' || a.type === 'ActivateManaSource') {
        const total = snap.state.players.reduce((s: number, p: any) => s + (p.mana_pool?.total ?? 0), 0);
        return total < 8 ? 6 : 90;
      }
      if (a.type === 'ActivateAbility') return 7;
      if (a.type === 'PassPriority') return 8;
      return 1;
    };
    const choose = (snap: any) => {
      const pairs = snap.derived?.blocker_assignment_pairs;
      if (snap.state.waiting_for?.type === 'DeclareBlockers' && Array.isArray(pairs) && pairs.length) {
        return { type: 'DeclareBlockers', data: { assignments: pairs } };
      }
      return legal(snap).sort((a, b) => priority(a, snap) - priority(b, snap))[0];
    };
    const note = (obs: Set<string>, snap: any, action?: any) => {
      if (snap.state.players.some((p: any) => (p.mana_pool?.total ?? 0) > 0)) obs.add('mana');
      if (snap.state.stack?.length) obs.add('stack');
      if (Object.values(snap.state.objects ?? {}).some((o: any) => o.zone === 'Battlefield' && o.card_types?.core_types?.includes('Creature'))) obs.add('creature');
      if (snap.outcome) obs.add('game_over');
      if (action?.type === 'SelectTargets' || action?.type === 'ChooseTarget') obs.add('targets');
      if (action?.type === 'DeclareAttackers' && action.data?.attacks?.length) obs.add('attackers');
      if (action?.type === 'DeclareBlockers' && action.data?.assignments?.length) obs.add('blockers');
      for (const e of snap.events ?? []) {
        const s = JSON.stringify(e);
        if (s.includes('SpellCast')) obs.add('cast');
        if (s.includes('ManaAdded')) obs.add('mana');
        if (s.includes('TokenCreated')) obs.add('token');
        if (s.includes('ReplacementApplied')) obs.add('replacement');
        if (s.includes('"is_combat":true')) obs.add('combat_damage');
        if (s.includes('LifeChanged') && s.includes('"amount":-')) obs.add('life_loss');
      }
    };
    async function run(name: string, p0: string[], p1: string[], maxSteps: number, seed = 42) {
      const client = new EngineClient();
      try {
        let snap: any = await client.init({ protocol_version: 2, catalog, decks: { player: { main_deck: p0 }, opponent: { main_deck: p1 } }, seed, first_player: 0 });
        if (!snap.ok) throw new Error(`${name} init: ${snap.error}`);
        const stale: any = await client.action(snap.viewer, { type: 'PassPriority' }, 999);
        if (stale.ok || stale.code !== 'stale_action') throw new Error(`${name}: stale action was not rejected`);
        const obs = new Set<string>(); let steps = 0;
        note(obs, snap);
        while (steps < maxSteps && !snap.outcome) {
          const action = choose(snap);
          if (!action) break;
          const next: any = await client.action(snap.viewer, action, snap.revision);
          if (!next.ok) throw new Error(`${name} step ${steps}: ${next.code ?? next.error}`);
          snap = next; steps++; note(obs, snap, action);
        }
        return { name, steps, observed: [...obs], outcome: snap.outcome ?? null, metrics: snap.metrics };
      } finally { client.terminate(); }
    }
    const burn = await run('burn_victory', deck([['Mountain', 17], ['Lava Spike', 12], ['Lightning Bolt', 11]]), deck([['Island', 40]]), 700);
    const combat = await run('combat', deck([['Plains', 18], ['Savannah Lions', 22]]), deck([['Plains', 18], ['Savannah Lions', 22]]), 300, 42);
    return { burn, combat };
  });

  expect(result.burn.observed).toEqual(expect.arrayContaining(['mana', 'cast', 'targets', 'life_loss', 'game_over']));
  expect(result.burn.outcome?.winner).toBe(0);
  expect(result.combat.observed).toEqual(expect.arrayContaining(['attackers', 'blockers', 'combat_damage']));
  expect(result.burn.metrics?.wasm_compile_ms).toBeGreaterThan(0);
});

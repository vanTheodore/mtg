import { expect, test } from 'bun:test';
import { affectsMesaEngine } from './phase-upstream-watch';

test('tracks Phase source and parser changes but not the React client', () => {
  for (const path of [
    'crates/engine/src/game/engine.rs',
    'crates/engine/tests/integration/main.rs',
    'crates/phase-ast/src/types/ability.rs',
    'crates/phase-parser/src/parser/oracle_trigger.rs',
    'Cargo.toml',
    'Cargo.lock'
  ]) expect(affectsMesaEngine(path)).toBe(true);
  for (const path of [
    'client/src/components/modal/DistributeAmongModal.tsx',
    'client/src/i18n/locales/es/game.json',
    'crates/phase-ai/src/search.rs',
    'docs/screenshot.webp',
    'README.md'
  ]) expect(affectsMesaEngine(path)).toBe(false);
});

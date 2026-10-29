/**
 * The MTGJSON v3 → v5 adapter is the only place Mesa reshapes card data, so it
 * is tested against the real set file checked into `data/mtgjson/`, not a
 * hand-written stub.
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  colorLetters, deriveKeywords, isAtomicCardsFile, isMtgjsonV3SetFile, mtgjsonV3ToAtomic, type MtgjsonSetFile
} from '../catalog-source.ts';

const root = new URL('../../../../', import.meta.url).pathname;
const set = JSON.parse(readFileSync(join(root, 'data/mtgjson/10E.es.json'), 'utf8')) as MtgjsonSetFile;

describe('MTGJSON format guards', () => {
  test('a v3 set file is recognised and never mistaken for AtomicCards', () => {
    expect(isMtgjsonV3SetFile(set)).toBe(true);
    expect(isAtomicCardsFile(set)).toBe(false);
  });

  test('AtomicCards is recognised by its data map', () => {
    const atomic = { meta: { version: '5.3.0' }, data: { 'Lightning Bolt': [{ name: 'Lightning Bolt' }] } };
    expect(isAtomicCardsFile(atomic)).toBe(true);
    expect(isMtgjsonV3SetFile(atomic)).toBe(false);
  });

  test('a flat Phase export is neither of the two', () => {
    const flat = { 'lightning bolt': { name: 'Lightning Bolt' } };
    expect(isAtomicCardsFile(flat)).toBe(false);
    expect(isMtgjsonV3SetFile(flat)).toBe(false);
  });
});

describe('colors', () => {
  test('words become WUBRG letters', () => {
    expect(colorLetters(['White', 'Blue'])).toEqual(['W', 'U']);
    expect(colorLetters(['Red'])).toEqual(['R']);
    expect(colorLetters([])).toBeUndefined();
    expect(colorLetters(undefined)).toBeUndefined();
  });

  test('already-lettered input passes through, junk is dropped', () => {
    expect(colorLetters(['W', 'g'])).toEqual(['W', 'G']);
    expect(colorLetters(['Colorless'])).toBeUndefined();
  });
});

describe('mtgjsonV3ToAtomic on the real 10E set', () => {
  const converted = mtgjsonV3ToAtomic(set);

  test('every card survives the schema translation', () => {
    expect(Object.keys(converted.atomic.data)).toHaveLength(363);
    expect(converted.skipped).toEqual([]);
    expect(converted.set).toBe('10E');
    expect(converted.language).toBe('es');
  });

  test('Serra Angel keeps its identity, cost and colours', () => {
    const faces = converted.atomic.data['Serra Angel'];
    expect(faces).toHaveLength(1);
    const face = faces![0]!;
    expect(face.manaCost).toBe('{3}{W}{W}');
    expect(face.manaValue).toBe(5);
    expect(face.colors).toEqual(['W']);
    expect(face.type).toContain('Creature');
    expect(face.subtypes).toContain('Angel');
    expect(face.power).toBe('4');
    expect(face.toughness).toBe('4');
    expect(face.identifiers?.multiverseId).toBeDefined();
  });

  test('a colourless land gets empty colours and mana value 0, not missing keys', () => {
    // Phase's `CardFace` rejects a card with no `colors` and no `manaValue`; the
    // first real set exposed both: MTGJSON omits `colors` for lands and `cmc`
    // for cards with no mana cost. Omitting the keys made the engine panic with
    // "missing field `colors`" instead of loading the set.
    const face = converted.atomic.data['Terramorphic Expanse']![0]!;
    expect(face.colors).toEqual([]);
    expect(face.colorIdentity).toBeDefined();
    expect(face.manaValue).toBe(0);
    for (const entry of Object.values(converted.atomic.data)) {
      for (const card of entry) {
        expect(Array.isArray(card.colors)).toBe(true);
        expect(typeof card.manaValue).toBe('number');
      }
    }
  });

  test('the rules text comes from the English field, not the Spanish one', () => {
    const face = converted.atomic.data['Wrath of God']![0]!;
    // `text` is English in a localized v3 file; `originalText` is the Spanish one.
    expect(face.text).toContain('Destroy all creatures');
  });
});

describe('keyword derivation from the card text', () => {
  // MTGJSON v3 has no `keywords` field: the keyword line lives inside `text`.
  // A reader that only matched one keyword per line silently dropped every
  // combined line ("Flying, double strike"), and Phase then saw an unknown
  // effect — 62 cards in 10E were reported as parser gaps for that reason.
  test('one keyword per line', () => {
    expect(deriveKeywords('Flying')).toEqual(['Flying']);
    expect(deriveKeywords('Flying\nTrample')).toEqual(['Flying', 'Trample']);
  });

  test('several keywords on one comma-separated line', () => {
    expect(deriveKeywords('Flying, double strike')).toEqual(['Flying', 'Double strike']);
    expect(deriveKeywords('Flying, vigilance')).toEqual(['Flying', 'Vigilance']);
  });

  test('reminder text belongs to the keyword it follows', () => {
    expect(deriveKeywords('Flying, first strike (This creature can\'t be blocked except by creatures with flying.)'))
      .toEqual(['Flying', 'First strike']);
  });

  test('a line that is not purely keywords yields nothing', () => {
    // Nothing is inferred: a parameterised keyword or an ability sentence stays
    // out, and the card keeps its gap instead of looking supported.
    expect(deriveKeywords('Flying, protection from red')).toEqual([]);
    expect(deriveKeywords('When this creature enters, draw a card.')).toEqual([]);
    expect(deriveKeywords('{T}: Add {G}.')).toEqual([]);
  });

  test('each 10E keyword line that is a pure keyword list becomes keywords', () => {
    const converted = mtgjsonV3ToAtomic(set);
    expect(converted.atomic.data['Skyhunter Skirmisher']![0]!.keywords).toEqual(['Flying', 'Double strike']);
    expect(converted.atomic.data['Air Elemental']![0]!.keywords).toEqual(['Flying']);
    expect(converted.atomic.data['Serra Angel']![0]!.keywords).toEqual(['Flying', 'Vigilance']);
    // Not derivable without inventing the parameter: stays a declared gap.
    expect(converted.atomic.data['White Knight']?.[0]?.keywords ?? []).toEqual([]);
  });
});

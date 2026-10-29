import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { createLookup, displayText, loadImpressions, type ImpressionsFile } from '../impressions.ts';

const root = new URL('../../../../', import.meta.url);
const real = JSON.parse(readFileSync(new URL('static/data/impressions.es.json', root), 'utf8')) as ImpressionsFile;

const fixture: ImpressionsFile = {
  version: 1,
  language: 'es',
  source: 'test',
  generated_at: '2026-10-29T00:00:00.000Z',
  cards: {
    shock: { face_name: 'Shock', printed_text: 'El Choque hace 2 puntos de daño a la criatura o jugador objetivo.', set: '10E', printing_id: '150548' }
  }
};

describe('Spanish impressions', () => {
  test('the shipped file is well-formed and only describes real cards', () => {
    expect(real.version).toBe(1);
    expect(real.language).toBe('es');
    expect(Object.keys(real.cards).length).toBeGreaterThan(0);
    for (const [key, impression] of Object.entries(real.cards)) {
      expect(key).toBe(key.toLocaleLowerCase('en-US'));
      expect(impression.face_name.length).toBeGreaterThan(0);
      expect(impression.set).toMatch(/^[A-Z0-9]{2,6}$/);
      expect(impression.printed_text ?? impression.printed_type).toBeTruthy();
    }
  });

  test('looks up by English name, case- and whitespace-insensitively', () => {
    const lookup = createLookup(fixture);
    expect(lookup.text('  SHOCK ')).toContain('El Choque');
    expect(lookup.printing('shock')).toEqual({ set: '10E', id: '150548' });
  });

  test('never invents text for a card without an impression', () => {
    const lookup = createLookup(fixture);
    expect(lookup.text('Lightning Bolt')).toBeUndefined();
    expect(lookup.text(undefined)).toBeUndefined();
    expect(displayText(lookup, { name: 'Lightning Bolt' }, 'Deals 3 damage.')).toBe('Deals 3 damage.');
  });

  test('falls back to English when the source has no localized name', () => {
    const lookup = createLookup(fixture);
    expect(lookup.name('Shock')).toBeUndefined();
    expect(real.cards.shock!.printed_name).toBeUndefined();
  });

  test('a missing or broken file degrades to the English-only layer', async () => {
    const notFound = await loadImpressions(async () => ({ ok: false, status: 404, json: async () => ({}) }));
    expect(notFound.size).toBe(0);
    expect(notFound.text('Shock')).toBeUndefined();
    const broken = await loadImpressions(async () => ({ ok: true, json: async () => ({ version: 99 }) }));
    expect(broken.size).toBe(0);
    const throws = await loadImpressions(async () => { throw new Error('offline'); });
    expect(throws.size).toBe(0);
  });

  test('the real file covers cards that exist in the catalog', () => {
    const catalog = JSON.parse(readFileSync(new URL('static/data/cards.json', root), 'utf8')) as Record<string, { name?: string }>;
    for (const key of Object.keys(real.cards)) expect(key in catalog).toBe(true);
  });
});

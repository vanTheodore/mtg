import { expect, test } from '@playwright/test';

const svg = (label: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="488" height="680"><rect width="488" height="680" rx="24" fill="#243b35"/><text x="244" y="340" fill="#fff" font-size="32" text-anchor="middle">${label}</text></svg>`;
const image = (name: string) => `https://cards.scryfall.io/normal/${name}.jpg`;
const card = (name: string, id: string, oracle = `oracle-${id}`) => ({ id, oracle_id: oracle, name, image_uris: { normal: image(id) } });
const dfc = {
  id: 'delver-print', oracle_id: 'oracle-delver', name: 'Delver of Secrets // Insectile Aberration',
  card_faces: [
    { name: 'Delver of Secrets', image_uris: { normal: image('delver-front') } },
    { name: 'Insectile Aberration', image_uris: { normal: image('delver-back') } }
  ]
};

async function mockScryfall(page: import('@playwright/test').Page) {
  await page.route('**/cards.scryfall.io/**', async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop() ?? 'card';
    await route.fulfill({ contentType: 'image/svg+xml', body: svg(name) });
  });
  await page.route('**/api.scryfall.com/**', async (route) => {
    const url = new URL(route.request().url());
    let body: unknown = { object: 'error' }; let status = 404;
    if (url.pathname === '/cards/oracle/oracle-forest') { body = card('Forest', 'forest'); status = 200; }
    else if (url.pathname === '/cards/oracle/oracle-bears') { body = card('Grizzly Bears', 'bears'); status = 200; }
    else if (url.pathname === '/cards/oracle/oracle-delver') { body = dfc; status = 200; }
    else if (url.pathname === '/cards/named' && url.searchParams.get('exact') === 'Lightning Bolt') { body = card('Lightning Bolt', 'bolt', 'oracle-bolt'); status = 200; }
    else if (url.pathname === '/cards/named' && url.searchParams.get('exact') === 'Delver of Secrets') { body = dfc; status = 200; }
    else if (url.pathname === '/cards/search' && (url.searchParams.get('q') ?? '').includes('t:token')) {
      body = { data: [{ ...card('Soldier', 'soldier', 'oracle-soldier'), power: '1', toughness: '1', colors: ['W'], type_line: 'Token Creature — Soldier' }] }; status = 200;
    }
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
}

test('imágenes: oracle, nombre, cara DFC y ficha usan fallbacks reales de contrato', async ({ page }) => {
  await mockScryfall(page);
  await page.goto('/stress?hand=5&tokens=1');
  const forest = page.locator('[data-card-id="1000"]');
  await expect(forest).toHaveAttribute('data-image-state', 'ready');
  await expect(forest.locator('img')).toHaveAttribute('src', image('forest'));
  expect(await forest.locator('img').evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);

  const bolt = page.locator('[data-card-id="1003"]');
  await expect(bolt).toHaveAttribute('data-image-state', 'ready');
  await expect(bolt.locator('img')).toHaveAttribute('src', image('bolt'));

  const back = page.locator('[data-card-id="1002"]');
  await expect(back.locator('img')).toHaveAttribute('src', image('delver-back'));
  const legacyBack = page.locator('[data-card-id="1004"]');
  await expect(legacyBack.locator('img')).toHaveAttribute('src', image('delver-back'));

  const token = page.locator('[data-card-id="3000"]');
  await expect(token.locator('img')).toHaveAttribute('src', image('soldier'));
});

test('imagen caída mantiene nombre/reglas y el reintento recupera arte', async ({ page }) => {
  let bearsAvailable = false;
  await page.route('**/cards.scryfall.io/**', (route) => route.fulfill({ contentType: 'image/svg+xml', body: svg('bears') }));
  await page.route('**/api.scryfall.com/**', async (route) => {
    const url = new URL(route.request().url());
    const isBears = url.pathname.includes('oracle-bears') || url.searchParams.get('exact') === 'Grizzly Bears' || url.searchParams.get('fuzzy') === 'Grizzly Bears';
    if (isBears && bearsAvailable) return route.fulfill({ contentType: 'application/json', body: JSON.stringify(card('Grizzly Bears', 'bears')) });
    return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  });
  await page.goto('/stress?hand=2&tokens=0');
  const bears = page.locator('[data-card-id="1001"]');
  await expect(bears).toHaveAttribute('data-image-state', 'error');
  await expect(bears).toContainText('Grizzly Bears');
  await expect(bears).toContainText('2/2');
  bearsAvailable = true;
  await bears.locator('..').getByRole('button', { name: 'Reintentar imagen' }).click();
  await expect(bears).toHaveAttribute('data-image-state', 'ready');
});

test('información oculta no dispara búsquedas de imagen', async ({ page }) => {
  let calls = 0;
  await page.route('**/api.scryfall.com/**', async (route) => { calls++; await route.abort(); });
  await page.goto('/stress?hand=5&tokens=1&images=hidden');
  await expect(page.locator('[data-card-id="1001"]')).toHaveAttribute('data-hidden', 'true');
  await page.waitForTimeout(400);
  expect(calls).toBe(0);
  await expect(page.locator('.card img')).toHaveCount(0);
});

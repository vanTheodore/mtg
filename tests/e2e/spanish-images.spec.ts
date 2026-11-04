import { expect, test } from '@playwright/test';

test('imágenes españolas: selector, escaneo válido, fallback y privacidad', async ({ page }) => {
  test.setTimeout(90_000);
  const apiRequests: string[] = [];
  const cardName = 'Grizzly Bears';
  const spanishArt = 'https://cards.scryfall.io/normal/es-grizzly-bears.svg';

  // All API responses are local and deterministic. Never depend on external
  // availability, an actual Scryfall account or copyrighted image fixtures.
  await page.route('**/api.scryfall.com/**', async (route) => {
    const url = new URL(route.request().url());
    apiRequests.push(url.toString());
    const query = url.searchParams.get('q') ?? '';
    if (url.pathname === '/cards/search' && query.includes('lang:es') && query.includes(cardName)) {
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ object: 'list', data: [{
          id: 'spanish-bears', name: cardName, lang: 'es',
          oracle_id: 'oracle-bears', image_status: 'highres_scan',
          image_uris: { normal: spanishArt }
        }] })
      });
    } else {
      await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    }
  });
  await page.route('**/cards.scryfall.io/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="488" height="680"><rect width="488" height="680" fill="#eee"/></svg>' })
  );

  // A hidden fixture must not expose its identities to the image provider,
  // including when the user switches the language setting.
  await page.goto('/stress?hand=2&tokens=0&images=hidden');
  const hidden = page.locator('[data-card-id="1001"]');
  await expect(hidden).toHaveAccessibleName('Carta oculta');
  await page.getByRole('button', { name: 'Ajustes' }).click();
  const language = page.getByLabel('Idioma de la imagen de la carta');
  await language.selectOption('es');
  await expect(language).toHaveValue('es');
  expect(await page.evaluate(() => localStorage.getItem('mesa:cardImageLanguage'))).toBe('es');
  expect(apiRequests).toHaveLength(0);

  // Reloading the UI must restore the persisted preference. Only the
  // currently visible face is allowed to request a Spanish printing.
  await page.goto('/stress?hand=2&tokens=0');
  const card = page.locator('[data-card-id="1001"]');
  await expect(card).toHaveAttribute('data-hidden', 'false');
  await expect(card).toHaveAttribute('data-image-state', 'ready', { timeout: 45_000 });
  await expect(card.locator('img')).toHaveAttribute('src', spanishArt);
  await expect(card).toHaveAccessibleName(/Grizzly Bears/);
  await expect(card).toHaveAccessibleDescription(/Una criatura sencilla/);
  expect(apiRequests.some((url) => new URL(url).searchParams.get('q')?.includes('lang:es') &&
    new URL(url).searchParams.get('q')?.includes(cardName))).toBe(true);

  // Switching back must invalidate the chosen image and re-resolve the card.
  await page.getByRole('button', { name: 'Ajustes' }).click();
  const restored = page.getByLabel('Idioma de la imagen de la carta');
  await expect(restored).toHaveValue('es');
  await restored.selectOption('en');
  await expect(card).toHaveAttribute('data-image-state', 'error', { timeout: 45_000 });
  await expect(card.locator('img')).toHaveCount(0);
  await expect(card).toHaveAccessibleName(/Grizzly Bears/);
  expect(await page.evaluate(() => localStorage.getItem('mesa:cardImageLanguage'))).toBe('en');
});

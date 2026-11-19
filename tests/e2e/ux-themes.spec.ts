import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

/**
 * Mesa — las vistas de `WaitingFor` en los dos temas.
 *
 * Cada bloque nuevo de esta rama tiene su escena en el laboratorio (`/ux`). Esta
 * prueba las recorre en tema claro y oscuro y deja una captura de cada par en
 * `docs/screenshots/temas/`, además de auditar con axe **en los dos temas**: un
 * contraste que falla en oscuro no se ve en una captura clara, y al revés.
 *
 * El tema se cambia por el camino del producto: `localStorage['mesa:theme']` es
 * lo que lee `session.setTheme` (y lo que el ajuste escribe). La prueba comprueba
 * después que `data-theme` cambió de verdad, para que una captura no salga
 * etiquetada como oscura con la paleta clara.
 *
 * Se captura con el cromo clásico (`mesa:boardStyle = classic`). El cromo de
 * arena, que es el de por defecto, **no sigue el tema a propósito**
 * (`arena.css`, `.app[data-chrome="arena"]`): va sobre el arte, con su propia
 * paleta, para que el tablero se lea igual con el tema del sistema en claro o en
 * oscuro. Las capturas de este fichero existen para revisar el tema, así que se
 * toman donde el tema manda.
 */
// Este fichero recorre **todas** las escenas dentro de un solo `test` por tema
// (dos capturas y dos auditorías por escena), así que su presupuesto es el del
// recorrido entero y crece con el catálogo; el límite del proyecto es para un test
// corto. Cuando la lista crezca otra vez, este número es el que hay que mirar.
test.describe.configure({ timeout: 1_410_000 });

const shotsDir = fileURLToPath(new URL('../../docs/screenshots/temas/', import.meta.url));

/** Las escenas que esta rama añadió, con el nombre que llevará el fichero. */
const SCENES = [
  { scene: 'pay', slug: 'cargo-con-importe', block: '[data-pay-amount]' },
  { scene: 'opponent', slug: 'puede-un-oponente', block: '[data-optional-effect]' },
  { scene: 'reveal', slug: 'ensenar-una-carta', block: '[data-reveal-prompt]' },
  { scene: 'unless', slug: 'pagar-o-aceptar', block: '[data-unless-prompt]' },
  { scene: 'pair', slug: 'emparejar', block: '[data-pair-prompt]' },
  { scene: 'host', slug: 'destinatario-ficha', block: '[data-token-host]' },
  { scene: 'branches', slug: 'pagar-uno-de-dos', block: '[data-unless-branch]' },
  { scene: 'tribute', slug: 'tributo', block: '[data-tribute]' },
  { scene: 'ward', slug: 'guardia', block: '[data-ward-sacrifice]' },
  { scene: 'wardPower', slug: 'guardia-poder', block: '[data-ward-sacrifice]' },
  { scene: 'startingPlayer', slug: 'quien-empieza', block: '[data-starting-player]' },
  { scene: 'scry', slug: 'adivinar', block: '[data-scry-prompt]' },
  { scene: 'surveil', slug: 'vigilar', block: '[data-scry-prompt]' },
  { scene: 'crew', slug: 'tripular', block: '[data-tap-power]' },
  { scene: 'saddle', slug: 'montar', block: '[data-tap-power]' },
  { scene: 'equip', slug: 'equipar', block: '[data-equip-prompt]' },
  { scene: 'station', slug: 'estacion', block: '[data-station-prompt]' },
  { scene: 'multiTarget', slug: 'objetivos-multiples', block: '[data-multi-target]' },
  { scene: 'multiTargetExact', slug: 'objetivos-fijos', block: '[data-multi-target]' },
  { scene: 'distribute', slug: 'reparto', block: '[data-distribute]' },
  { scene: 'distributeAnnounced', slug: 'reparto-anunciado', block: '[data-distribute]' },
  { scene: 'moveCounters', slug: 'mover-contadores', block: '[data-move-counters]' },
  { scene: 'retarget', slug: 'cambiar-objetivos', block: '[data-retarget]' },
  { scene: 'retargetSingle', slug: 'cambiar-objetivo', block: '[data-retarget]' },
  { scene: 'chooseObjects', slug: 'elegir-permanentes', block: '[data-choose-objects]' },
  { scene: 'chooseObjectsRecipient', slug: 'elegir-receptor', block: '[data-choose-objects]' },
  { scene: 'proliferate', slug: 'proliferar', block: '[data-proliferate]' },
  { scene: 'timeTravelRemove', slug: 'viaje-quitar', block: '[data-time-travel]' },
  { scene: 'timeTravelAdd', slug: 'viaje-poner', block: '[data-time-travel]' },
  { scene: 'category', slug: 'conservar-tipos', block: '[data-category-choice]' },
  { scene: 'categoryForAll', slug: 'conservar-por-todos', block: '[data-category-choice]' },
  { scene: 'copyChosen', slug: 'copiar-elegida', block: '[data-copy-chosen]' },
  { scene: 'copyChosenNeighbor', slug: 'copiar-vecino', block: '[data-copy-chosen]' },
  { scene: 'keepPower', slug: 'conservar-fuerza', block: '[data-keep-power]' },
  { scene: 'keepPowerForAll', slug: 'conservar-fuerza-todos', block: '[data-keep-power]' },
  { scene: 'keepExact', slug: 'conservar-exactos', block: '[data-keep-exact]' },
  { scene: 'keepExactVow', slug: 'conservar-exactos-voto', block: '[data-keep-exact]' },
  { scene: 'removeCounters', slug: 'quitar-contadores', block: '[data-remove-counters]' },
  { scene: 'removeCountersCapped', slug: 'quitar-contadores-tope', block: '[data-remove-counters]' },
  { scene: 'copyRetarget', slug: 'objetivos-copia', block: '[data-copy-retarget]' },
  { scene: 'copyAnnounce', slug: 'copia-anuncia', block: '[data-copy-retarget]' },
  { scene: 'vote', slug: 'votacion', block: '[data-vote]' },
  { scene: 'voteObject', slug: 'votacion-objetos', block: '[data-vote]' },
  { scene: 'explore', slug: 'quien-explora', block: '[data-explore]' },
  { scene: 'exploreShared', slug: 'explorar-dos-jugadores', block: '[data-explore]' },
  { scene: 'pilePartition', slug: 'separar-montones', block: '[data-separate-piles]' },
  { scene: 'pileChoice', slug: 'elegir-monton', block: '[data-separate-piles]' },
  { scene: 'miracle', slug: 'milagro', block: '[data-miracle]' },
  { scene: 'castOffer', slug: 'lanzar-milagro', block: '[data-cast-offer]' },
  { scene: 'castOfferCascade', slug: 'lanzar-cascada', block: '[data-cast-offer]' },
  { scene: 'castOfferWindow', slug: 'lanzar-ventana', block: '[data-cast-offer]' },
  { scene: 'meld', slug: 'fusionar', block: '[data-meld]' },
  { scene: 'meldAttack', slug: 'fusion-ataca', block: '[data-meld-attack]' },
  { scene: 'entryAttack', slug: 'entra-atacando', block: '[data-entry-attack]' },
  { scene: 'replacement', slug: 'reemplazos', block: '[data-replacement]' },
  { scene: 'replacementCompose', slug: 'reemplazos-componen', block: '[data-replacement]' },
  { scene: 'replacementOptional', slug: 'reemplazo-opcional', block: '[data-replacement]' },
  { scene: 'copyTarget', slug: 'copia-que-permanente', block: '[data-copy-target]' },
  { scene: 'copyTargetToken', slug: 'copias-de-fichas', block: '[data-copy-target]' },
  { scene: 'resolveAll', slug: 'resolver-todo', block: '[data-resolve-all]' },
  { scene: 'resolveAllStale', slug: 'resolver-todo-sin-respuesta', block: '[data-resolve-all]' },
  { scene: 'untapChoice', slug: 'no-enderezar', block: '[data-untap-choice]' },
  { scene: 'untapSubset', slug: 'tope-enderezar', block: '[data-untap-subset]' },
  { scene: 'untapResume', slug: 'no-enderezar-partida-antigua', block: '[data-untap-choice]' },
  { scene: 'exert', slug: 'exertar-al-atacar', block: '[data-exert]' },
  { scene: 'enlist', slug: 'alistar-al-atacar', block: '[data-enlist]' },
  { scene: 'payCost', slug: 'coste-sacrificar', block: '[data-pay-cost]' },
  { scene: 'payCostHidden', slug: 'coste-sin-candidatos', block: '[data-pay-cost]' },
  { scene: 'payCostAggregate', slug: 'coste-por-fuerza', block: '[data-pay-cost]' },
  { scene: 'phyrexian', slug: 'mana-frigio', block: '[data-phyrexian]' },
  { scene: 'combatTax', slug: 'impuesto-ataque', block: '[data-combat-tax]' },
  { scene: 'combatTaxBlock', slug: 'impuesto-bloqueo', block: '[data-combat-tax]' },
  { scene: 'optionalCost', slug: 'potenciar', block: '[data-optional-cost]' },
  { scene: 'optionalCostMulti', slug: 'multipotenciar', block: '[data-optional-cost]' },
  { scene: 'optionalCostChoice', slug: 'elegir-coste', block: '[data-optional-cost]' },
  { scene: 'optionalCostAlt', slug: 'coste-alternativo', block: '[data-optional-cost]' },
  { scene: 'optionalCostGift', slug: 'regalo', block: '[data-optional-cost]' },
  { scene: 'optionalCostAway', slug: 'coste-ajeno', block: '[data-optional-cost]' },
  { scene: 'defiler', slug: 'defiler', block: '[data-defiler]' },
  { scene: 'defilerAway', slug: 'defiler-ajeno', block: '[data-defiler]' },
  { scene: 'zoneChoice', slug: 'elegir-zona', block: '[data-zone-choice]' },
  { scene: 'zoneChoiceTypes', slug: 'elegir-tipos', block: '[data-zone-choice]' },
  { scene: 'zoneChoiceAway', slug: 'zona-ajena', block: '[data-zone-choice]' },
  { scene: 'modalFace', slug: 'elegir-cara', block: '[data-modal-face]' },
  { scene: 'modalFaceOne', slug: 'una-cara', block: '[data-modal-face]' },
  { scene: 'modalFaceAway', slug: 'cara-ajena', block: '[data-modal-face]' },
  { scene: 'altCast', slug: 'sobrecarga', block: '[data-alt-cast]' },
  { scene: 'altCastEmerge', slug: 'emerger', block: '[data-alt-cast]' },
  { scene: 'altCastOne', slug: 'una-via', block: '[data-alt-cast]' },
  { scene: 'altCastAway', slug: 'coste-alternativo-ajeno', block: '[data-alt-cast]' },
  { scene: 'castVariant', slug: 'variante-lanzamiento', block: '[data-cast-variant]' },
  { scene: 'castVariantAuth', slug: 'permiso-cementerio', block: '[data-cast-variant]' },
  { scene: 'castVariantAway', slug: 'variante-ajena', block: '[data-cast-variant]' },
  { scene: 'typeSlot', slug: 'ranura-tipo', block: '[data-type-slot]' },
  { scene: 'typeSlotLand', slug: 'ranura-tierra', block: '[data-type-slot]' },
  { scene: 'typeSlotAway', slug: 'ranura-ajena', block: '[data-type-slot]' },
  { scene: 'splice', slug: 'empalmar', block: '[data-splice]' },
  { scene: 'spliceHidden', slug: 'empalmar-oculto', block: '[data-splice]' },
  { scene: 'spliceAway', slug: 'empalme-ajeno', block: '[data-splice]' },
  { scene: 'mutate', slug: 'mutar', block: '[data-mutate]' },
  { scene: 'mutateOne', slug: 'un-lado', block: '[data-mutate]' },
  { scene: 'mutateAway', slug: 'mutacion-ajena', block: '[data-mutate]' },
  { scene: 'cipher', slug: 'cifrar', block: '[data-cipher]' },
  { scene: 'cipherHidden', slug: 'cifrar-oculto', block: '[data-cipher]' },
  { scene: 'cipherAway', slug: 'cifrado-ajeno', block: '[data-cipher]' },
  { scene: 'costOrder', slug: 'orden-reduccion', block: '[data-cost-order]' },
  { scene: 'costOrderOne', slug: 'un-total', block: '[data-cost-order]' },
  { scene: 'costOrderAway', slug: 'orden-ajena', block: '[data-cost-order]' },
  { scene: 'resPay', slug: 'pago-opcional', block: '[data-res-pay]' },
  { scene: 'resPayOne', slug: 'un-pago', block: '[data-res-pay]' },
  { scene: 'resPayAway', slug: 'pago-ajeno', block: '[data-res-pay]' },
  { scene: 'gift', slug: 'destinatario', block: '[data-gift-recipient]' },
  { scene: 'giftOne', slug: 'un-destinatario', block: '[data-gift-recipient]' },
  { scene: 'giftCost', slug: 'coste-oponente', block: '[data-gift-recipient]' },
  { scene: 'giftAway', slug: 'regalo-ajeno', block: '[data-gift-recipient]' },
  { scene: 'topBottom', slug: 'arriba-o-abajo', block: '[data-top-bottom]' },
  { scene: 'topBottomNth', slug: 'la-segunda', block: '[data-top-bottom]' },
  { scene: 'topBottomOne', slug: 'solo-arriba', block: '[data-top-bottom]' },
  { scene: 'topBottomAway', slug: 'posicion-ajena', block: '[data-top-bottom]' },
  { scene: 'clash', slug: 'choque', block: '[data-clash]' },
  { scene: 'clashOne', slug: 'un-oponente-choque', block: '[data-clash]' },
  { scene: 'clashAway', slug: 'choque-ajeno', block: '[data-clash]' },
  { scene: 'clashPlace', slug: 'colocar-choque', block: '[data-clash-placement]' },
  { scene: 'clashPlaceHidden', slug: 'colocar-oculta', block: '[data-clash-placement]' },
  { scene: 'clashPlaceAway', slug: 'colocacion-ajena', block: '[data-clash-placement]' },
  { scene: 'sideboard', slug: 'ajustar-mazo', block: '[data-sideboard]' },
  { scene: 'sideboardNoSide', slug: 'sin-banquillo', block: '[data-sideboard]' },
  { scene: 'sideboardAway', slug: 'ajuste-ajeno', block: '[data-sideboard]' },
  { scene: 'playDraw', slug: 'jugar-o-robar', block: '[data-play-draw]' },
  { scene: 'playDrawDraw', slug: 'solo-robar', block: '[data-play-draw]' },
  { scene: 'playDrawAway', slug: 'jugar-robar-ajeno', block: '[data-play-draw]' },
  { scene: 'bottomRipple', slug: 'fondo-estruendo', block: '[data-bottom-order]' },
  { scene: 'bottomReveal', slug: 'fondo-revelado', block: '[data-bottom-order]' },
  { scene: 'bottomDig', slug: 'fondo-mirado', block: '[data-bottom-order]' },
  { scene: 'bottomEmpty', slug: 'fondo-vacio', block: '[data-bottom-order]' },
  { scene: 'bottomAway', slug: 'fondo-ajeno', block: '[data-bottom-order]' },
  { scene: 'ringBearer', slug: 'portador-anillo', block: '[data-exact-candidate]' },
  { scene: 'ringBearerOne', slug: 'un-portador-anillo', block: '[data-exact-candidate]' },
  { scene: 'ringBearerAway', slug: 'portador-ajeno', block: '[data-exact-candidate]' },
  { scene: 'legend', slug: 'regla-leyendas', block: '[data-exact-candidate]' },
  { scene: 'legendAway', slug: 'leyendas-ajenas', block: '[data-exact-candidate]' },
  { scene: 'protoProtector', slug: 'protector-batalla', block: '[data-exact-candidate]' },
  { scene: 'protoOne', slug: 'un-protector-batalla', block: '[data-exact-candidate]' },
  { scene: 'protoAway', slug: 'protector-ajeno', block: '[data-exact-candidate]' },
  { scene: 'dungeon', slug: 'elegir-dungeon', block: '[data-dungeon]' },
  { scene: 'dungeonOne', slug: 'una-dungeon', block: '[data-dungeon]' },
  { scene: 'dungeonAway', slug: 'dungeon-ajena', block: '[data-dungeon]' },
  { scene: 'dungeonRoom', slug: 'habitacion-dungeon', block: '[data-dungeon]' },
  { scene: 'dungeonRoomOne', slug: 'una-habitacion', block: '[data-dungeon]' },
  { scene: 'dungeonRoomAway', slug: 'habitacion-ajena', block: '[data-dungeon]' },
  { scene: 'behold', slug: 'behold', block: '[data-pick-one]' },
  { scene: 'beholdOne', slug: 'un-behold', block: '[data-pick-one]' },
  { scene: 'beholdAway', slug: 'behold-ajeno', block: '[data-pick-one]' },
  { scene: 'populate', slug: 'poblar', block: '[data-pick-one]' },
  { scene: 'populateOne', slug: 'un-poblar', block: '[data-pick-one]' },
  { scene: 'populateAway', slug: 'poblar-ajeno', block: '[data-pick-one]' },
  { scene: 'specialize', slug: 'especializar', block: '[data-specialize]' },
  { scene: 'specializeOne', slug: 'un-color-especializar', block: '[data-specialize]' },
  { scene: 'specializeAway', slug: 'especializar-ajeno', block: '[data-specialize]' },
  { scene: 'roomDoor', slug: 'puerta-room', block: '[data-room-door]' },
  { scene: 'roomDoorOne', slug: 'una-puerta', block: '[data-room-door]' },
  { scene: 'roomDoorAway', slug: 'puerta-ajena', block: '[data-room-door]' },
  { scene: 'blight', slug: 'malea', block: '[data-pick-exactly-one]' },
  { scene: 'blightOne', slug: 'una-criatura-malea', block: '[data-pick-exactly-one]' },
  { scene: 'blightAway', slug: 'malea-ajena', block: '[data-pick-exactly-one]' },
  { scene: 'harmonize', slug: 'armonizar', block: '[data-pick-exactly-one]' },
  { scene: 'harmonizeDecline', slug: 'armonizar-obligado', block: '[data-pick-exactly-one]' },
  { scene: 'harmonizeAway', slug: 'armonizar-ajena', block: '[data-pick-exactly-one]' },
  { scene: 'bounce', slug: 'devolver-a-la-mano', block: '[data-pick-exactly-one]' },
  { scene: 'bounceOne', slug: 'un-permanente-devolver', block: '[data-pick-exactly-one]' },
  { scene: 'bounceAway', slug: 'devolver-ajena', block: '[data-pick-exactly-one]' },
  { scene: 'revealAny', slug: 'revelar-cualquier-numero', block: '[data-reveal-prompt]' },
  { scene: 'unlessRepeat', slug: 'mantenimiento-acumulativo', block: '[data-unless-prompt]' }
] as const;

const THEMES = [
  { theme: 'light', slug: 'claro' },
  { theme: 'dark', slug: 'oscuro' }
] as const;
/** El cromo que resuelve los tokens del tema global. */
const CHROME = { boardStyle: 'classic' };

test.beforeAll(async () => {
  await mkdir(shotsDir, { recursive: true });
});

for (const { theme, slug } of THEMES) {
  test(`las vistas de Phase en tema ${slug}, auditadas`, async ({ page }) => {
    // El ajuste guarda la preferencia; `system` quedaría a merced del anfitrión.
    await page.addInitScript(
      ({ value, boardStyle }) => {
        window.localStorage.setItem('mesa:theme', value);
        window.localStorage.setItem('mesa:boardStyle', boardStyle);
      },
      { value: theme, boardStyle: CHROME.boardStyle }
    );

    for (const { scene, slug: sceneSlug, block } of SCENES) {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`/ux?scene=${scene}`, { waitUntil: 'networkidle' });

      // El tema tiene que estar aplicado de verdad antes de capturar, y el
      // cromo tiene que ser el que lo resuelve: si `data-chrome="arena"`
      // siguiera puesto, las dos capturas saldrían idénticas.
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(page.locator('.app')).toHaveAttribute('data-board-style', CHROME.boardStyle);
      await expect(page.locator('.app')).not.toHaveAttribute('data-chrome', 'arena');
      const prompt = page.locator(block).first();
      await expect(prompt, `la escena ${scene} no muestra su bloque`).toBeVisible();

      const audit = await new AxeBuilder({ page }).analyze();
      const serious = audit.violations.filter((violation) =>
        ['critical', 'serious'].includes(violation.impact ?? '')
      );
      expect(serious, `axe en ${scene} (${slug}): ${serious.map((v) => v.id).join(', ')}`).toEqual([]);

      // La captura tiene que enseñar el bloque: con el cromo clásico el panel
      // cae por debajo del pliegue a 1440×900 y una foto del campo no dice nada
      // del tema aplicado al prompt.
      await prompt.scrollIntoViewIfNeeded();
      await page.waitForTimeout(150);
      await page.screenshot({
        path: `${shotsDir}${sceneSlug}-${slug}.jpg`,
        type: 'jpeg',
        quality: 72,
        fullPage: false
      });
    }
  });
}

test('los dos temas no pintan lo mismo', async ({ page }) => {
  const inkOf = async (value: 'light' | 'dark') => {
    await page.addInitScript((theme) => {
      window.localStorage.setItem('mesa:theme', theme);
      window.localStorage.setItem('mesa:boardStyle', 'classic');
    }, value);
    await page.goto('/ux?scene=unless', { waitUntil: 'networkidle' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', value);
    return page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ink').trim());
  };
  const light = await inkOf('light');
  const dark = await inkOf('dark');
  expect(light).not.toBe('');
  expect(dark).not.toBe('');
  // Si ambos fueran iguales, las capturas estarían duplicando el mismo tema.
  expect(light).not.toBe(dark);
});

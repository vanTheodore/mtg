# Las vistas de Phase en los dos temas

Capturas de `tests/e2e/ux-themes.spec.ts`, que recorre cada escena del
laboratorio (`/ux`) en tema claro y oscuro y audita las dos con axe.

El cromo de la mesa viene de `arena.css`, que **a propósito** no sigue el tema:
va sobre el arte, con su propia paleta, para que el tablero se lea igual con el
sistema en claro o en oscuro. Estas capturas se toman con el cromo clásico
(`mesa:boardStyle = classic`), que es el que resuelve los tokens del tema; el
laboratorio ahora obedece el mismo interruptor que `Board.svelte`.

| Escena | Bloque | Claro | Oscuro |
|---|---|---|---|
| `pay` | `PayAmountChoice` | [claro](cargo-con-importe-claro.jpg) | [oscuro](cargo-con-importe-oscuro.jpg) |
| `opponent` | `OpponentMayChoice` | [claro](puede-un-oponente-claro.jpg) | [oscuro](puede-un-oponente-oscuro.jpg) |
| `reveal` | `RevealChoice` | [claro](ensenar-una-carta-claro.jpg) | [oscuro](ensenar-una-carta-oscuro.jpg) |
| `unless` | `UnlessPayment` | [claro](pagar-o-aceptar-claro.jpg) | [oscuro](pagar-o-aceptar-oscuro.jpg) |
| `pair` | `PairChoice` | [claro](emparejar-claro.jpg) | [oscuro](emparejar-oscuro.jpg) |
| `host` | `ChooseTokenHost` | [claro](destinatario-ficha-claro.jpg) | [oscuro](destinatario-ficha-oscuro.jpg) |
| `branches` | `UnlessPaymentChooseCost` | [claro](pagar-uno-de-dos-claro.jpg) | [oscuro](pagar-uno-de-dos-oscuro.jpg) |
| `tribute` | `TributeChoice` | [claro](tributo-claro.jpg) | [oscuro](tributo-oscuro.jpg) |
| `ward` | `WardSacrificeChoice` | [claro](guardia-claro.jpg) | [oscuro](guardia-oscuro.jpg) |
| `wardPower` | `WardSacrificeChoice` (umbral) | [claro](guardia-poder-claro.jpg) | [oscuro](guardia-poder-oscuro.jpg) |
| `startingPlayer` | `ChooseStartingPlayer` | [claro](quien-empieza-claro.jpg) | [oscuro](quien-empieza-oscuro.jpg) |
| `scry` | `ScryChoice` | [claro](adivinar-claro.jpg) | [oscuro](adivinar-oscuro.jpg) |
| `surveil` | `SurveilChoice` | [claro](vigilar-claro.jpg) | [oscuro](vigilar-oscuro.jpg) |
| `crew` | `CrewVehicle` | [claro](tripular-claro.jpg) | [oscuro](tripular-oscuro.jpg) |
| `saddle` | `SaddleMount` | [claro](montar-claro.jpg) | [oscuro](montar-oscuro.jpg) |
| `equip` | `EquipTarget` | [claro](equipar-claro.jpg) | [oscuro](equipar-oscuro.jpg) |
| `station` | `StationTarget` | [claro](estacion-claro.jpg) | [oscuro](estacion-oscuro.jpg) |
| `multiTarget` | `MultiTargetSelection` (hasta dos) | [claro](objetivos-multiples-claro.jpg) | [oscuro](objetivos-multiples-oscuro.jpg) |
| `multiTargetExact` | `MultiTargetSelection` (cuenta fija) | [claro](objetivos-fijos-claro.jpg) | [oscuro](objetivos-fijos-oscuro.jpg) |
| `distribute` | `DistributeAmong` (CR 608.2d) | [claro](reparto-claro.jpg) | [oscuro](reparto-oscuro.jpg) |
| `distributeAnnounced` | `DistributeAmong` (CR 601.2d) | [claro](reparto-anunciado-claro.jpg) | [oscuro](reparto-anunciado-oscuro.jpg) |
| `moveCounters` | `MoveCountersDistribution` | [claro](mover-contadores-claro.jpg) | [oscuro](mover-contadores-oscuro.jpg) |
| `retarget` | `RetargetChoice` (todos) | [claro](cambiar-objetivos-claro.jpg) | [oscuro](cambiar-objetivos-oscuro.jpg) |
| `retargetSingle` | `RetargetChoice` (uno) | [claro](cambiar-objetivo-claro.jpg) | [oscuro](cambiar-objetivo-oscuro.jpg) |
| `chooseObjects` | `ChooseObjectsSelection` (cualquiera) | [claro](elegir-permanentes-claro.jpg) | [oscuro](elegir-permanentes-oscuro.jpg) |
| `chooseObjectsRecipient` | `ChooseObjectsSelection` (receptor) | [claro](elegir-receptor-claro.jpg) | [oscuro](elegir-receptor-oscuro.jpg) |
| `proliferate` | `ProliferateChoice` | [claro](proliferar-claro.jpg) | [oscuro](proliferar-oscuro.jpg) |
| `timeTravelRemove` | `TimeTravelChoice` (quitar) | [claro](viaje-quitar-claro.jpg) | [oscuro](viaje-quitar-oscuro.jpg) |
| `timeTravelAdd` | `TimeTravelChoice` (poner) | [claro](viaje-poner-claro.jpg) | [oscuro](viaje-poner-oscuro.jpg) |
| `category` | `CategoryChoice` (cada uno) | [claro](conservar-tipos-claro.jpg) | [oscuro](conservar-tipos-oscuro.jpg) |
| `categoryForAll` | `CategoryChoice` (por todos) | [claro](conservar-por-todos-claro.jpg) | [oscuro](conservar-por-todos-oscuro.jpg) |
| `copyChosen` | `EachPlayerCopyChosenSelection` (propio) | [claro](copiar-elegida-claro.jpg) | [oscuro](copiar-elegida-oscuro.jpg) |
| `copyChosenNeighbor` | `EachPlayerCopyChosenSelection` (vecino) | [claro](copiar-vecino-claro.jpg) | [oscuro](copiar-vecino-oscuro.jpg) |
| `keepPower` | `KeepWithinTotalPowerChoice` (propio) | [claro](conservar-fuerza-claro.jpg) | [oscuro](conservar-fuerza-oscuro.jpg) |
| `keepPowerForAll` | `KeepWithinTotalPowerChoice` (todos) | [claro](conservar-fuerza-todos-claro.jpg) | [oscuro](conservar-fuerza-todos-oscuro.jpg) |
| `keepExact` | `KeepExactPermanentsChoice` (propio) | [claro](conservar-exactos-claro.jpg) | [oscuro](conservar-exactos-oscuro.jpg) |
| `keepExactVow` | `KeepExactPermanentsChoice` (con voto) | [claro](conservar-exactos-voto-claro.jpg) | [oscuro](conservar-exactos-voto-oscuro.jpg) |

Para regenerarlas, con un Chromium disponible para Playwright:

```sh
bun x playwright test tests/e2e/ux-themes.spec.ts
```

La prueba falla si un bloque no aparece en su escena, si `data-theme` no cambió
o si axe encuentra algo crítico o serio en cualquiera de los dos temas.

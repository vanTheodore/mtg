# Instalar Mesa en Windows 11 sin compilar Rust

**Bun 1.4.4 + Git + GitHub CLI** bastan para correr Mesa localmente. Si ya tienes Edge, también sirve para los E2E. No hace falta instalar Rust ni construir WASM en un PC de pocos recursos.

## Comandos PowerShell 7

Instala [Bun](https://bun.sh/docs/installation), [Git](https://git-scm.com/download/win) y [GitHub CLI](https://cli.github.com/). Después:

    git clone https://github.com/vanTheodore/mtg.git
    cd mtg
    bun install --frozen-lockfile
    gh auth login
    bun run engine:download
    bun run dev

Visita la dirección que indique Vite (habitualmente http://localhost:5173).

**El motor no está en Git**: el instalador usa GitHub CLI para encontrar el run de **Mesa CI** aprobado que corresponda **exactamente** al commit de tu checkout de main. Solo admite runs de main disparados por push o workflow_dispatch; no confía en un WASM de otra rama o de otra revisión. Descarga el artefacto a una carpeta temporal, comprueba su firma WASM, el SHA-256 del archivo y que el SHA-256 de Cargo.lock coincida antes de copiarlo a static/wasm/.

Si no hay run verde o el artefacto expiró (el workflow retiene los archivos **7 días**), puedes disparar un nuevo build desde GitHub sin compilar nada localmente:

    gh workflow run ci.yml -R vanTheodore/mtg --ref main

Una vez que ese CI termine correctamente, repite bun run engine:download. El script **no** descarga silenciosamente un motor distinto ni usa el artefacto de un PR incompatible. Si quieres una ejecución específica, pasa su identificador:

    bun run engine:download -- --run 123456789

El run seleccionado también debe corresponder al mismo HEAD. Los hashes que publica el CI son útiles para verificar los bytes; no convierten por sí solos un motor de otra revisión en compatible.

## ¿Qué assets vienen incluidos?

| Archivo | Origen | ¿Ya está en el clon? |
| --- | --- | --- |
| Cinco fondos Arena | Phase, bajo static/phase/arenas/ (con SOURCE.md) | Sí |
| Datos de cartas, packs y mazos | static/data/, incluyendo el pack de 10E | Sí |
| Impresiones españolas de 10E | static/data/impressions.es.json y data/mtgjson/10E.es.json | Sí |
| Motor de reglas de Phase | Artefacto binario mtg-engine-wasm en GitHub Actions | No, ejecutar engine:download |
| Ilustraciones de cartas | Scryfall, consultadas bajo demanda | No, requieren conexión |

Abre Ajustes → Idioma de la imagen de la carta → Español (cuando exista impresión). Mesa comprueba que la impresión corresponda a la misma carta; si no hay escaneo español vuelve a la impresión inglesa o a un fallback de texto. La caché actual guarda URLs y resultados, **no** una biblioteca offline de imágenes. No prometemos jugar con ilustraciones sin conexión.

No redistribuyas paquetes masivos de imágenes propiedad de Wizards: los fondos de Phase y los datos canónicos no equivalen a derechos de redistribución de las ilustraciones de Magic.

## Diagnóstico y pruebas

El instalador no exige Edge: Edge solo hace falta para verificar la interfaz por navegador. Si ya lo tienes instalado:

    bun scripts/preflight.ts
    $env:MESA_BROWSER = 'msedge'
    bun run test:e2e

Nota: preflight prueba también el acceso a navegadores/CDN para E2E; el juego solo necesita el motor WASM, el catálogo incluido y los recursos online de imágenes cuando se solicitan.

Más información: docs/BROWSER-RUNBOOK.md y docs/PHASE-UPSTREAM-PIN.json.

#!/usr/bin/env bun
/**
 * A Chromium for Playwright without Playwright's CDN.
 *
 * `bun x playwright install chromium` downloads from cdn.playwright.dev, which
 * is unreachable from some sandboxes (ERR_SOCKET_CLOSED, and no system
 * libraries to run a stock build even if it arrived). This script takes the
 * browser from npm instead, where a plain HTTPS GET works:
 *
 *   @sparticuz/chromium — a Chromium built for serverless Linux, shipped as
 *   brotli blobs (chromium.br, fonts.tar.br, swiftshader.tar.br) plus the
 *   glibc-side libraries Amazon Linux 2023 provides (al2023.tar.br).
 *
 * Nothing is added to package.json: this is a developer tool, and the browser
 * is an artifact of the machine, not of the project. The tarball is fetched
 * from the npm registry at run time, exactly like `playwright install` fetches
 * from its CDN.
 *
 * Usage:
 *   bun scripts/fetch-chromium.ts                    # into ~/.cache/mesa-chromium
 *   bun scripts/fetch-chromium.ts --dir /opt/chromium
 *   bun scripts/fetch-chromium.ts --version 153.0.0
 *
 * It prints the three variables Playwright needs. On Windows/macOS, use the
 * installed Edge instead (`MESA_BROWSER=msedge`) — this path is for Linux.
 */
import { $ } from 'bun';
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

function argOf(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

const destination = resolve(argOf('--dir') ?? join(process.env.XDG_CACHE_HOME ?? join(homedir(), '.cache'), 'mesa-chromium'));
const version = argOf('--version') ?? '153.0.0';
const pkg = '@sparticuz/chromium';

if (process.platform !== 'linux') {
  console.error('Este script es para Linux. En Windows o macOS usa el navegador ya instalado: MESA_BROWSER=msedge o MESA_BROWSER=chrome.');
  process.exit(1);
}

const binary = join(destination, 'chromium');
if (existsSync(binary) && !process.argv.includes('--force')) {
  report();
  process.exit(0);
}

mkdirSync(destination, { recursive: true });
const work = join(destination, '.download');
mkdirSync(work, { recursive: true });
const tarball = join(work, `${pkg.replace('/', '-').replace('@', '')}-${version}.tgz`);

// The registry tarball path is stable: /<pkg>/-/<name>-<version>.tgz
const url = `https://registry.npmjs.org/${pkg}/-/${pkg.split('/')[1]}-${version}.tgz`;
console.log(`Descargando ${pkg}@${version}…`);
const download = await $`curl -sSL --fail --max-time 600 -o ${tarball} ${url}`.quiet().nothrow();
if (download.exitCode !== 0) {
  console.error(`No se pudo descargar ${url}: ${download.stderr.toString().slice(0, 200)}`);
  process.exit(1);
}

const unpacked = join(work, 'package');
rmSync(unpacked, { recursive: true, force: true });
mkdirSync(unpacked, { recursive: true });
await $`tar xzf ${tarball} -C ${work}`.quiet();

/** Brotli-inflates one blob; `tar` blobs are extracted instead. */
async function inflate(name: string, target: string): Promise<void> {
  const source = join(unpacked, 'bin', name);
  if (!existsSync(source)) throw new Error(`falta ${name} en el paquete`);
  if (!name.endsWith('.tar.br')) {
    const raw = join(work, name.replace(/\.br$/, ''));
    const step = await $`bun -e ${`const { createReadStream, createWriteStream } = require('node:fs'); const { createBrotliDecompress } = require('node:zlib'); const { pipeline } = require('node:stream/promises'); await pipeline(createReadStream(${JSON.stringify(source)}), createBrotliDecompress(), createWriteStream(${JSON.stringify(raw)}));`}`.quiet().nothrow();
    if (step.exitCode !== 0) throw new Error(`no se pudo descomprimir ${name}`);
    return;
  }
  const raw = join(work, name.replace(/\.tar\.br$/, '.tar'));
  const step = await $`bun -e ${`const { createReadStream, createWriteStream } = require('node:fs'); const { createBrotliDecompress } = require('node:zlib'); const { pipeline } = require('node:stream/promises'); await pipeline(createReadStream(${JSON.stringify(source)}), createBrotliDecompress(), createWriteStream(${JSON.stringify(raw)}));`}`.quiet().nothrow();
  if (step.exitCode !== 0) throw new Error(`no se pudo descomprimir ${name}`);
  mkdirSync(target, { recursive: true });
  await $`tar xf ${raw} -C ${target}`.quiet();
}

console.log('Descomprimiendo Chromium…');
await inflate('chromium.br', destination);
const chromium = join(work, 'chromium');
if (existsSync(chromium)) {
  rmSync(binary, { force: true });
  await $`cp ${chromium} ${binary}`.quiet();
}
await $`chmod 700 ${binary}`.quiet();

// The swiftshader blobs are loaded from the browser's directory at run time.
await inflate('swiftshader.tar.br', join(destination, 'swiftshader'));
for (const file of readdirSync(join(destination, 'swiftshader'))) {
  await $`cp ${join(destination, 'swiftshader', file)} ${destination}`.quiet();
}

// Libraries for the distro the build targets; on Debian/Ubuntu the system ones
// are used, and this directory only contributes what is missing.
await inflate('al2023.tar.br', join(destination, 'al2023'));
await inflate('fonts.tar.br', join(destination, 'fonts'));

const check = await $`${binary} --version`.env({ ...process.env, LD_LIBRARY_PATH: `${destination}/al2023/lib:${destination}` }).quiet().nothrow();
console.log(`\n${check.stdout.toString().trim() || '(sin versión)'}`);
report();

function report(): void {
  const size = existsSync(binary) ? `${(statSync(binary).size / 1024 / 1024).toFixed(0)} MiB` : 'ausente';
  writeFileSync(join(destination, 'README.txt'), [
    'Chromium para Mesa, tomado de @sparticuz/chromium (npm).',
    `Versión: ${version}`,
    `Binario: ${binary} (${size})`,
    '',
    'export PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=' + binary,
    `export LD_LIBRARY_PATH=${destination}/al2023/lib:${destination}`,
    '',
    'No exportes FONTCONFIG_PATH: el fonts.conf del paquete apunta a /var/task y',
    'deja el navegador sin fuentes (la página se pinta, el texto no).',
    ''
  ].join('\n'));
  console.log([
    `Chromium listo en ${destination} (${size}).`,
    '',
    '  export PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=' + binary,
    `  export LD_LIBRARY_PATH=${destination}/al2023/lib:${destination}`,
    '',
    'Y después: bun x playwright test --reporter=line',
    'No definas FONTCONFIG_PATH: sin las fuentes del sistema no se pinta el texto.'
  ].join('\n'));
}

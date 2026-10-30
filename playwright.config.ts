import { defineConfig, devices } from '@playwright/test';

/**
 * Browser selection without forcing a download.
 *
 * `MESA_BROWSER` picks the engine:
 *   chromium (default) — Playwright's own build, needs `playwright install`
 *   msedge             — Microsoft Edge already installed on the machine
 *   chrome             — Google Chrome already installed
 *
 * On Windows both Edge and Chrome are usually present, so the E2E can run with
 * `MESA_BROWSER=msedge bun run test:e2e` and never touch the Playwright CDN —
 * which is the only option where that CDN is blocked.
 *
 * `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` still wins (custom/stripped builds) and
 * `PLAYWRIGHT_CHROMIUM_LIB_PATH` points at extra shared libraries when the
 * system does not provide them.
 */
const channel = (() => {
  const value = process.env.MESA_BROWSER?.toLowerCase();
  if (value === 'msedge') return 'msedge' as const;
  if (value === 'chrome') return 'chrome' as const;
  return undefined;
})();
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
const libPath = process.env.PLAYWRIGHT_CHROMIUM_LIB_PATH;

const projectName = executablePath ? 'custom' : channel ?? 'chromium';
const use = channels();
function channels() {
  const base = { ...devices['Desktop Chrome'] };
  if (channel) return { ...base, channel };
  return base;
}

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...use,
    launchOptions: {
      ...(executablePath ? { executablePath } : {}),
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--disable-webgl'],
      ...(libPath ? { env: { ...process.env, LD_LIBRARY_PATH: libPath } } : {})
    }
  },
  projects: [{ name: projectName, use }],
  webServer: {
    command: 'bun run dev --port 5173',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: true,
    timeout: 60_000
  }
});

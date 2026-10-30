import { chromium } from '@playwright/test';
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, args: ['--no-sandbox', '--disable-gpu'] });
const page = await browser.newPage({ viewport: { width: 390, height: 200 } });
await page.setContent('<body style="margin:0;font-family:sans-serif;background:#fff"><h1 style="color:#123">Mesa · Chromium</h1><p style="color:#c33">Texto legible a 390px</p><button>Jugar</button></body>');
await page.screenshot({ path: '/home/user/tools/chromium/smoke-sysfont.png' });
console.log('width h1:', await page.evaluate(() => document.querySelector('h1').getBoundingClientRect().width));
await browser.close();

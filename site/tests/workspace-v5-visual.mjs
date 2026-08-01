import { chromium } from 'playwright-core';
import fs from 'node:fs/promises';

const baseUrl = process.env.PROPERTY_CHECK_BASE_URL || 'http://127.0.0.1:8000/';
const outDir = process.env.PROPERTY_CHECK_ARTIFACT_DIR || 'site/tests/artifacts';
await fs.mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome' });

async function openReport(page, query, pattern) {
  await page.goto(`${baseUrl}#/home`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  const input = page.locator('#address-search:visible');
  await input.fill(query);
  const submit = page.locator('[data-search-submit]:visible');
  if (await submit.count()) await submit.click(); else await input.press('Enter');
  const row = page.locator('.search-result-row:visible').filter({ has: page.locator('.result-mode-live') }).filter({ hasText: pattern }).first();
  await row.waitFor({ state: 'visible', timeout: 30000 });
  await row.click();
  await page.waitForFunction(({ source, flags }) => {
    const regex = new RegExp(source, flags);
    return regex.test(document.querySelector('.lcw-property-copy h1')?.textContent || '')
      && document.querySelector('[data-ux-version="LC-UX-v0.5.0"]')
      && document.querySelector('[data-lcw-panel="summary"].is-active #context-property-map .context-map-overlay path');
  }, { source: pattern.source, flags: pattern.flags }, { timeout: 75000 });
  await page.waitForTimeout(700);
}

try {
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await openReport(desktop, '28 Annie Street Hamilton QLD 4007', /28\s+Annie\s+Street/i);
  await desktop.screenshot({ path: `${outDir}/workspace-v5-annie-summary-desktop.png`, fullPage: true });
  await openReport(desktop, '1 William Street Brisbane City QLD 4000', /\b1\s+William\s+Street/i);
  await desktop.screenshot({ path: `${outDir}/workspace-v5-william-summary-desktop.png`, fullPage: true });
  await desktop.close();

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  await openReport(mobile, '28 Annie Street Hamilton QLD 4007', /28\s+Annie\s+Street/i);
  await mobile.screenshot({ path: `${outDir}/workspace-v5-annie-summary-mobile.png`, fullPage: true });
  await mobile.close();
  console.log(JSON.stringify({ ok: true, screenshots: 3 }));
} finally {
  await browser.close();
}

import { chromium } from 'playwright-core';

const baseUrl = process.env.PROPERTY_CHECK_BASE_URL || 'http://127.0.0.1:8000/';
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome' });

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(`${baseUrl}#/home`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  const input = page.locator('#address-search:visible');
  await input.fill('28 Annie Street Hamilton QLD 4007');
  const submit = page.locator('[data-search-submit]:visible');
  if (await submit.count()) await submit.click(); else await input.press('Enter');
  const row = page.locator('.search-result-row:visible').filter({ has: page.locator('.result-mode-live') }).filter({ hasText: /28\s+Annie\s+Street/i }).first();
  await row.waitFor({ state: 'visible', timeout: 30000 });
  await row.click();

  await page.waitForFunction(() => {
    const rendered = document.querySelector('.lc-v2-property-title h1')?.textContent || '';
    return /28\s+Annie\s+Street/i.test(rendered)
      && document.querySelector('[data-ux-version="LC-UX-v0.2.0"]')
      && document.documentElement.classList.contains('lc-v2-reading-order-ready');
  }, null, { timeout: 75000 });

  await page.waitForTimeout(500);
  const state = await page.evaluate(() => {
    const summary = document.querySelector('.lc-v2-summary');
    const map = document.querySelector('.report-overview-section');
    const developmentValue = window.LEMONCHECK_ASSESSMENT?.development?.score;
    const developmentText = document.querySelector('[data-v2-lens="development"] strong')?.textContent?.trim() || '';
    return {
      summaryTop: summary?.getBoundingClientRect().top + window.scrollY,
      mapTop: map?.getBoundingClientRect().top + window.scrollY,
      adjacent: summary?.nextElementSibling === map,
      price: document.querySelector('[data-v2-lens="price"] strong')?.textContent?.trim() || '',
      developmentValue,
      developmentText,
    };
  });

  if (!(state.summaryTop < state.mapTop) || !state.adjacent) throw new Error(`Answer must appear immediately before map: ${JSON.stringify(state)}`);
  if (state.price !== '$–') throw new Error(`Unavailable price must be $–: ${state.price}`);
  if (Number.isFinite(state.developmentValue) && !state.developmentText.startsWith(String(state.developmentValue))) {
    throw new Error(`Development lens is stale: ${JSON.stringify(state)}`);
  }
  console.log(JSON.stringify({ ok: true, baseUrl, state }, null, 2));
} catch (error) {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
} finally {
  await browser.close();
}

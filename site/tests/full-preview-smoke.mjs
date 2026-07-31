import { chromium } from 'playwright-core';
import fs from 'node:fs/promises';

const baseUrl = process.env.PROPERTY_CHECK_BASE_URL || 'http://127.0.0.1:8000/';
const outDir = process.env.PROPERTY_CHECK_ARTIFACT_DIR || 'site/tests/full-preview-artifacts';
await fs.mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome' });
const failures = [];

async function validate(viewport, name) {
  const page = await browser.newPage({ viewport, isMobile: viewport.width < 600 });
  page.on('pageerror', error => failures.push(`${name} pageerror: ${error.message}`));
  page.on('console', message => { if (message.type() === 'error') failures.push(`${name} console: ${message.text()}`); });
  await page.goto(`${baseUrl}#/preview/full-report`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.locator('.full-preview-body').waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('.fp-hero').waitFor({ state: 'visible', timeout: 10000 });

  const state = await page.evaluate(() => ({
    title: document.title,
    version: document.body.textContent.includes('LC-FULL-PREVIEW-v0.1.0'),
    simulated: document.body.textContent.includes('Illustrative data'),
    scores: document.querySelectorAll('.fp-score').length,
    priorities: document.querySelectorAll('.fp-priority-item').length,
    actions: document.querySelectorAll('.fp-next-three li').length,
    sections: document.querySelectorAll('.fp-section').length,
    evidenceModules: document.querySelectorAll('.fp-evidence-modules article').length,
    offer: document.querySelector('#fp-offer')?.value,
    deal: document.querySelector('[data-deal-score]')?.textContent?.trim(),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  if (!state.version || !state.simulated) throw new Error(`Preview labelling missing: ${JSON.stringify(state)}`);
  if (state.scores !== 5) throw new Error(`Five score lenses missing: ${state.scores}`);
  if (state.priorities !== 3 || state.actions !== 3) throw new Error(`Priority hierarchy incorrect: ${JSON.stringify(state)}`);
  if (state.sections < 7 || state.evidenceModules !== 8) throw new Error(`Full report modules missing: ${JSON.stringify(state)}`);
  if (state.overflow > 2) throw new Error(`${name} horizontal overflow ${state.overflow}px`);

  const input = page.locator('#fp-offer');
  const initialDeal = Number(state.deal);
  await input.fill('1520000');
  await page.waitForFunction((before) => Number(document.querySelector('[data-deal-score]')?.textContent) < before, initialDeal, { timeout: 5000 });
  const changed = await page.evaluate(() => ({
    deal: Number(document.querySelector('[data-deal-score]')?.textContent),
    display: document.querySelector('[data-offer-display]')?.textContent,
    verdict: document.querySelector('[data-offer-verdict]')?.textContent,
  }));
  if (!(changed.deal < initialDeal) || !/1,520,000/.test(changed.display || '') || !/above/.test(changed.verdict || '')) throw new Error(`Offer interaction failed: ${JSON.stringify(changed)}`);

  await page.screenshot({ path: `${outDir}/${name}.png`, fullPage: true });
  await page.close();
  return { ...state, changedDeal: changed.deal };
}

try {
  const desktop = await validate({ width: 1440, height: 1000 }, 'full-preview-desktop');
  const mobile = await validate({ width: 390, height: 844 }, 'full-preview-mobile');
  if (failures.length) throw new Error(failures.join('\n'));
  console.log(JSON.stringify({ ok: true, baseUrl, desktop, mobile }, null, 2));
} catch (error) {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
} finally {
  await browser.close();
}

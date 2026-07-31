import { chromium } from 'playwright-core';
import fs from 'node:fs/promises';

const baseUrl = process.env.PROPERTY_CHECK_BASE_URL || 'http://127.0.0.1:8000/';
const outDir = process.env.PROPERTY_CHECK_ARTIFACT_DIR || 'site/tests/artifacts';
await fs.mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const failures = [];
page.on('pageerror', error => failures.push(`pageerror: ${error.message}`));
page.on('console', message => { if (message.type() === 'error') failures.push(`console: ${message.text()}`); });

async function openProperty(query, pattern) {
  await page.goto(`${baseUrl}#/home`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  const input = page.locator('#address-search:visible');
  await input.fill(query);
  const submit = page.locator('[data-search-submit]:visible');
  if (await submit.count()) await submit.click(); else await input.press('Enter');
  const result = page.locator('.search-result-row:visible').filter({ has: page.locator('.result-mode-live') }).filter({ hasText: pattern }).first();
  await result.waitFor({ state: 'visible', timeout: 30000 });
  await result.click();
  await page.waitForFunction(({ source, flags }) => {
    const regex = new RegExp(source, flags);
    return regex.test(window.PROPERTY_DATA?.canonical_address || '')
      && window.LEMONCHECK_ASSESSMENT?.governanceVersion === 'LC-BNE-5L-v0.2.1'
      && document.querySelector('.lc-simple-summary')?.dataset.uxVersion === 'LC-UX-v0.1.0';
  }, { source: pattern.source, flags: pattern.flags }, { timeout: 75000 });

  await page.locator('.lc-simple-details > summary').click();
  const form = page.locator('.lc-profile-form');
  await form.locator('[name="goal"]').selectOption('live_in');
  await form.locator('[name="riskTolerance"]').selectOption('balanced');
  await form.locator('[name="price"]').fill('900000');
  await form.locator('[name="costs"]').fill('25000');
  await form.locator('button[type="submit"]').click();
  await page.waitForFunction(() => Number.isFinite(window.LEMONCHECK_ASSESSMENT?.fit?.score)
    && window.LEMONCHECK_ASSESSMENT?.deal?.score === null
    && document.querySelector('.lc-simple-summary')?.dataset.uxVersion === 'LC-UX-v0.1.0', null, { timeout: 15000 });

  const save = page.locator('[data-save-property]:visible');
  await save.waitFor({ state: 'visible', timeout: 10000 });
  await save.click();
  await page.waitForFunction(() => {
    const items = JSON.parse(localStorage.getItem('lemoncheck-shortlist-v1') || '[]');
    return items.some(item => String(item.propertyId) === String(window.PROPERTY_DATA?.property_id));
  }, null, { timeout: 10000 });

  return page.evaluate(() => ({
    propertyId: String(window.PROPERTY_DATA.property_id),
    address: window.PROPERTY_DATA.canonical_address,
    lemon: window.LEMONCHECK_ASSESSMENT.objective.lemonScore,
    deal: window.LEMONCHECK_ASSESSMENT.deal.score,
    fit: window.LEMONCHECK_ASSESSMENT.fit.score,
  }));
}

try {
  await page.goto(`${baseUrl}#/home`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.evaluate(() => localStorage.clear());
  const annie = await openProperty('28 Annie Street Hamilton QLD 4007', /28\s+Annie\s+Street/i);
  const william = await openProperty('1 William Street Brisbane City QLD 4000', /\b1\s+William\s+Street/i);
  if (annie.propertyId === william.propertyId) throw new Error('Second saved property reused first property ID');
  if (annie.deal !== null || william.deal !== null) throw new Error('Comparison should preserve pending Deal Scores without automated pricing');

  const compare = page.locator('[data-open-comparison]:visible');
  await compare.click();
  const dialog = page.locator('#lemoncheck-compare-dialog[open]');
  await dialog.waitFor({ state: 'visible', timeout: 10000 });
  const state = await page.evaluate(() => {
    const items = JSON.parse(localStorage.getItem('lemoncheck-shortlist-v1') || '[]');
    return {
      count: items.length,
      ids: items.map(item => String(item.propertyId)),
      versions: [...new Set(items.map(item => item.modelVersion))],
      cards: document.querySelectorAll('#lemoncheck-compare-dialog .lc-compare-card').length,
      text: document.querySelector('#lemoncheck-compare-dialog')?.textContent || '',
      missingDeals: [...document.querySelectorAll('#lemoncheck-compare-dialog .lc-compare-card')].filter(card => {
        const score = [...card.querySelectorAll('.lc-compare-score')].find(node => node.querySelector('span')?.textContent === 'Deal');
        return score?.textContent?.includes('—');
      }).length,
    };
  });
  if (state.count !== 2 || state.cards !== 2) throw new Error(`Comparison should contain two properties: ${JSON.stringify(state)}`);
  if (state.versions.length !== 1 || state.versions[0] !== 'LC-BNE-5L-v0.2.1') throw new Error(`Model versions differ: ${JSON.stringify(state.versions)}`);
  if (!/28\s+Annie\s+Street/i.test(state.text) || !/1\s+William\s+Street/i.test(state.text)) throw new Error('Saved addresses missing');
  if (state.missingDeals !== 2) throw new Error('Pending Deal Scores were not preserved as missing');
  for (const label of ['Lemon', 'Deal', 'Fit', 'Development', 'Confidence']) if (!state.text.includes(label)) throw new Error(`Comparison lens missing: ${label}`);
  const overflow = await dialog.evaluate(element => element.scrollWidth - element.clientWidth);
  if (overflow > 2) throw new Error(`Comparison dialog overflow: ${overflow}px`);
  if (failures.length) throw new Error(failures.join('\n'));
  await page.screenshot({ path: `${outDir}/saved-comparison-desktop.png`, fullPage: true });
  console.log(JSON.stringify({ ok: true, baseUrl, annie, william, comparison: state }, null, 2));
} catch (error) {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
} finally {
  await browser.close();
}

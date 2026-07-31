import { chromium } from 'playwright-core';
import fs from 'node:fs/promises';

const baseUrl = process.env.PROPERTY_CHECK_BASE_URL || 'http://127.0.0.1:8000/';
const outDir = process.env.PROPERTY_CHECK_ARTIFACT_DIR || 'site/tests/artifacts';
await fs.mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome' });
const failures = [];

async function openAddress(page, query, pattern) {
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
    return window.PROPERTY_DATA?.mode === 'live'
      && regex.test(window.PROPERTY_DATA?.canonical_address || '')
      && window.LEMONCHECK_ASSESSMENT?.governanceVersion === 'LC-BNE-5L-v0.2.1'
      && document.querySelector('.lc-simple-summary')?.dataset.uxVersion === 'LC-UX-v0.1.0';
  }, { source: pattern.source, flags: pattern.flags }, { timeout: 75000 });
}

async function validateReport(page, query, pattern, screenshotName) {
  await openAddress(page, query, pattern);
  const state = await page.evaluate(() => {
    const data = window.PROPERTY_DATA;
    const assessment = window.LEMONCHECK_ASSESSMENT;
    return {
      data,
      assessment,
      title: document.querySelector('.report-title-block h1')?.textContent?.trim() || '',
      summaryVersion: document.querySelector('.lc-simple-summary')?.dataset.uxVersion || '',
      simpleScores: [...document.querySelectorAll('[data-simple-score]')].map((node) => node.dataset.simpleScore),
      matters: document.querySelectorAll('.lc-simple-matter').length,
      actions: document.querySelectorAll('.lc-simple-actions li').length,
      advancedOpen: document.querySelector('.lc-simple-details')?.open,
      evidenceOpen: document.querySelector('.report-facts-section .lc-report-detail')?.open,
      sourcesOpen: document.querySelector('.report-sources-section .lc-report-detail')?.open,
      fairValueHidden: document.querySelector('[name="fairValue"]')?.closest('label')?.hidden,
      fairValueDisabled: document.querySelector('[name="fairValue"]')?.disabled,
      mapImmediatelyAfter: document.querySelector('.lemoncheck-decision-section')?.nextElementSibling?.id === 'lc-map',
      tileCount: document.querySelectorAll('#context-property-map .context-tile').length,
      mapPaths: document.querySelectorAll('#context-property-map .context-map-overlay path').length,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });

  if (!pattern.test(state.title)) throw new Error(`Wrong report title: ${state.title}`);
  if (!state.data || state.data.mode !== 'live' || !Array.isArray(state.data.metrics) || state.data.metrics.length < 12) throw new Error('Live metric payload missing');
  if (!Array.isArray(state.data.parcels) || state.data.parcels.length < 1) throw new Error('Parcel resolution missing');
  if (state.data.metrics.find(item => item.metric_id === 'property.address')?.source?.mode !== 'live') throw new Error('Address source not live');
  if (!state.data.metrics.some(item => item.category === 'Flood' && item.source?.mode !== 'unavailable')) throw new Error('Flood source missing');
  if (state.summaryVersion !== 'LC-UX-v0.1.0') throw new Error('Simplified UX missing');
  for (const key of ['lemon', 'confidence', 'deal', 'fit', 'development']) if (!state.simpleScores.includes(key)) throw new Error(`Simple score ${key} missing`);
  if (state.matters !== 3 || state.actions !== 3) throw new Error(`Summary should show three matters and actions: ${JSON.stringify({ matters: state.matters, actions: state.actions })}`);
  if (state.advancedOpen || state.evidenceOpen || state.sourcesOpen) throw new Error('Detailed sections should be collapsed initially');
  if (!state.fairValueHidden || !state.fairValueDisabled) throw new Error('Manual fair-value input remains available');
  if (!state.mapImmediatelyAfter || state.tileCount < 4 || state.mapPaths < 1) throw new Error('Map was not promoted directly below the summary');
  if (state.overflow > 2) throw new Error(`Horizontal overflow: ${state.overflow}px`);

  const assessment = state.assessment;
  if (!Number.isFinite(assessment?.objective?.lemonScore) || assessment.objective.lemonScore < 0 || assessment.objective.lemonScore > 100) throw new Error('Invalid Lemon Score');
  if (!Number.isFinite(assessment?.confidence?.score) || assessment.confidence.score > 55) throw new Error('Invalid completeness score');
  if (assessment.deal?.score !== null) throw new Error('Deal Score must remain pending without automated pricing');
  if (!assessment.confidence?.gaps?.includes('Building and pest evidence')) throw new Error('Assessment gaps missing');

  const detail = page.locator('.lc-simple-details');
  await detail.locator('summary').click();
  const form = page.locator('.lc-profile-form');
  await form.locator('[name="goal"]').selectOption('live_in');
  await form.locator('[name="riskTolerance"]').selectOption('balanced');
  await form.locator('[name="price"]').fill('900000');
  await form.locator('[name="costs"]').fill('25000');
  await form.locator('[name="simpleTitle"]').check();
  await form.locator('button[type="submit"]').click();
  await page.waitForFunction(() => Number.isFinite(window.LEMONCHECK_ASSESSMENT?.fit?.score)
    && window.LEMONCHECK_ASSESSMENT?.deal?.score === null
    && document.querySelector('.lc-simple-summary')?.dataset.uxVersion === 'LC-UX-v0.1.0', null, { timeout: 15000 });

  const final = await page.evaluate(() => ({
    propertyId: String(window.PROPERTY_DATA.property_id),
    address: window.PROPERTY_DATA.canonical_address,
    decision: window.LEMONCHECK_ASSESSMENT.decision.title,
    lemon: window.LEMONCHECK_ASSESSMENT.objective.lemonScore,
    deal: window.LEMONCHECK_ASSESSMENT.deal.score,
    fit: window.LEMONCHECK_ASSESSMENT.fit.score,
    development: window.LEMONCHECK_ASSESSMENT.development.score,
    completeness: window.LEMONCHECK_ASSESSMENT.confidence.score,
    hardFlags: window.LEMONCHECK_ASSESSMENT.flags.length,
    advisories: window.LEMONCHECK_ASSESSMENT.advisories.length,
  }));
  if (final.deal !== null || !Number.isFinite(final.fit)) throw new Error(`Personalisation result invalid: ${JSON.stringify(final)}`);
  await page.screenshot({ path: `${outDir}/${screenshotName}`, fullPage: true });
  return final;
}

try {
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  desktop.on('pageerror', error => failures.push(`desktop pageerror: ${error.message}`));
  desktop.on('console', message => { if (message.type() === 'error') failures.push(`desktop console: ${message.text()}`); });
  const annie = await validateReport(desktop, '28 Annie Street Hamilton QLD 4007', /28\s+Annie\s+Street/i, 'live-annie-desktop.png');
  const william = await validateReport(desktop, '1 William Street Brisbane City QLD 4000', /\b1\s+William\s+Street/i, 'live-william-desktop.png');
  if (annie.propertyId === william.propertyId) throw new Error('Second address reused first property');
  await desktop.close();

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  mobile.on('pageerror', error => failures.push(`mobile pageerror: ${error.message}`));
  mobile.on('console', message => { if (message.type() === 'error') failures.push(`mobile console: ${message.text()}`); });
  const mobileResult = await validateReport(mobile, '28 Annie Street Hamilton QLD 4007', /28\s+Annie\s+Street/i, 'live-annie-mobile.png');
  const mobileNav = await mobile.locator('.lc-simple-jump-nav').isVisible();
  if (!mobileNav) throw new Error('Mobile report navigation missing');
  await mobile.close();

  if (failures.length) throw new Error(failures.join('\n'));
  console.log(JSON.stringify({ ok: true, baseUrl, desktop: { annie, william }, mobile: mobileResult }, null, 2));
} catch (error) {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
} finally {
  await browser.close();
}

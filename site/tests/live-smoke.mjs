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
      && document.querySelector('[data-ux-version="LC-UX-v0.2.0"]');
  }, { source: pattern.source, flags: pattern.flags }, { timeout: 75000 });
}

async function validateReport(page, query, pattern, screenshotName) {
  await openAddress(page, query, pattern);
  const state = await page.evaluate(() => {
    const data = window.PROPERTY_DATA;
    const assessment = window.LEMONCHECK_ASSESSMENT;
    const summary = document.querySelector('[data-ux-version="LC-UX-v0.2.0"]');
    const summaryRect = summary?.getBoundingClientRect();
    return {
      data,
      assessment,
      address: document.querySelector('.lc-v2-property-title h1')?.textContent?.trim() || '',
      reportHeroHidden: getComputedStyle(document.querySelector('.report-hero')).display === 'none',
      originalHidden: document.querySelector('.lemoncheck-decision-section')?.hidden === true,
      version: summary?.dataset.uxVersion || '',
      summaryHeight: summaryRect?.height || 0,
      price: document.querySelector('[data-v2-lens="price"] strong')?.textContent?.trim() || '',
      deal: document.querySelector('[data-v2-lens="deal"] strong')?.textContent?.trim() || '',
      lenses: document.querySelectorAll('.lc-v2-lens').length,
      matters: document.querySelectorAll('.lc-v2-matter').length,
      actions: document.querySelectorAll('.lc-v2-next li').length,
      visibleH1: [...document.querySelectorAll('h1')].filter((node) => getComputedStyle(node).display !== 'none' && node.getBoundingClientRect().height > 0).map((node) => node.textContent.trim()),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });

  if (!pattern.test(state.address)) throw new Error(`Wrong compact address: ${state.address}`);
  if (!state.data || state.data.mode !== 'live' || !Array.isArray(state.data.metrics) || state.data.metrics.length < 12) throw new Error('Live metric payload missing');
  if (!Array.isArray(state.data.parcels) || state.data.parcels.length < 1) throw new Error('Parcel resolution missing');
  if (state.version !== 'LC-UX-v0.2.0') throw new Error('UX overhaul missing');
  if (!state.reportHeroHidden || !state.originalHidden) throw new Error('Legacy hero or legacy dashboard remains visible');
  if (state.price !== '$–') throw new Error(`Unavailable price should display $–, received ${state.price}`);
  if (state.deal !== '—') throw new Error(`Pending Deal Score should display —, received ${state.deal}`);
  if (state.lenses !== 5 || state.matters !== 3 || state.actions !== 3) throw new Error(`Compact dashboard structure invalid: ${JSON.stringify(state)}`);
  if (state.summaryHeight > 850) throw new Error(`Compact summary is too tall: ${state.summaryHeight}px`);
  if (state.visibleH1.length !== 1) throw new Error(`Expected one visible H1, found ${JSON.stringify(state.visibleH1)}`);
  if (state.overflow > 2) throw new Error(`Horizontal overflow: ${state.overflow}px`);

  const assessment = state.assessment;
  if (!Number.isFinite(assessment?.objective?.lemonScore) || assessment.objective.lemonScore < 0 || assessment.objective.lemonScore > 100) throw new Error('Invalid Lemon Score');
  if (!Number.isFinite(assessment?.confidence?.score) || assessment.confidence.score > 55) throw new Error('Invalid completeness score');
  if (assessment.deal?.score !== null) throw new Error('Deal Score must remain pending without automated pricing');

  await page.locator('[data-v2-open-details]').click();
  await page.locator('.lemoncheck-decision-section').waitFor({ state: 'visible', timeout: 10000 });
  const detail = page.locator('.lc-simple-details');
  if (!(await detail.getAttribute('open'))) await detail.locator(':scope > summary').click();
  const form = page.locator('.lc-profile-form');
  await form.locator('[name="goal"]').selectOption('live_in');
  await form.locator('[name="riskTolerance"]').selectOption('balanced');
  await form.locator('[name="price"]').fill('900000');
  await form.locator('[name="costs"]').fill('25000');
  await form.locator('button[type="submit"]').click();
  await page.waitForFunction(() => Number.isFinite(window.LEMONCHECK_ASSESSMENT?.fit?.score) && window.LEMONCHECK_ASSESSMENT?.deal?.score === null, null, { timeout: 15000 });

  await page.screenshot({ path: `${outDir}/${screenshotName}`, fullPage: true });
  return page.evaluate(() => ({
    propertyId: String(window.PROPERTY_DATA.property_id),
    address: window.PROPERTY_DATA.canonical_address,
    lemon: window.LEMONCHECK_ASSESSMENT.objective.lemonScore,
    deal: window.LEMONCHECK_ASSESSMENT.deal.score,
    fit: window.LEMONCHECK_ASSESSMENT.fit.score,
    development: window.LEMONCHECK_ASSESSMENT.development.score,
    completeness: window.LEMONCHECK_ASSESSMENT.confidence.score,
  }));
}

try {
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  desktop.on('pageerror', error => failures.push(`desktop pageerror: ${error.message}`));
  desktop.on('console', message => { if (message.type() === 'error') failures.push(`desktop console: ${message.text()}`); });
  const fryar = await validateReport(desktop, '4 Fryar Court Keperra', /4\s+Fryar\s+Court/i, 'live-fryar-desktop.png');
  const annie = await validateReport(desktop, '28 Annie Street Hamilton QLD 4007', /28\s+Annie\s+Street/i, 'live-annie-desktop.png');
  if (fryar.propertyId === annie.propertyId) throw new Error('Second address reused first property');
  await desktop.close();

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  mobile.on('pageerror', error => failures.push(`mobile pageerror: ${error.message}`));
  mobile.on('console', message => { if (message.type() === 'error') failures.push(`mobile console: ${message.text()}`); });
  const mobileResult = await validateReport(mobile, '4 Fryar Court Keperra', /4\s+Fryar\s+Court/i, 'live-fryar-mobile.png');
  await mobile.close();

  if (failures.length) throw new Error(failures.join('\n'));
  console.log(JSON.stringify({ ok: true, baseUrl, desktop: { fryar, annie }, mobile: mobileResult }, null, 2));
} catch (error) {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
} finally {
  await browser.close();
}

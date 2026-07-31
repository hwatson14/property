import { chromium } from 'playwright-core';
import fs from 'node:fs/promises';

const baseUrl = process.env.PROPERTY_CHECK_BASE_URL || 'http://127.0.0.1:8000/';
const outDir = process.env.PROPERTY_CHECK_ARTIFACT_DIR || 'site/tests/artifacts';
await fs.mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome' });
const errors = [];

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
    return regex.test(window.PROPERTY_DATA?.canonical_address || '')
      && document.querySelector('[data-ux-version="LC-UX-v0.4.0"]')
      && Number.isFinite(window.LEMONCHECK_ASSESSMENT?.development?.score);
  }, { source: pattern.source, flags: pattern.flags }, { timeout: 75000 });
  await page.waitForTimeout(500);
}

async function validate(page, pattern, screenshotName, mobile = false) {
  const state = await page.evaluate(() => {
    const shell = document.querySelector('.lc-v4-shell');
    const report = document.querySelector('.lc-v4-report-card');
    const findings = document.querySelector('.lc-v4-findings-card');
    const lenses = document.querySelector('.lc-v4-lenses');
    const secondary = document.querySelector('.lc-v4-secondary-grid');
    const map = document.querySelector('.report-overview-section');
    const visibleH1 = [...document.querySelectorAll('h1')].filter((node) => getComputedStyle(node).display !== 'none' && node.getBoundingClientRect().height > 0);
    return {
      address: document.querySelector('.lc-v4-property-header h1')?.textContent?.trim() || '',
      version: document.querySelector('[data-ux-version="LC-UX-v0.4.0"]')?.dataset.uxVersion || '',
      verdict: document.querySelector('.lc-v4-verdict h2')?.textContent?.trim() || '',
      boundary: document.querySelector('.lc-v4-verdict small')?.textContent || '',
      mapped: document.querySelector('[data-v4-score="lemon"] strong')?.textContent?.trim() || '',
      evidence: document.querySelector('[data-v4-score="confidence"] strong')?.textContent?.trim() || '',
      price: document.querySelector('.lc-v4-price strong')?.textContent?.trim() || '',
      findings: document.querySelectorAll('.lc-v4-finding').length,
      unknownFindings: document.querySelectorAll('.lc-v4-finding-unknown').length,
      findingActions: [...document.querySelectorAll('.lc-v4-finding>small')].map((node) => node.textContent.trim()),
      lenses: document.querySelectorAll('.lc-v4-lenses>article').length,
      secondaryCards: document.querySelectorAll('.lc-v4-secondary-grid>article').length,
      parcelSvg: document.querySelectorAll('.lc-v4-parcel-svg .lc-v4-parcel').length,
      primaryCta: document.querySelector('[data-v4-personalise]')?.textContent?.trim() || '',
      primaryCtaHeight: document.querySelector('[data-v4-personalise]')?.getBoundingClientRect().height || 0,
      v3Hidden: document.querySelector('.lc-v3-shell') ? getComputedStyle(document.querySelector('.lc-v3-shell')).display === 'none' : true,
      v2Hidden: document.querySelector('.lc-v2-summary') ? getComputedStyle(document.querySelector('.lc-v2-summary')).display === 'none' : true,
      mapHidden: map ? getComputedStyle(map).display === 'none' : false,
      reportTop: report?.getBoundingClientRect().top || 0,
      lensesBottom: lenses?.getBoundingClientRect().bottom || 0,
      secondaryTop: secondary?.getBoundingClientRect().top || 0,
      viewportHeight: innerHeight,
      visibleH1: visibleH1.length,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      lemon: window.LEMONCHECK_ASSESSMENT?.objective?.lemonScore,
      development: window.LEMONCHECK_ASSESSMENT?.development?.score,
    };
  });

  if (!pattern.test(state.address)) throw new Error(`Wrong v4 address: ${state.address}`);
  if (state.version !== 'LC-UX-v0.4.0') throw new Error(`Wrong UI version: ${state.version}`);
  if (!state.verdict || state.verdict.length > 90) throw new Error(`Verdict hierarchy failed: ${state.verdict}`);
  if (!/mapped public data/i.test(state.boundary)) throw new Error('Evidence boundary is missing');
  if (!/^\d+\/100$/.test(state.mapped) || !/^\d+\/100$/.test(state.evidence)) throw new Error(`Paired scores invalid: ${state.mapped}, ${state.evidence}`);
  if (state.price !== '$–') throw new Error(`Unavailable price should be $–, got ${state.price}`);
  if (state.findings !== 3 || state.unknownFindings < 1) throw new Error(`Top findings are not balanced: ${JSON.stringify(state)}`);
  if (state.findingActions.some((text) => !/^Next:/i.test(text))) throw new Error('A finding is missing its direct next action');
  if (state.lenses !== 3 || state.secondaryCards !== 2 || state.parcelSvg < 1) throw new Error('Supporting hierarchy is incomplete');
  if (!/Personalise this check/i.test(state.primaryCta) || state.primaryCtaHeight < 44) throw new Error('Primary CTA failed');
  if (!state.v3Hidden || !state.v2Hidden || !state.mapHidden) throw new Error('Legacy UI or full map is visible initially');
  if (!mobile && (state.lensesBottom > state.viewportHeight + 8 || state.secondaryTop > state.viewportHeight + 80)) throw new Error(`First viewport is too tall: ${JSON.stringify(state)}`);
  if (state.visibleH1 !== 1 || state.overflow > 2 || !Number.isFinite(state.development)) throw new Error('Accessibility, overflow or score state failed');

  await page.screenshot({ path: `${outDir}/${screenshotName}`, fullPage: true });

  await page.locator('[data-v4-map]').click();
  await page.locator('.report-overview-section').waitFor({ state: 'visible', timeout: 10000 });
  await page.locator('[data-v4-personalise]').first().click();
  await page.locator('.lemoncheck-decision-section').waitFor({ state: 'visible', timeout: 10000 });

  return state;
}

try {
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  desktop.on('pageerror', (error) => errors.push(`desktop pageerror: ${error.message}`));
  desktop.on('console', (message) => { if (message.type() === 'error') errors.push(`desktop console: ${message.text()}`); });
  await openReport(desktop, '28 Annie Street Hamilton QLD 4007', /28\s+Annie\s+Street/i);
  const annie = await validate(desktop, /28\s+Annie\s+Street/i, 'ux-v4-annie-desktop.png');
  await openReport(desktop, '1 William Street Brisbane City QLD 4000', /\b1\s+William\s+Street/i);
  const william = await validate(desktop, /\b1\s+William\s+Street/i, 'ux-v4-william-desktop.png');
  if (annie.lemon === william.lemon) throw new Error('Contrasting properties returned the same Lemon Score');
  await desktop.close();

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  mobile.on('pageerror', (error) => errors.push(`mobile pageerror: ${error.message}`));
  mobile.on('console', (message) => { if (message.type() === 'error') errors.push(`mobile console: ${message.text()}`); });
  await openReport(mobile, '28 Annie Street Hamilton QLD 4007', /28\s+Annie\s+Street/i);
  const mobileState = await validate(mobile, /28\s+Annie\s+Street/i, 'ux-v4-annie-mobile.png', true);
  await mobile.close();

  if (errors.length) throw new Error(errors.join('\n'));
  console.log(JSON.stringify({ ok: true, annie, william, mobile: mobileState }, null, 2));
} catch (error) {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
} finally {
  await browser.close();
}

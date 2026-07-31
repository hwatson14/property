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
    const development = window.LEMONCHECK_ASSESSMENT?.development?.score;
    const renderedDevelopment = document.querySelector('[data-v3-lens="development"] strong')?.textContent?.trim() || '';
    return regex.test(window.PROPERTY_DATA?.canonical_address || '')
      && document.querySelector('[data-ux-version="LC-UX-v0.3.0"]')
      && Number.isFinite(development)
      && /^\d+\/100$/.test(renderedDevelopment);
  }, { source: pattern.source, flags: pattern.flags }, { timeout: 75000 });
  await page.waitForTimeout(250);
}

async function validate(page, pattern, screenshot, mobile = false) {
  const state = await page.evaluate(() => {
    const shell = document.querySelector('.lc-v3-shell');
    const map = document.querySelector('.report-overview-section');
    const old = document.querySelector('.lc-v2-summary');
    const shellRect = shell?.getBoundingClientRect();
    const mapRect = map?.getBoundingClientRect();
    return {
      address: document.querySelector('.lc-v3-property-bar h1')?.textContent?.trim() || '',
      verdict: document.querySelector('.lc-v3-answer h2')?.textContent?.trim() || '',
      boundary: document.querySelector('.lc-v3-boundary')?.textContent || '',
      mapped: document.querySelector('.lc-v3-score-pair article:first-child strong')?.textContent?.trim() || '',
      coverage: document.querySelector('.lc-v3-score-pair article:nth-child(2) strong')?.textContent?.trim() || '',
      price: document.querySelector('.lc-v3-price strong')?.textContent?.trim() || '',
      lenses: document.querySelectorAll('.lc-v3-lens').length,
      findings: document.querySelectorAll('.lc-v3-finding').length,
      nextLabels: [...document.querySelectorAll('.lc-v3-finding small')].map((node) => node.textContent.trim()),
      cta: document.querySelector('[data-v3-personalise]')?.textContent?.trim() || '',
      ctaHeight: document.querySelector('[data-v3-personalise]')?.getBoundingClientRect().height || 0,
      oldHidden: old ? getComputedStyle(old).display === 'none' : true,
      shellBottom: shellRect?.bottom || 0,
      mapTop: mapRect?.top || 0,
      viewportHeight: innerHeight,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      visibleH1: [...document.querySelectorAll('h1')].filter((node) => getComputedStyle(node).display !== 'none' && node.getBoundingClientRect().height > 0).length,
      lemon: window.LEMONCHECK_ASSESSMENT?.objective?.lemonScore,
      development: window.LEMONCHECK_ASSESSMENT?.development?.score,
    };
  });
  if (!pattern.test(state.address)) throw new Error(`Wrong address: ${state.address}`);
  if (!state.verdict || state.verdict.length > 90) throw new Error(`Bad verdict: ${state.verdict}`);
  if (!/mapped public data|mapped screening/i.test(state.boundary)) throw new Error('Evidence boundary missing');
  if (!/^\d+\/100$/.test(state.mapped) || !/^\d+%$/.test(state.coverage)) throw new Error('Score and coverage are not paired');
  if (state.price !== '$–' || state.lenses !== 5) throw new Error('Price or five-lens architecture is wrong');
  if (state.findings !== 3 || state.nextLabels.some((label) => !/^Next:/i.test(label))) throw new Error('Findings do not include actions');
  if (state.cta !== 'Personalise this check' || state.ctaHeight < 44) throw new Error('Primary CTA is invalid');
  if (!state.oldHidden || state.mapTop < state.shellBottom - 2) throw new Error(`Legacy UI or visual order is wrong: ${JSON.stringify({ oldHidden: state.oldHidden, shellBottom: state.shellBottom, mapTop: state.mapTop })}`);
  if (!mobile && state.shellBottom > state.viewportHeight + 8) throw new Error(`Decision cockpit misses first viewport: ${state.shellBottom}`);
  if (state.visibleH1 !== 1 || state.overflow > 2 || !Number.isFinite(state.development)) {
    throw new Error(`Accessibility, overflow or score state failed: ${JSON.stringify({ visibleH1: state.visibleH1, overflow: state.overflow, development: state.development })}`);
  }
  await page.screenshot({ path: `${outDir}/${screenshot}`, fullPage: true });
  return state;
}

try {
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  desktop.on('pageerror', (error) => errors.push(error.message));
  desktop.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await openReport(desktop, '28 Annie Street Hamilton QLD 4007', /28\s+Annie\s+Street/i);
  const annie = await validate(desktop, /28\s+Annie\s+Street/i, 'ux-v3-annie-desktop.png');
  await openReport(desktop, '1 William Street Brisbane City QLD 4000', /\b1\s+William\s+Street/i);
  const william = await validate(desktop, /\b1\s+William\s+Street/i, 'ux-v3-william-desktop.png');
  if (annie.lemon === william.lemon) throw new Error('Contrasting properties have the same score');
  await desktop.close();

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  mobile.on('pageerror', (error) => errors.push(error.message));
  mobile.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await openReport(mobile, '28 Annie Street Hamilton QLD 4007', /28\s+Annie\s+Street/i);
  const mobileState = await validate(mobile, /28\s+Annie\s+Street/i, 'ux-v3-annie-mobile.png', true);
  await mobile.close();

  if (errors.length) throw new Error(errors.join('\n'));
  console.log(JSON.stringify({ ok: true, annie, william, mobile: mobileState }, null, 2));
} catch (error) {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
} finally {
  await browser.close();
}

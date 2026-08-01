import { chromium } from 'playwright-core';
import fs from 'node:fs/promises';

const baseUrl = process.env.PROPERTY_CHECK_BASE_URL || 'http://127.0.0.1:8000/';
const outDir = process.env.PROPERTY_CHECK_ARTIFACT_DIR || 'site/tests/artifacts';
await fs.mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome' });
const failures = [];

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
      && regex.test(document.querySelector('.lcw-property-copy h1')?.textContent || '')
      && window.LEMONCHECK_ASSESSMENT?.governanceVersion === 'LC-BNE-5L-v0.2.1'
      && document.querySelector('[data-ux-version="LC-UX-v0.5.0"]');
  }, { source: pattern.source, flags: pattern.flags }, { timeout: 75000 });
  await page.locator('.lcw-map-host #context-property-map').waitFor({ state: 'visible', timeout: 20000 });
  try {
    await page.locator('.lcw-map-host .context-map-overlay path').first().waitFor({ state: 'attached', timeout: 8000 });
  } catch (error) {
    const debug = await page.evaluate(() => ({
      propertyId: window.PROPERTY_DATA?.property_id,
      mapLayerCount: window.PROPERTY_DATA?.map_layers?.length,
      mapLayers: (window.PROPERTY_DATA?.map_layers || []).map(layer => ({ id: layer.layer_id, role: layer.style_role, type: layer.geometry?.type, coordinates: Array.isArray(layer.geometry?.coordinates) })),
      parcelCount: window.PROPERTY_DATA?.parcels?.length,
      mapVersion: document.querySelector('#context-property-map')?.dataset.mapVersion,
      overlayExists: Boolean(document.querySelector('.lcw-map-host .context-map-overlay')),
      overlayChildren: document.querySelector('.lcw-map-host .context-map-overlay')?.children.length,
      checkedLayers: [...document.querySelectorAll('.lcw-map-host .context-layer-control input:checked')].map(input => input.dataset.layerId),
      hostHtml: document.querySelector('.lcw-map-host')?.innerHTML?.slice(0, 2000),
    }));
    await page.screenshot({ path: `${outDir}/workspace-v5-map-failure.png`, fullPage: true });
    throw new Error(`Official map geometry did not render: ${JSON.stringify(debug)}`);
  }
  await page.waitForTimeout(500);
}

async function validateDesktop(page, pattern, screenshotName) {
  const state = await page.evaluate(() => ({
    version: document.querySelector('[data-ux-version="LC-UX-v0.5.0"]')?.dataset.uxVersion || '',
    address: document.querySelector('.lcw-property-copy h1')?.textContent?.trim() || '',
    recommendation: document.querySelector('.lcw-recommendation h2')?.textContent?.trim() || '',
    coverage: document.querySelector('.lcw-recommendation-metric strong')?.textContent?.trim() || '',
    sidebarVisible: getComputedStyle(document.querySelector('.lcw-sidebar')).display !== 'none',
    priorityIssues: document.querySelectorAll('[data-lcw-panel="summary"] .lcw-issue').length,
    categories: document.querySelectorAll('[data-lcw-panel="summary"] .lcw-category-row').length,
    snapshotPrice: [...document.querySelectorAll('.lcw-snapshot-list div')].find(node => /Property price/i.test(node.textContent || ''))?.querySelector('b')?.textContent?.trim() || '',
    mapTiles: document.querySelectorAll('.lcw-map-host .context-tile').length,
    mapPaths: document.querySelectorAll('.lcw-map-host .context-map-overlay path').length,
    visibleH1: [...document.querySelectorAll('h1')].filter(node => getComputedStyle(node).display !== 'none' && node.getBoundingClientRect().height > 0).length,
    oldV4: Boolean(document.querySelector('[data-ux-version="LC-UX-v0.4.0"]')),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  if (state.version !== 'LC-UX-v0.5.0') throw new Error(`Wrong workspace version: ${JSON.stringify(state)}`);
  if (!pattern.test(state.address)) throw new Error(`Wrong report address: ${state.address}`);
  if (!state.recommendation || !/^\d+%$/.test(state.coverage)) throw new Error(`Recommendation band incomplete: ${JSON.stringify(state)}`);
  if (!state.sidebarVisible || state.priorityIssues < 1 || state.categories !== 9) throw new Error(`Desktop information architecture failed: ${JSON.stringify(state)}`);
  if (state.snapshotPrice !== '$–') throw new Error(`Unavailable price must display $–: ${state.snapshotPrice}`);
  if (state.mapTiles < 4 || state.mapPaths < 1) throw new Error(`Integrated official map failed: ${JSON.stringify(state)}`);
  if (state.visibleH1 !== 1 || state.oldV4 || state.overflow > 2) throw new Error(`Legacy UI, heading or overflow failed: ${JSON.stringify(state)}`);

  await page.locator('.lcw-sidebar [data-lcw-view="checks"]').click();
  await page.locator('[data-lcw-panel="checks"].is-active').waitFor({ state: 'visible', timeout: 5000 });
  const checkState = await page.evaluate(() => ({ groups: document.querySelectorAll('.lcw-check-group').length, rows: document.querySelectorAll('.lcw-check-row').length }));
  if (checkState.groups !== 9 || checkState.rows < 60) throw new Error(`All-checks view incomplete: ${JSON.stringify(checkState)}`);
  await page.locator('.lcw-check-row').first().click();
  await page.locator('.lcw-dialog[open]').waitFor({ state: 'visible', timeout: 5000 });
  await page.locator('.lcw-dialog [data-lcw-close]').first().click();

  await page.locator('.lcw-sidebar [data-lcw-view="docs"]').click();
  await page.locator('[data-lcw-panel="docs"].is-active').waitFor({ state: 'visible', timeout: 5000 });
  if (await page.locator('.lcw-doc-card').count() !== 6) throw new Error('Documents view is incomplete');

  await page.locator('.lcw-sidebar [data-lcw-view="map"]').click();
  await page.locator('[data-lcw-panel="map"].is-active .lcw-map-host #context-property-map').waitFor({ state: 'visible', timeout: 10000 });
  await page.screenshot({ path: `${outDir}/${screenshotName}`, fullPage: true });
  return state;
}

async function validateMobile(page, pattern, screenshotName) {
  const state = await page.evaluate(() => ({
    address: document.querySelector('.lcw-property-copy h1')?.textContent?.trim() || '',
    mobileNav: getComputedStyle(document.querySelector('.lcw-mobile-bottom')).display !== 'none',
    sidebarHidden: getComputedStyle(document.querySelector('.lcw-sidebar')).display === 'none',
    recommendation: document.querySelector('.lcw-recommendation h2')?.textContent?.trim() || '',
    issues: document.querySelectorAll('[data-lcw-panel="summary"] .lcw-issue').length,
    categories: document.querySelectorAll('[data-lcw-panel="summary"] .lcw-category-row').length,
    mapVisible: Boolean(document.querySelector('[data-lcw-panel="summary"].is-active .lcw-map-host #context-property-map')),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  if (!pattern.test(state.address) || !state.mobileNav || !state.sidebarHidden || !state.recommendation) throw new Error(`Mobile shell failed: ${JSON.stringify(state)}`);
  if (state.issues < 1 || state.categories !== 9 || !state.mapVisible || state.overflow > 2) throw new Error(`Mobile content failed: ${JSON.stringify(state)}`);
  await page.locator('.lcw-mobile-nav[data-lcw-view="checks"]').click();
  await page.locator('[data-lcw-panel="checks"].is-active').waitFor({ state: 'visible', timeout: 5000 });
  await page.locator('.lcw-mobile-nav[data-lcw-view="summary"]').click();
  await page.locator('[data-lcw-panel="summary"].is-active').waitFor({ state: 'visible', timeout: 5000 });
  await page.screenshot({ path: `${outDir}/${screenshotName}`, fullPage: true });
  return state;
}

try {
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  desktop.on('pageerror', error => failures.push(`desktop pageerror: ${error.message}`));
  desktop.on('console', message => { if (message.type() === 'error') failures.push(`desktop console: ${message.text()}`); });
  await openReport(desktop, '28 Annie Street Hamilton QLD 4007', /28\s+Annie\s+Street/i);
  const annie = await validateDesktop(desktop, /28\s+Annie\s+Street/i, 'workspace-v5-annie-desktop.png');
  await openReport(desktop, '1 William Street Brisbane City QLD 4000', /\b1\s+William\s+Street/i);
  const william = await validateDesktop(desktop, /\b1\s+William\s+Street/i, 'workspace-v5-william-desktop.png');
  await desktop.close();

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  mobile.on('pageerror', error => failures.push(`mobile pageerror: ${error.message}`));
  mobile.on('console', message => { if (message.type() === 'error') failures.push(`mobile console: ${message.text()}`); });
  await openReport(mobile, '28 Annie Street Hamilton QLD 4007', /28\s+Annie\s+Street/i);
  const mobileState = await validateMobile(mobile, /28\s+Annie\s+Street/i, 'workspace-v5-annie-mobile.png');
  await mobile.close();

  if (failures.length) throw new Error(failures.join('\n'));
  console.log(JSON.stringify({ ok: true, annie, william, mobile: mobileState }, null, 2));
} catch (error) {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
} finally {
  await browser.close();
}

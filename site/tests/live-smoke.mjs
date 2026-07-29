import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const baseUrl = process.env.PROPERTY_CHECK_BASE_URL || 'http://127.0.0.1:8000/';
const outDir = process.env.PROPERTY_CHECK_ARTIFACT_DIR || 'site/tests/artifacts';
await fs.mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const failures = [];

async function testAddress(page, query, expectedPattern, screenshotName) {
  await page.goto(`${baseUrl}#/home`, { waitUntil: 'domcontentloaded', timeout: 45000 });

  const searchPayload = await page.evaluate(async (value) => {
    const response = await fetch(`/api/address-search?q=${encodeURIComponent(value)}`, { headers: { Accept: 'application/json' } });
    return { status: response.status, body: await response.json() };
  }, query);
  console.log(`[address-search] ${query}: ${JSON.stringify(searchPayload)}`);
  const directLive = Array.isArray(searchPayload.body?.results)
    ? searchPayload.body.results.filter((item) => item.source_mode === 'live')
    : [];
  if (!directLive.length) {
    throw new Error(`No live address result for ${query}. Response: ${JSON.stringify(searchPayload)}`);
  }

  await page.locator('#address-search').fill(query);
  await page.locator('[data-search-submit]').click();

  const selected = page
    .locator('.search-result-row')
    .filter({ has: page.locator('.result-mode-live') })
    .filter({ hasText: expectedPattern })
    .first();
  await selected.waitFor({ state: 'visible', timeout: 30000 });
  const rowText = await selected.innerText();
  if (!expectedPattern.test(rowText)) throw new Error(`Unexpected address result for ${query}: ${rowText}`);

  await selected.click();
  await page.waitForFunction(() => {
    const badge = document.querySelector('.mode-badge')?.textContent?.trim() || '';
    return window.PROPERTY_DATA?.mode === 'live' || badge === 'Source unavailable';
  }, null, { timeout: 75000 });

  const reportState = await page.evaluate(() => ({
    hash: window.location.hash,
    badge: document.querySelector('.mode-badge')?.textContent?.trim() || null,
    title: document.querySelector('.report-title-block h1')?.textContent?.trim() || null,
    notice: document.querySelector('[data-spa-page="report"] .demo-notice p')?.textContent?.trim() || null,
    dataMode: window.PROPERTY_DATA?.mode || null,
  }));
  console.log(`[report-state] ${query}: ${JSON.stringify(reportState)}`);
  if (reportState.dataMode !== 'live' || reportState.badge !== 'Live sources') {
    throw new Error(`Live report failed for ${query}. State: ${JSON.stringify(reportState)}`);
  }

  await page.locator('.mode-badge').waitFor({ state: 'visible', timeout: 10000 });
  const title = await page.locator('.report-title-block h1').innerText();
  if (!expectedPattern.test(title)) throw new Error(`Report title did not match ${expectedPattern}: ${title}`);
  if ((await page.locator('.mode-badge').innerText()).trim().toLowerCase() !== 'live sources') throw new Error('Report did not enter live source mode');

  const data = await page.evaluate(() => window.PROPERTY_DATA);
  if (!data || data.mode !== 'live') throw new Error('PROPERTY_DATA live payload missing');
  if (!Array.isArray(data.metrics) || data.metrics.length < 12) throw new Error(`Too few metrics returned: ${data?.metrics?.length ?? 0}`);
  if (!Array.isArray(data.parcels) || data.parcels.length < 1) throw new Error('No parcel resolved');

  const addressMetric = data.metrics.find((metric) => metric.metric_id === 'property.address');
  const parcelMetric = data.metrics.find((metric) => metric.metric_id === 'property.parcels');
  const zoningMetric = data.metrics.find((metric) => metric.metric_id === 'planning.zone');
  const floodMetrics = data.metrics.filter((metric) => metric.category === 'Flood');

  if (addressMetric?.source?.mode !== 'live') throw new Error('Address metric was not sourced live');
  if (parcelMetric?.source?.mode !== 'live') throw new Error('Parcel metric was not sourced live');
  if (!zoningMetric) throw new Error('Zoning metric missing');
  if (!floodMetrics.length) throw new Error('Flood metrics missing');
  if (floodMetrics.every((metric) => metric.source?.mode === 'unavailable')) throw new Error('All flood metrics were unavailable');

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 2) throw new Error(`Horizontal overflow detected: ${overflow}px`);

  await page.screenshot({ path: `${outDir}/${screenshotName}`, fullPage: true });
  return { title, metricCount: data.metrics.length, parcelCount: data.parcels.length, zoningMode: zoningMetric.source?.mode };
}

async function runDesktop() {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', error => failures.push(`desktop pageerror: ${error.message}`));
  page.on('console', message => { if (message.type() === 'error') failures.push(`desktop console: ${message.text()}`); });
  const annie = await testAddress(page, '28 Annie Street Hamilton QLD 4007', /28\s+Annie\s+Street/i, 'live-annie-desktop.png');
  const william = await testAddress(page, '1 William Street Brisbane City QLD 4000', /1\s+William\s+Street/i, 'live-william-desktop.png');
  if (annie.title === william.title) throw new Error('Second address returned the first property report');
  await page.close();
  return { annie, william };
}

async function runMobile() {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  page.on('pageerror', error => failures.push(`mobile pageerror: ${error.message}`));
  page.on('console', message => { if (message.type() === 'error') failures.push(`mobile console: ${message.text()}`); });
  const result = await testAddress(page, '28 Annie Street Hamilton QLD 4007', /28\s+Annie\s+Street/i, 'live-annie-mobile.png');
  await page.close();
  return result;
}

try {
  const desktop = await runDesktop();
  const mobile = await runMobile();
  if (failures.length) throw new Error(failures.join('\n'));
  console.log(JSON.stringify({ ok: true, baseUrl, desktop, mobile }, null, 2));
} catch (error) {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
} finally {
  await browser.close();
}

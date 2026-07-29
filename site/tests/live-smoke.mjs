import { chromium } from 'playwright-core';
import fs from 'node:fs/promises';

const baseUrl = process.env.PROPERTY_CHECK_BASE_URL || 'http://127.0.0.1:8000/';
const outDir = process.env.PROPERTY_CHECK_ARTIFACT_DIR || 'site/tests/artifacts';
await fs.mkdir(outDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
});
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
  const expectedResult = directLive.find((item) => expectedPattern.test(item.address || ''));
  if (!expectedResult) throw new Error(`No matching live address result for ${query}. Response: ${JSON.stringify(searchPayload)}`);
  const expectedPid = decodeURIComponent(String(expectedResult.route || '').split('/').pop() || '');
  if (!expectedPid) throw new Error(`Live result did not include a property route: ${JSON.stringify(expectedResult)}`);

  const searchInput = page.locator('#address-search:visible');
  await searchInput.fill(query);
  const visibleSubmit = page.locator('[data-search-submit]:visible');
  if (await visibleSubmit.count()) await visibleSubmit.click();
  else await searchInput.press('Enter');

  const selected = page.locator('.search-result-row:visible')
    .filter({ has: page.locator('.result-mode-live') })
    .filter({ hasText: expectedPattern })
    .first();
  await selected.waitFor({ state: 'visible', timeout: 30000 });
  const rowText = await selected.innerText();
  if (!expectedPattern.test(rowText)) throw new Error(`Unexpected address result for ${query}: ${rowText}`);
  await selected.click();

  const stateHandle = await page.waitForFunction(
    ({ pid, patternSource, patternFlags }) => {
      const data = window.PROPERTY_DATA;
      const badge = document.querySelector('.mode-badge')?.textContent?.trim() || '';
      const domTitle = document.querySelector('.report-title-block h1')?.textContent?.trim() || '';
      if (badge === 'Source unavailable') return { status: 'failed', badge, hash: window.location.hash, title: domTitle };
      if (!data || data.mode !== 'live' || String(data.property_id) !== String(pid)) return false;
      const pattern = new RegExp(patternSource, patternFlags);
      const canonicalAddress = String(data.canonical_address || '');
      if (!pattern.test(canonicalAddress) || !pattern.test(domTitle)) return false;
      return { status: 'ready', badge, hash: window.location.hash, title: domTitle, canonicalAddress, propertyId: String(data.property_id) };
    },
    { pid: expectedPid, patternSource: expectedPattern.source, patternFlags: expectedPattern.flags },
    { timeout: 75000 },
  );
  const reportState = await stateHandle.jsonValue();
  console.log(`[report-state] ${query}: ${JSON.stringify(reportState)}`);
  if (reportState.status !== 'ready' || reportState.badge !== 'Live sources') throw new Error(`Live report failed for ${query}. State: ${JSON.stringify(reportState)}`);

  await page.locator('.prototype-scores-section').waitFor({ state: 'visible', timeout: 20000 });
  await page.locator('#context-property-map').waitFor({ state: 'visible', timeout: 20000 });
  await page.locator('#context-property-map .context-map-overlay path').first().waitFor({ state: 'attached', timeout: 20000 });
  await page.locator('#context-property-map .context-map-attribution').waitFor({ state: 'visible', timeout: 10000 });

  const title = reportState.title;
  if (!expectedPattern.test(title)) throw new Error(`Report title did not match ${expectedPattern}: ${title}`);

  const data = await page.evaluate(() => window.PROPERTY_DATA);
  if (!data || data.mode !== 'live') throw new Error('PROPERTY_DATA live payload missing');
  if (String(data.property_id) !== String(expectedPid)) throw new Error(`Wrong property report loaded. Expected ${expectedPid}, received ${data.property_id}`);
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

  const enhancementState = await page.evaluate(() => ({
    score: window.PROPERTY_DATA?.prototype_scores?.overall,
    planning: window.PROPERTY_DATA?.prototype_scores?.planning,
    hazard: window.PROPERTY_DATA?.prototype_scores?.hazard,
    parcel: window.PROPERTY_DATA?.prototype_scores?.parcel,
    breadth: window.PROPERTY_DATA?.prototype_scores?.assessmentBreadth,
    mapExists: Boolean(document.querySelector('#context-property-map .context-map-overlay')),
    tileCount: document.querySelectorAll('#context-property-map .context-tile').length,
    parcelPathCount: document.querySelectorAll('#context-property-map .context-map-overlay path').length,
    oldMapHidden: getComputedStyle(document.getElementById('property-map')).display === 'none',
    mapNote: document.querySelector('.map-source-note')?.textContent?.trim() || '',
    attribution: document.querySelector('.context-map-attribution')?.textContent?.trim() || '',
    satelliteControl: Boolean(document.querySelector('[data-basemap="satellite"]')),
    scoreHeading: document.querySelector('.prototype-overall-score > span')?.textContent?.trim() || '',
  }));
  if (!Number.isFinite(enhancementState.score) || enhancementState.score < 0 || enhancementState.score > 100) throw new Error(`Invalid prototype Lemon Risk score: ${JSON.stringify(enhancementState)}`);
  for (const [name, value] of Object.entries({ planning: enhancementState.planning, hazard: enhancementState.hazard, parcel: enhancementState.parcel, breadth: enhancementState.breadth })) {
    if (!Number.isFinite(value) || value < 0 || value > 100) throw new Error(`Invalid ${name} score: ${value}`);
  }
  if (!enhancementState.mapExists || !enhancementState.oldMapHidden || enhancementState.tileCount < 4 || enhancementState.parcelPathCount < 1) throw new Error(`Contextual map did not replace the abstract SVG: ${JSON.stringify(enhancementState)}`);
  if (!/OpenStreetMap/i.test(enhancementState.attribution)) throw new Error(`Street-map attribution missing: ${enhancementState.attribution}`);
  if (!enhancementState.satelliteControl) throw new Error('Satellite imagery control is missing');
  if (!/OpenStreetMap/i.test(enhancementState.mapNote) || !/Esri World Imagery/i.test(enhancementState.mapNote) || !/No listing photographs are used/i.test(enhancementState.mapNote)) throw new Error(`Map provenance note is incomplete: ${enhancementState.mapNote}`);
  if (enhancementState.scoreHeading !== 'Prototype Lemon Risk') throw new Error('Prototype score heading is missing');

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 2) throw new Error(`Horizontal overflow detected: ${overflow}px`);

  await page.screenshot({ path: `${outDir}/${screenshotName}`, fullPage: true });
  return { title, propertyId: String(data.property_id), metricCount: data.metrics.length, parcelCount: data.parcels.length, zoningMode: zoningMetric.source?.mode, lemonRisk: enhancementState.score, planningScore: enhancementState.planning, hazardScore: enhancementState.hazard, parcelScore: enhancementState.parcel };
}

async function runDesktop() {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', error => failures.push(`desktop pageerror: ${error.message}`));
  page.on('console', message => { if (message.type() === 'error') failures.push(`desktop console: ${message.text()}`); });
  const annie = await testAddress(page, '28 Annie Street Hamilton QLD 4007', /28\s+Annie\s+Street/i, 'live-annie-desktop.png');
  const william = await testAddress(page, '1 William Street Brisbane City QLD 4000', /\b1\s+William\s+Street/i, 'live-william-desktop.png');
  if (annie.propertyId === william.propertyId || annie.title === william.title) throw new Error('Second address returned the first property report');
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
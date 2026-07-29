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

  await page.locator('.lemoncheck-decision-section').waitFor({ state: 'visible', timeout: 20000 });
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

  const initialAssessment = await page.evaluate(() => window.LEMONCHECK_ASSESSMENT);
  if (!initialAssessment || initialAssessment.modelVersion !== 'LC-BNE-5L-v0.2.0') throw new Error(`Five-score assessment missing: ${JSON.stringify(initialAssessment)}`);
  if (!Number.isFinite(initialAssessment.objective?.lemonScore) || initialAssessment.objective.lemonScore < 0 || initialAssessment.objective.lemonScore > 100) throw new Error(`Invalid Lemon Score: ${JSON.stringify(initialAssessment.objective)}`);
  if (!Number.isFinite(initialAssessment.confidence?.score) || initialAssessment.confidence.score < 0 || initialAssessment.confidence.score > 100) throw new Error(`Invalid Confidence Score: ${JSON.stringify(initialAssessment.confidence)}`);
  if (initialAssessment.development?.score !== null && (!Number.isFinite(initialAssessment.development.score) || initialAssessment.development.score < 0 || initialAssessment.development.score > 100)) throw new Error(`Invalid Development Potential: ${JSON.stringify(initialAssessment.development)}`);
  if (initialAssessment.deal?.score !== null || initialAssessment.fit?.score !== null) throw new Error('Deal and Personal Fit should wait for buyer inputs on a fresh test browser');

  const scoreLabels = await page.locator('.lc-score-card-head > span').allTextContents();
  for (const required of ['Lemon Score', 'Deal Score', 'Personal Fit', 'Development Potential', 'Confidence']) {
    if (!scoreLabels.includes(required)) throw new Error(`Missing score lens ${required}: ${JSON.stringify(scoreLabels)}`);
  }
  if (await page.locator('.prototype-scores-section:visible').count()) throw new Error('Superseded Prototype Lemon Risk section is still visible');

  const form = page.locator('.lc-profile-form');
  await form.locator('[name="goal"]').selectOption('live_in');
  await form.locator('[name="riskTolerance"]').selectOption('balanced');
  await form.locator('[name="price"]').fill('900000');
  await form.locator('[name="fairValue"]').fill('1000000');
  await form.locator('[name="costs"]').fill('25000');
  await form.locator('[name="simpleTitle"]').check();
  await form.locator('button[type="submit"]').click();

  await page.waitForFunction(() => {
    const assessment = window.LEMONCHECK_ASSESSMENT;
    return Number.isFinite(assessment?.deal?.score) && Number.isFinite(assessment?.fit?.score);
  }, null, { timeout: 10000 });

  const assessment = await page.evaluate(() => window.LEMONCHECK_ASSESSMENT);
  for (const [name, value] of Object.entries({
    lemon: assessment.objective.lemonScore,
    deal: assessment.deal.score,
    fit: assessment.fit.score,
    development: assessment.development.score,
    confidence: assessment.confidence.score,
  })) {
    if (value !== null && (!Number.isFinite(value) || value < 0 || value > 100)) throw new Error(`Invalid ${name} score: ${value}`);
  }
  if (!assessment.decision?.title) throw new Error('Decision summary missing');
  if (!Array.isArray(assessment.flags)) throw new Error('Hard flags missing');

  const mapState = await page.evaluate(() => ({
    mapExists: Boolean(document.querySelector('#context-property-map .context-map-overlay')),
    tileCount: document.querySelectorAll('#context-property-map .context-tile').length,
    parcelPathCount: document.querySelectorAll('#context-property-map .context-map-overlay path').length,
    oldMapHidden: getComputedStyle(document.getElementById('property-map')).display === 'none',
    mapNote: document.querySelector('.map-source-note')?.textContent?.trim() || '',
    attribution: document.querySelector('.context-map-attribution')?.textContent?.trim() || '',
    satelliteControl: Boolean(document.querySelector('[data-basemap="satellite"]')),
  }));
  if (!mapState.mapExists || !mapState.oldMapHidden || mapState.tileCount < 4 || mapState.parcelPathCount < 1) throw new Error(`Contextual map did not replace the abstract SVG: ${JSON.stringify(mapState)}`);
  if (!/OpenStreetMap/i.test(mapState.attribution)) throw new Error(`Street-map attribution missing: ${mapState.attribution}`);
  if (!mapState.satelliteControl) throw new Error('Satellite imagery control is missing');
  if (!/OpenStreetMap/i.test(mapState.mapNote) || !/Esri World Imagery/i.test(mapState.mapNote) || !/No listing photographs are used/i.test(mapState.mapNote)) throw new Error(`Map provenance note is incomplete: ${mapState.mapNote}`);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 2) throw new Error(`Horizontal overflow detected: ${overflow}px`);

  await page.screenshot({ path: `${outDir}/${screenshotName}`, fullPage: true });
  return {
    title,
    propertyId: String(data.property_id),
    metricCount: data.metrics.length,
    parcelCount: data.parcels.length,
    zoningMode: zoningMetric.source?.mode,
    decision: assessment.decision.title,
    lemonScore: assessment.objective.lemonScore,
    dealScore: assessment.deal.score,
    fitScore: assessment.fit.score,
    developmentScore: assessment.development.score,
    confidenceScore: assessment.confidence.score,
    hardFlags: assessment.flags.length,
  };
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

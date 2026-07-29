import { chromium } from 'playwright-core';
import fs from 'node:fs/promises';

const baseUrl = process.env.PROPERTY_CHECK_BASE_URL || 'http://127.0.0.1:8001/';
const outDir = process.env.PROPERTY_CHECK_ARTIFACT_DIR || 'site/tests/pricing-client-artifacts';
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
    return window.PROPERTY_DATA?.mode === 'live' && regex.test(window.PROPERTY_DATA?.canonical_address || '') && window.LEMONCHECK_ASSESSMENT?.governanceVersion === 'LC-BNE-5L-v0.2.1';
  }, { source: pattern.source, flags: pattern.flags }, { timeout: 75000 });
  await page.waitForFunction(() => window.LEMONCHECK_ASSESSMENT?.pricingClientVersion === 'LC-PRICE-CLIENT-v0.1.0', null, { timeout: 20000 });
}

async function validateAnnie(page) {
  await openAddress(page, '28 Annie Street Hamilton QLD 4007', /28\s+Annie\s+Street/i);
  const state = await page.evaluate(() => ({
    pricing: window.LEMONCHECK_PRICING,
    assessment: window.LEMONCHECK_ASSESSMENT,
    panel: document.querySelector('.lc-pricing-panel')?.textContent || '',
    fairValueHidden: document.querySelector('[name="fairValue"]')?.closest('label')?.hidden,
    fairValueDisabled: document.querySelector('[name="fairValue"]')?.disabled,
    offerValue: document.querySelector('[name="price"]')?.value,
  }));
  if (state.pricing?.schemaVersion !== 'LC-PRICE-v0.1.0') throw new Error(`Pricing schema missing: ${JSON.stringify(state)}`);
  if (state.pricing?.propertyMatch?.provider !== 'fixture' || state.pricing?.propertyMatch?.quality !== 'exact') throw new Error('Fixture exact-match pricing missing');
  if (state.pricing?.marketEstimate?.mid !== 2500000) throw new Error('Automated AVM did not load');
  if (state.pricing?.listing?.price?.mid !== 2400000) throw new Error('Automated listing price did not load');
  if (!Number.isFinite(state.assessment?.deal?.score)) throw new Error('Automated Deal Score was not calculated');
  if (!state.fairValueHidden || !state.fairValueDisabled) throw new Error('Manual fair-value field remains usable');
  if (state.offerValue) throw new Error('Listing price should not be written into the buyer intended-offer field');
  if (!/Offers over \$2\.4m/i.test(state.panel) || !/\$2,500,000/i.test(state.panel)) throw new Error(`Pricing evidence panel incomplete: ${state.panel}`);
  if (state.assessment.confidence.score <= 55 || state.assessment.confidence.score > 70) throw new Error(`Pricing evidence did not adjust Confidence appropriately: ${state.assessment.confidence.score}`);
  await page.screenshot({ path: `${outDir}/pricing-annie-desktop.png`, fullPage: true });
  return { address: state.pricing.requestedAddress, deal: state.assessment.deal.score, confidence: state.assessment.confidence.score };
}

async function validateWilliam(page) {
  await openAddress(page, '1 William Street Brisbane City QLD 4000', /\b1\s+William\s+Street/i);
  const before = await page.evaluate(() => ({ pricing: window.LEMONCHECK_PRICING, deal: window.LEMONCHECK_ASSESSMENT?.deal }));
  if (before.pricing?.listing?.displayPrice !== 'Auction' || before.pricing?.listing?.price?.numeric !== false) throw new Error('Auction listing was incorrectly converted to a number');
  if (before.deal?.score !== null) throw new Error(`Deal Score should wait for intended offer on auction: ${JSON.stringify(before.deal)}`);

  const form = page.locator('.lc-profile-form');
  await form.locator('[name="goal"]').selectOption('live_in');
  await form.locator('[name="riskTolerance"]').selectOption('balanced');
  await form.locator('[name="price"]').fill('3200000');
  await form.locator('[name="costs"]').fill('100000');
  await form.locator('button[type="submit"]').click();
  await page.waitForFunction(() => Number.isFinite(window.LEMONCHECK_ASSESSMENT?.deal?.score) && window.LEMONCHECK_ASSESSMENT?.deal?.purchasePrice === 3200000, null, { timeout: 20000 });
  const after = await page.evaluate(() => ({ pricing: window.LEMONCHECK_PRICING, assessment: window.LEMONCHECK_ASSESSMENT, panel: document.querySelector('.lc-pricing-panel')?.textContent || '' }));
  if (after.assessment.deal.source !== 'your intended offer') throw new Error(`Intended offer was not used: ${JSON.stringify(after.assessment.deal)}`);
  if (!Number.isFinite(after.assessment.deal.score) || after.assessment.deal.score < 0 || after.assessment.deal.score > 100) throw new Error('Invalid automatic Deal Score after intended offer');
  if (!/Auction/i.test(after.panel) || !/No numeric listing price inferred/i.test(after.panel)) throw new Error('Auction provenance missing');
  await page.screenshot({ path: `${outDir}/pricing-william-desktop.png`, fullPage: true });
  return { address: after.pricing.requestedAddress, deal: after.assessment.deal.score, purchasePrice: after.assessment.deal.purchasePrice };
}

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', error => failures.push(`pageerror: ${error.message}`));
  page.on('console', message => { if (message.type() === 'error') failures.push(`console: ${message.text()}`); });
  const annie = await validateAnnie(page);
  const william = await validateWilliam(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 2) throw new Error(`Horizontal overflow ${overflow}px`);
  if (failures.length) throw new Error(failures.join('\n'));
  console.log(JSON.stringify({ ok: true, baseUrl, annie, william }, null, 2));
  await page.close();
} catch (error) {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
} finally {
  await browser.close();
}

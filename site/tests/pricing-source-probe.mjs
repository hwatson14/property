import { chromium } from 'playwright-core';
import fs from 'node:fs/promises';

const outDir = process.env.PRICING_PROBE_ARTIFACT_DIR || 'site/tests/pricing-probe-artifacts';
await fs.mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome' });

const report = { generatedAt: new Date().toISOString(), qldValuation: {}, listingBridge: {} };

async function probeQueenslandValuation() {
  const context = await browser.newContext({ locale: 'en-AU' });
  const page = await context.newPage();
  const network = [];
  page.on('response', async response => {
    const url = response.url();
    if (/valu|property|search|address|api|graphql/i.test(url)) {
      let body = null;
      const type = response.headers()['content-type'] || '';
      if (/json|text/.test(type)) {
        try { body = (await response.text()).slice(0, 12000); } catch {}
      }
      network.push({ url, status: response.status(), method: response.request().method(), contentType: type, body });
    }
  });

  const url = 'https://www.qld.gov.au/environment/land/title/valuation/find-your-land-valuation';
  await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
  const controls = await page.locator('input,button,select').evaluateAll(elements => elements.map((el, i) => ({
    i,
    tag: el.tagName,
    type: el.getAttribute('type'),
    name: el.getAttribute('name'),
    id: el.id,
    placeholder: el.getAttribute('placeholder'),
    aria: el.getAttribute('aria-label'),
    text: (el.textContent || '').trim().slice(0, 200),
    visible: !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length),
  })));

  const candidates = page.locator('input:visible');
  const count = await candidates.count();
  let searched = false;
  for (let i = 0; i < count; i++) {
    const input = candidates.nth(i);
    const placeholder = (await input.getAttribute('placeholder')) || '';
    const type = (await input.getAttribute('type')) || '';
    if (/address|property id/i.test(placeholder) || ['search','text'].includes(type)) {
      try {
        await input.fill('28 Annie Street Hamilton QLD 4007');
        await input.press('Enter');
        searched = true;
        break;
      } catch {}
    }
  }
  if (searched) await page.waitForTimeout(8000);
  const bodyText = (await page.locator('body').innerText()).slice(0, 30000);
  await page.screenshot({ path: `${outDir}/qld-valuation.png`, fullPage: true });
  report.qldValuation = { url: page.url(), searched, controls, bodyText, network };
  await context.close();
}

async function probeListingBridge() {
  const context = await browser.newContext({ locale: 'en-AU' });
  const page = await context.newPage();
  const address = '17 Moolingal Street Jindalee QLD 4074';
  const reaSearch = 'https://www.realestate.com.au/buy/in-17+moolingal+street,+jindalee,+qld+4074/list-1';
  const candidates = [
    `https://r.jina.ai/http://${reaSearch.replace(/^https?:\/\//, '')}`,
    `https://r.jina.ai/https://${reaSearch.replace(/^https?:\/\//, '')}`,
    reaSearch,
  ];
  const attempts = [];
  for (const url of candidates) {
    try {
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(2500);
      const text = (await page.locator('body').innerText()).slice(0, 40000);
      attempts.push({ url, finalUrl: page.url(), status: response?.status() || null, text, priceMatches: [...text.matchAll(/(?:A\$|\$)\s?([0-9][0-9,.]*\s?(?:m|million|k)?)/gi)].slice(0, 20).map(m => m[0]) });
      if (/17\s+Moolingal/i.test(text) && /1,?350,?000|1\.35\s?m/i.test(text)) break;
    } catch (error) {
      attempts.push({ url, error: error.message });
    }
  }
  report.listingBridge = { address, attempts };
  await fs.writeFile(`${outDir}/pricing-source-probe.json`, JSON.stringify(report, null, 2));
  await context.close();
}

try {
  await probeQueenslandValuation();
  await probeListingBridge();
  console.log(JSON.stringify({
    ok: true,
    qldNetwork: report.qldValuation.network?.map(item => ({ url: item.url, status: item.status, method: item.method, contentType: item.contentType })),
    listingAttempts: report.listingBridge.attempts?.map(item => ({ url: item.url, finalUrl: item.finalUrl, status: item.status, priceMatches: item.priceMatches, error: item.error, hasAddress: /17\s+Moolingal/i.test(item.text || '') })),
  }, null, 2));
} finally {
  await browser.close();
}

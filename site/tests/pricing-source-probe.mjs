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
    const request = response.request();
    const url = response.url();
    const resourceType = request.resourceType();
    if (['xhr','fetch'].includes(resourceType) || /valu|property|search|address|api|graphql|autocomplete/i.test(url)) {
      let body = null;
      const type = response.headers()['content-type'] || '';
      if (/json|text|javascript/.test(type)) {
        try { body = (await response.text()).slice(0, 30000); } catch {}
      }
      network.push({ url, status: response.status(), method: request.method(), resourceType, contentType: type, requestPostData: request.postData(), body });
    }
  });

  const url = 'https://www.qld.gov.au/environment/land/title/valuation/find-your-land-valuation';
  await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
  const scripts = await page.locator('script[src]').evaluateAll(nodes => nodes.map(node => node.src));
  const input = page.locator('#search-query');
  await input.waitFor({ state: 'visible', timeout: 20000 });
  await input.fill('28 Annie Street Hamilton QLD 4007');
  await page.waitForTimeout(4000);
  const suggestionState = await page.locator('body').evaluate(body => {
    const candidates = [...body.querySelectorAll('[role="option"], [role="listbox"] li, .autocomplete li, .autocomplete__option, [class*="suggest"] li')];
    return candidates.slice(0, 20).map((el, i) => ({ i, text: (el.textContent || '').trim(), role: el.getAttribute('role'), className: el.className }));
  });
  let selected = false;
  const option = page.locator('[role="option"]:visible, [role="listbox"] li:visible, .autocomplete__option:visible, [class*="suggest"] li:visible').first();
  if (await option.count()) {
    await option.click();
    selected = true;
  } else {
    await input.press('ArrowDown');
    await input.press('Enter');
    selected = true;
  }
  await page.waitForTimeout(10000);
  const bodyText = (await page.locator('body').innerText()).slice(0, 50000);
  await page.screenshot({ path: `${outDir}/qld-valuation.png`, fullPage: true });
  report.qldValuation = { url: page.url(), selected, scripts, suggestionState, bodyText, network };
  await context.close();
}

async function probeListingBridge() {
  const context = await browser.newContext({ locale: 'en-AU' });
  const page = await context.newPage();
  const address = '17 Moolingal Street Jindalee QLD 4074';
  const sources = [
    ['Domain property profile', 'https://www.domain.com.au/property-profile/17-moolingal-street-jindalee-qld-4074'],
    ['property.com.au property profile', 'https://www.property.com.au/qld/jindalee-4074/moolingal-st/17-pid-5465849/'],
    ['OnTheHouse property profile', 'https://www.onthehouse.com.au/property/qld/jindalee-4074/17-moolingal-st-jindalee-qld-4074-2940070'],
    ['view.com.au listing', 'https://view.com.au/property/qld/jindalee-4074/17-moolingal-street-17822040/'],
    ['REA listing', 'https://www.realestate.com.au/property-house-qld-jindalee-150945408'],
  ];
  const attempts = [];
  for (const [name, sourceUrl] of sources) {
    for (const protocol of ['https','http']) {
      const bridgeUrl = `https://r.jina.ai/${protocol}://${sourceUrl.replace(/^https?:\/\//, '')}`;
      try {
        const response = await page.goto(bridgeUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(1800);
        const text = (await page.locator('body').innerText()).slice(0, 50000);
        attempts.push({ name, sourceUrl, bridgeUrl, finalUrl: page.url(), status: response?.status() || null, text, priceMatches: [...text.matchAll(/(?:A\$|\$)\s?([0-9][0-9,.]*\s?(?:m|million|k)?)/gi)].slice(0, 30).map(m => m[0]) });
        if (/17\s+Moolingal/i.test(text) && /1,?3(?:00|50|80),?000|1\.(?:3|35|38)\s?m/i.test(text)) break;
      } catch (error) {
        attempts.push({ name, sourceUrl, bridgeUrl, error: error.message });
      }
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
    qld: {
      finalUrl: report.qldValuation.url,
      selected: report.qldValuation.selected,
      suggestions: report.qldValuation.suggestionState,
      valueText: (report.qldValuation.bodyText || '').match(/(?:Current value|New value)[\s\S]{0,250}/gi),
      network: report.qldValuation.network?.map(item => ({ url: item.url, status: item.status, method: item.method, resourceType: item.resourceType, contentType: item.contentType, requestPostData: item.requestPostData })),
    },
    listingAttempts: report.listingBridge.attempts?.map(item => ({ name: item.name, sourceUrl: item.sourceUrl, bridgeUrl: item.bridgeUrl, finalUrl: item.finalUrl, status: item.status, priceMatches: item.priceMatches, error: item.error, hasAddress: /17\s+Moolingal/i.test(item.text || '') })),
  }, null, 2));
} finally {
  await browser.close();
}

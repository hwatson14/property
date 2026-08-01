import { chromium } from 'playwright-core';
import fs from 'node:fs/promises';

const baseUrl = process.env.PROPERTY_CHECK_BASE_URL || 'http://127.0.0.1:8000/';
const outDir = process.env.PROPERTY_CHECK_ARTIFACT_DIR || 'site/tests/artifacts';
await fs.mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome' });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
try {
  await page.goto(`${baseUrl}#/home`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  const input = page.locator('#address-search:visible');
  await input.fill('28 Annie Street Hamilton QLD 4007');
  const submit = page.locator('[data-search-submit]:visible');
  if (await submit.count()) await submit.click(); else await input.press('Enter');
  const row = page.locator('.search-result-row:visible').filter({ has: page.locator('.result-mode-live') }).filter({ hasText: /28\s+Annie\s+Street/i }).first();
  await row.waitFor({ state: 'visible', timeout: 30000 });
  await row.click();
  await page.waitForFunction(() => document.querySelector('[data-ux-version="LC-UX-v0.5.0"]') && document.querySelector('#context-property-map'), null, { timeout: 75000 });
  await page.waitForTimeout(1000);
  const state = await page.evaluate(() => {
    const viewport = document.documentElement.clientWidth;
    const offenders = [...document.querySelectorAll('body *')].map((node) => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return {
        tag: node.tagName,
        className: String(node.className || '').slice(0, 180),
        id: node.id || '',
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        width: Math.round(rect.width),
        scrollWidth: node.scrollWidth,
        display: style.display,
        position: style.position,
        text: (node.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 100),
      };
    }).filter(item => item.display !== 'none' && (item.right > viewport + 2 || item.left < -2 || item.scrollWidth > Math.ceil(item.width) + 4))
      .sort((a, b) => Math.max(b.right - viewport, b.scrollWidth - b.width) - Math.max(a.right - viewport, a.scrollWidth - a.width))
      .slice(0, 20);
    return {
      viewport,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      overflow: document.documentElement.scrollWidth - viewport,
      offenders,
    };
  });
  await page.screenshot({ path: `${outDir}/workspace-v5-mobile-diagnostic.png`, fullPage: true });
  console.log(JSON.stringify(state, null, 2));
} finally {
  await browser.close();
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { DomainPricingProvider } from '../src/domain-provider.mjs';
import { exactAddressMatch, parseDisplayPrice } from '../src/normalise.mjs';

function response(status, payload) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload };
}

test('display-price parser preserves sale method and refuses non-numeric marketing text', () => {
  assert.deepEqual(parseDisplayPrice('Auction'), { raw: 'Auction', numeric: false, strategy: 'auction', low: null, mid: null, high: null });
  assert.deepEqual(parseDisplayPrice('Contact Agent'), { raw: 'Contact Agent', numeric: false, strategy: 'contact_agent', low: null, mid: null, high: null });
  assert.deepEqual(parseDisplayPrice('Offers over $1.35m'), { raw: 'Offers over $1.35m', numeric: true, strategy: 'offers_over', low: 1_350_000, mid: 1_350_000, high: 1_350_000 });
  assert.deepEqual(parseDisplayPrice('$1.2m - $1.4m'), { raw: '$1.2m - $1.4m', numeric: true, strategy: 'range', low: 1_200_000, mid: 1_300_000, high: 1_400_000 });
});

test('exact address match wins over higher-scoring partial addresses', () => {
  const match = exactAddressMatch('1 William Street Brisbane City QLD 4000', [
    { address: '115 William Street Brisbane City QLD 4000', id: 'wrong', relativeScore: 100 },
    { address: '1 William St Brisbane City QLD 4000', id: 'correct', relativeScore: 80 },
  ]);
  assert.equal(match.candidate.id, 'correct');
  assert.equal(match.exact, true);
});

test('postcode completion is exact only when the omitted postcode resolves uniquely', () => {
  const unique = exactAddressMatch('28 Annie Street Hamilton QLD', [
    { address: '28 Annie Street Hamilton QLD 4007', id: 'unique', relativeScore: 90 },
  ]);
  assert.equal(unique.candidate.id, 'unique');
  assert.equal(unique.exact, true);
  assert.equal(unique.ambiguous, false);

  const ambiguous = exactAddressMatch('28 Annie Street Hamilton QLD', [
    { address: '28 Annie Street Hamilton QLD 4007', id: 'first-postcode', relativeScore: 90 },
    { address: '28 Annie Street Hamilton QLD 4011', id: 'second-postcode', relativeScore: 95 },
  ]);
  assert.equal(ambiguous.exact, false);
  assert.equal(ambiguous.ambiguous, true);

  const constrained = exactAddressMatch('28 Annie Street Hamilton QLD 4007', [
    { address: '28 Annie Street Hamilton QLD 4011', id: 'wrong-postcode', relativeScore: 100 },
    { address: '28 Annie Street Hamilton QLD 4007', id: 'correct-postcode', relativeScore: 80 },
  ]);
  assert.equal(constrained.candidate.id, 'correct-postcode');
  assert.equal(constrained.exact, true);
  assert.equal(constrained.ambiguous, false);
});

test('Domain provider resolves exact property, AVM, listing and sale history', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), method: options.method || 'GET', body: options.body ? String(options.body) : null, authorization: options.headers?.Authorization });
    if (String(url).includes('/connect/token')) return response(200, { access_token: 'test-token', expires_in: 3600 });
    if (String(url).includes('/properties/_suggest')) return response(200, [
      { address: '115 William Street Brisbane City QLD 4000', id: 'wrong', relativeScore: 100, addressComponents: { suburb: 'Brisbane City', state: 'QLD', postCode: '4000' } },
      { address: '1 William Street Brisbane City QLD 4000', id: 'right', relativeScore: 90, addressComponents: { suburb: 'Brisbane City', state: 'QLD', postCode: '4000' } },
    ]);
    if (String(url).endsWith('/v1/properties/right')) return response(200, {
      id: 'right', address: '1 William Street Brisbane City QLD 4000',
      history: { sales: [{ date: '2024-01-15', price: 1_250_000, type: 'Private Treaty - Sold', documentedAsSold: true, suppressDetails: false, suppressPrice: false, daysOnMarket: 21 }] },
    });
    if (String(url).endsWith('/v1/properties/right/priceEstimate')) return response(200, { lowerPrice: 1_200_000, midPrice: 1_300_000, upperPrice: 1_400_000, priceConfidence: 'high', date: '2026-07-01' });
    if (String(url).includes('/listings/residential/_search')) return response(200, [{
      type: 'PropertyListing', listing: {
        id: 888, status: 'live', listingType: 'Sale', saleMode: 'privateTreaty',
        addressParts: { displayAddress: '1 William Street Brisbane City QLD 4000' },
        priceDetails: { displayPrice: 'Offers over $1.35m' }, dateUpdated: '2026-07-20', seoUrl: 'https://domain.example/listing',
      },
    }]);
    throw new Error(`Unexpected request ${url}`);
  };

  const provider = new DomainPricingProvider({ clientId: 'client', clientSecret: 'secret', fetchImpl, apiBase: 'https://api.test', authUrl: 'https://auth.test/connect/token' });
  const result = await provider.pricing('1 William Street Brisbane City QLD 4000');
  assert.equal(result.schemaVersion, 'LC-PRICE-v0.1.0');
  assert.equal(result.status, 'complete');
  assert.equal(result.propertyMatch.propertyId, 'right');
  assert.equal(result.propertyMatch.quality, 'exact');
  assert.equal(result.marketEstimate.mid, 1_300_000);
  assert.equal(result.listing.price.strategy, 'offers_over');
  assert.equal(result.listing.price.mid, 1_350_000);
  assert.equal(result.saleHistory[0].price, 1_250_000);
  assert.ok(calls.some(call => call.authorization === 'Bearer test-token'));
  assert.equal(calls.filter(call => call.url.includes('/connect/token')).length, 1, 'access token should be reused');
});

test('Domain provider rejects postcode ambiguity', async () => {
  const fetchImpl = async (url) => {
    if (String(url).includes('/connect/token')) return response(200, { access_token: 'test-token', expires_in: 3600 });
    if (String(url).includes('/properties/_suggest')) return response(200, [
      { address: '28 Annie Street Hamilton QLD 4007', id: 'one', relativeScore: 90 },
      { address: '28 Annie Street Hamilton QLD 4011', id: 'two', relativeScore: 95 },
    ]);
    throw new Error(`Unexpected request ${url}`);
  };
  const provider = new DomainPricingProvider({ clientId: 'client', clientSecret: 'secret', fetchImpl, apiBase: 'https://api.test', authUrl: 'https://auth.test/connect/token' });
  await assert.rejects(() => provider.pricing('28 Annie Street Hamilton QLD'), /multiple postcode candidates/i);
});

test('Domain provider returns partial response when listing and estimate are unavailable', async () => {
  const fetchImpl = async (url) => {
    if (String(url).includes('/connect/token')) return response(200, { access_token: 'test-token', expires_in: 3600 });
    if (String(url).includes('/properties/_suggest')) return response(200, [{ address: '28 Annie Street Hamilton QLD 4007', id: 'annie', relativeScore: 100, addressComponents: { suburb: 'Hamilton', state: 'QLD', postCode: '4007' } }]);
    if (String(url).endsWith('/v1/properties/annie')) return response(200, { id: 'annie', address: '28 Annie Street Hamilton QLD 4007', history: { sales: [{ date: '2020-01-01', price: 1_800_000, suppressDetails: false, suppressPrice: false }] } });
    if (String(url).endsWith('/priceEstimate')) return response(404, { message: 'Not available' });
    if (String(url).includes('/listings/residential/_search')) return response(200, []);
    throw new Error(`Unexpected request ${url}`);
  };
  const provider = new DomainPricingProvider({ clientId: 'client', clientSecret: 'secret', fetchImpl, apiBase: 'https://api.test', authUrl: 'https://auth.test/connect/token' });
  const result = await provider.pricing('28 Annie Street Hamilton QLD 4007');
  assert.equal(result.status, 'partial');
  assert.equal(result.marketEstimate.available, false);
  assert.equal(result.listing.status, 'not_found');
  assert.equal(result.saleHistory.length, 1);
});

test('HTTP gateway serves automated fixture contract and rejects unknown addresses', async (t) => {
  const port = 19000 + Math.floor(Math.random() * 1000);
  const child = spawn(process.execPath, ['src/server.mjs'], {
    cwd: new URL('../', import.meta.url),
    env: { ...process.env, PORT: String(port), PRICING_PROVIDER: 'fixture', ALLOWED_ORIGINS: 'http://127.0.0.1:8000' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(() => child.kill('SIGTERM'));
  const started = Promise.race([
    once(child.stdout, 'data'),
    once(child, 'exit').then(([code]) => { throw new Error(`fixture gateway exited ${code}`); }),
  ]);
  await started;

  const health = await fetch(`http://127.0.0.1:${port}/health`).then(r => r.json());
  assert.equal(health.status, 'ok');
  assert.equal(health.schemaVersion, 'LC-PRICE-v0.1.0');

  const responseOne = await fetch(`http://127.0.0.1:${port}/v1/pricing?address=${encodeURIComponent('28 Annie Street Hamilton QLD 4007')}`);
  assert.equal(responseOne.status, 200);
  const payloadOne = await responseOne.json();
  assert.equal(payloadOne.status, 'complete');
  assert.equal(payloadOne.marketEstimate.mid, 2_500_000);
  assert.equal(payloadOne.listing.price.mid, 2_400_000);
  assert.equal(payloadOne.propertyMatch.provider, 'fixture');
  assert.equal(payloadOne.sources[0].authority, 'test_only');
  assert.equal(payloadOne.cache.status, 'miss');

  const payloadTwo = await fetch(`http://127.0.0.1:${port}/v1/pricing?address=${encodeURIComponent('28 Annie Street Hamilton QLD 4007')}`).then(r => r.json());
  assert.equal(payloadTwo.cache.status, 'hit');

  const withoutPostcode = await fetch(`http://127.0.0.1:${port}/v1/pricing?address=${encodeURIComponent('28 Annie Street Hamilton QLD')}`);
  assert.equal(withoutPostcode.status, 200);
  const withoutPostcodePayload = await withoutPostcode.json();
  assert.equal(withoutPostcodePayload.propertyMatch.quality, 'exact');
  assert.equal(withoutPostcodePayload.marketEstimate.mid, 2_500_000);

  const missing = await fetch(`http://127.0.0.1:${port}/v1/pricing?address=${encodeURIComponent('99 Missing Street Brisbane QLD 4000')}`);
  assert.equal(missing.status, 404);
});

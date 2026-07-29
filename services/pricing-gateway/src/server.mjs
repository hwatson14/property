import http from 'node:http';
import { URL } from 'node:url';
import { DomainPricingProvider } from './domain-provider.mjs';
import { FixturePricingProvider } from './fixture-provider.mjs';
import { PRICING_SCHEMA_VERSION } from './normalise.mjs';

const PORT = Number(process.env.PORT || 8787);
const PROVIDER_NAME = String(process.env.PRICING_PROVIDER || 'domain').toLowerCase();
const CACHE_TTL_MS = Number(process.env.PRICING_CACHE_TTL_SECONDS || 21600) * 1000;
const ALLOWED_ORIGINS = String(process.env.ALLOWED_ORIGINS || 'https://hwatson14.github.io,http://127.0.0.1:8000,http://localhost:8000')
  .split(',').map(value => value.trim()).filter(Boolean);
const cache = new Map();

function makeProvider() {
  if (PROVIDER_NAME === 'fixture') return new FixturePricingProvider();
  if (PROVIDER_NAME !== 'domain') throw new Error(`Unsupported PRICING_PROVIDER: ${PROVIDER_NAME}`);
  return new DomainPricingProvider({
    clientId: process.env.DOMAIN_CLIENT_ID,
    clientSecret: process.env.DOMAIN_CLIENT_SECRET,
    scopes: process.env.DOMAIN_SCOPES || 'api_properties_read api_listings_read',
  });
}

let provider;
let providerError = null;
try { provider = makeProvider(); } catch (error) { providerError = error; }

function corsHeaders(request) {
  const origin = request.headers.origin || '';
  const allowed = ALLOWED_ORIGINS.includes('*') || ALLOWED_ORIGINS.includes(origin);
  return {
    'Access-Control-Allow-Origin': allowed ? origin || ALLOWED_ORIGINS[0] || '*' : 'null',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Accept,Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function send(request, response, status, payload, extraHeaders = {}) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...corsHeaders(request),
    ...extraHeaders,
  });
  response.end(JSON.stringify(payload));
}

function cacheKey(address) {
  return String(address || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

async function pricing(address, refresh = false) {
  const key = cacheKey(address);
  const cached = cache.get(key);
  if (!refresh && cached && Date.now() - cached.storedAt < CACHE_TTL_MS) {
    return { ...cached.value, cache: { status: 'hit', storedAt: new Date(cached.storedAt).toISOString(), ttlSeconds: Math.round(CACHE_TTL_MS / 1000) } };
  }
  if (!provider) throw providerError || new Error('Pricing provider is not configured');
  const value = await provider.pricing(address);
  const storedAt = Date.now();
  cache.set(key, { storedAt, value });
  return { ...value, cache: { status: 'miss', storedAt: new Date(storedAt).toISOString(), ttlSeconds: Math.round(CACHE_TTL_MS / 1000) } };
}

export function createServer() {
  return http.createServer(async (request, response) => {
    const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
    if (request.method === 'OPTIONS') return send(request, response, 204, null);
    if (request.method !== 'GET') return send(request, response, 405, { error: 'method_not_allowed' });

    if (url.pathname === '/health') {
      return send(request, response, provider ? 200 : 503, {
        status: provider ? 'ok' : 'not_configured',
        provider: PROVIDER_NAME,
        schemaVersion: PRICING_SCHEMA_VERSION,
        error: providerError?.message || null,
      });
    }

    if (url.pathname === '/v1/pricing') {
      const address = String(url.searchParams.get('address') || '').trim();
      if (address.length < 8 || address.length > 250) return send(request, response, 400, { error: 'invalid_address', message: 'A complete property address is required.' });
      try {
        const payload = await pricing(address, url.searchParams.get('refresh') === 'true');
        return send(request, response, 200, payload);
      } catch (error) {
        const notConfigured = /required|not configured|unsupported pricing_provider/i.test(error.message || '');
        const notFound = /could not resolve|not found/i.test(error.message || '');
        return send(request, response, notConfigured ? 503 : notFound ? 404 : 502, {
          error: notConfigured ? 'provider_not_configured' : notFound ? 'property_not_found' : 'provider_failure',
          message: error.message || 'Pricing provider request failed.',
          schemaVersion: PRICING_SCHEMA_VERSION,
        });
      }
    }

    return send(request, response, 404, { error: 'not_found' });
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  createServer().listen(PORT, '0.0.0.0', () => {
    console.log(`LemonCheck pricing gateway listening on ${PORT} with provider ${PROVIDER_NAME}`);
  });
}

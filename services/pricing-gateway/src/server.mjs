import http from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { URL } from 'node:url';
import { DomainPricingProvider } from './domain-provider.mjs';
import { FixturePricingProvider } from './fixture-provider.mjs';
import { PRICING_SCHEMA_VERSION } from './normalise.mjs';

const PORT = Number(process.env.PORT || 8787);
const PROVIDER_NAME = String(process.env.PRICING_PROVIDER || 'domain').toLowerCase();
const CACHE_TTL_MS = Math.max(60, Number(process.env.PRICING_CACHE_TTL_SECONDS || 21600)) * 1000;
const MAX_CACHE_ENTRIES = Math.max(10, Number(process.env.PRICING_MAX_CACHE_ENTRIES || 1000));
const RATE_LIMIT_PER_MINUTE = Math.max(1, Number(process.env.PRICING_RATE_LIMIT_PER_MINUTE || 30));
const REQUEST_TIMEOUT_MS = Math.max(1000, Number(process.env.PRICING_PROVIDER_TIMEOUT_MS || 10000));
const PROVIDER_MAX_RETRIES = Math.max(0, Math.min(4, Number(process.env.PRICING_PROVIDER_MAX_RETRIES || 2)));
const REFRESH_TOKEN = String(process.env.PRICING_REFRESH_TOKEN || '');
const ALLOWED_ORIGINS = String(process.env.ALLOWED_ORIGINS || 'https://hwatson14.github.io,http://127.0.0.1:8000,http://localhost:8000')
  .split(',').map(value => value.trim()).filter(Boolean);
const startedAt = Date.now();
const cache = new Map();
const pending = new Map();
const rateBuckets = new Map();
let requestCounter = 0;

function makeProvider() {
  if (PROVIDER_NAME === 'fixture') return new FixturePricingProvider();
  if (PROVIDER_NAME !== 'domain') throw new Error(`Unsupported PRICING_PROVIDER: ${PROVIDER_NAME}`);
  return new DomainPricingProvider({
    clientId: process.env.DOMAIN_CLIENT_ID,
    clientSecret: process.env.DOMAIN_CLIENT_SECRET,
    scopes: process.env.DOMAIN_SCOPES || 'api_properties_read api_listings_read',
    requestTimeoutMs: REQUEST_TIMEOUT_MS,
    maxRetries: PROVIDER_MAX_RETRIES,
  });
}

let provider;
let providerError = null;
try { provider = makeProvider(); } catch (error) { providerError = error; }

function requestId(request) {
  const supplied = String(request.headers['x-request-id'] || '');
  return /^[a-zA-Z0-9._:-]{8,100}$/.test(supplied) ? supplied : randomUUID();
}

function clientAddress(request) {
  const forwarded = String(request.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || request.socket.remoteAddress || 'unknown';
}

function fingerprint(value) {
  return createHash('sha256').update(String(value || '').toLowerCase()).digest('hex').slice(0, 16);
}

function log(event, fields = {}) {
  process.stdout.write(`${JSON.stringify({ timestamp: new Date().toISOString(), service: 'lemoncheck-pricing-gateway', event, ...fields })}\n`);
}

function allowedOrigin(request) {
  const origin = String(request.headers.origin || '');
  if (!origin) return { origin: null, allowed: true };
  return { origin, allowed: ALLOWED_ORIGINS.includes('*') || ALLOWED_ORIGINS.includes(origin) };
}

function corsHeaders(request) {
  const { origin, allowed } = allowedOrigin(request);
  const headers = { Vary: 'Origin' };
  if (origin && allowed) headers['Access-Control-Allow-Origin'] = origin;
  headers['Access-Control-Allow-Methods'] = 'GET,OPTIONS';
  headers['Access-Control-Allow-Headers'] = 'Accept,Content-Type,X-Request-ID,X-Pricing-Refresh-Token';
  headers['Access-Control-Max-Age'] = '86400';
  return headers;
}

function send(request, response, status, payload, extraHeaders = {}, id = requestId(request)) {
  response.writeHead(status, {
    ...(status === 204 ? {} : { 'Content-Type': 'application/json; charset=utf-8' }),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Request-ID': id,
    ...corsHeaders(request),
    ...extraHeaders,
  });
  response.end(status === 204 ? undefined : JSON.stringify(payload));
}

function cacheKey(address) {
  return String(address || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function trimCache() {
  while (cache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey === undefined) break;
    cache.delete(oldestKey);
  }
}

function rateLimit(request) {
  const now = Date.now();
  const key = clientAddress(request);
  let bucket = rateBuckets.get(key);
  if (!bucket || now >= bucket.resetAt) bucket = { count: 0, resetAt: now + 60_000 };
  bucket.count += 1;
  rateBuckets.set(key, bucket);
  requestCounter += 1;
  if (requestCounter % 250 === 0) {
    for (const [bucketKey, value] of rateBuckets) if (now >= value.resetAt) rateBuckets.delete(bucketKey);
  }
  return {
    allowed: bucket.count <= RATE_LIMIT_PER_MINUTE,
    limit: RATE_LIMIT_PER_MINUTE,
    remaining: Math.max(0, RATE_LIMIT_PER_MINUTE - bucket.count),
    resetSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  };
}

function rateHeaders(rate) {
  return {
    'X-RateLimit-Limit': String(rate.limit),
    'X-RateLimit-Remaining': String(rate.remaining),
    'X-RateLimit-Reset': String(rate.resetSeconds),
  };
}

function refreshAuthorised(request, url) {
  if (url.searchParams.get('refresh') !== 'true') return false;
  if (!REFRESH_TOKEN) return false;
  return String(request.headers['x-pricing-refresh-token'] || '') === REFRESH_TOKEN;
}

async function pricing(address, refresh = false) {
  const key = cacheKey(address);
  const cached = cache.get(key);
  if (!refresh && cached && Date.now() - cached.storedAt < CACHE_TTL_MS) {
    cache.delete(key);
    cache.set(key, cached);
    return { ...cached.value, cache: { status: 'hit', storedAt: new Date(cached.storedAt).toISOString(), ttlSeconds: Math.round(CACHE_TTL_MS / 1000) } };
  }
  if (!provider) throw providerError || new Error('Pricing provider is not configured');
  if (!refresh && pending.has(key)) return pending.get(key);

  const operation = provider.pricing(address)
    .then(value => {
      const storedAt = Date.now();
      cache.set(key, { storedAt, value });
      trimCache();
      return { ...value, cache: { status: 'miss', storedAt: new Date(storedAt).toISOString(), ttlSeconds: Math.round(CACHE_TTL_MS / 1000) } };
    })
    .finally(() => pending.delete(key));
  pending.set(key, operation);
  return operation;
}

function classifyError(error) {
  const message = String(error?.message || '');
  if (/required|not configured|unsupported pricing_provider/i.test(message)) return { status: 503, code: 'provider_not_configured' };
  if (/multiple postcode candidates|ambiguous/i.test(message)) return { status: 409, code: 'property_match_ambiguous' };
  if (/could not resolve|not found/i.test(message)) return { status: 404, code: 'property_not_found' };
  if (error?.code === 'provider_timeout' || error?.status === 504) return { status: 504, code: 'provider_timeout' };
  if (error?.status === 429) return { status: 503, code: 'provider_rate_limited' };
  return { status: 502, code: 'provider_failure' };
}

export function createServer() {
  return http.createServer(async (request, response) => {
    const id = requestId(request);
    const started = Date.now();
    const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
    const originState = allowedOrigin(request);

    if (!originState.allowed) {
      log('request_rejected_origin', { requestId: id, origin: fingerprint(originState.origin), path: url.pathname });
      return send(request, response, 403, { error: 'origin_not_allowed', requestId: id }, {}, id);
    }
    if (request.method === 'OPTIONS') return send(request, response, 204, null, {}, id);
    if (request.method !== 'GET') return send(request, response, 405, { error: 'method_not_allowed', requestId: id }, {}, id);

    if (url.pathname === '/health') {
      return send(request, response, provider ? 200 : 503, {
        status: provider ? 'ok' : 'not_configured',
        provider: PROVIDER_NAME,
        schemaVersion: PRICING_SCHEMA_VERSION,
        uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
        cacheEntries: cache.size,
        pendingRequests: pending.size,
        providerTimeoutMs: REQUEST_TIMEOUT_MS,
        providerMaxRetries: PROVIDER_MAX_RETRIES,
        error: providerError?.message || null,
      }, {}, id);
    }

    const rate = rateLimit(request);
    const headers = rateHeaders(rate);
    if (!rate.allowed) {
      log('request_rate_limited', { requestId: id, path: url.pathname, client: fingerprint(clientAddress(request)) });
      return send(request, response, 429, { error: 'rate_limit_exceeded', retryAfterSeconds: rate.resetSeconds, requestId: id }, { ...headers, 'Retry-After': String(rate.resetSeconds) }, id);
    }

    if (url.pathname === '/v1/pricing') {
      const address = String(url.searchParams.get('address') || '').trim();
      if (address.length < 8 || address.length > 250) return send(request, response, 400, { error: 'invalid_address', message: 'A complete property address is required.', requestId: id }, headers, id);
      const addressFingerprint = fingerprint(address);
      try {
        const payload = await pricing(address, refreshAuthorised(request, url));
        log('pricing_success', { requestId: id, address: addressFingerprint, status: payload.status, cache: payload.cache?.status, durationMs: Date.now() - started });
        return send(request, response, 200, { ...payload, requestId: id }, headers, id);
      } catch (error) {
        const classification = classifyError(error);
        log('pricing_failure', { requestId: id, address: addressFingerprint, code: classification.code, providerStatus: error?.status || null, durationMs: Date.now() - started });
        return send(request, response, classification.status, {
          error: classification.code,
          message: error.message || 'Pricing provider request failed.',
          schemaVersion: PRICING_SCHEMA_VERSION,
          requestId: id,
        }, headers, id);
      }
    }

    return send(request, response, 404, { error: 'not_found', requestId: id }, headers, id);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const server = createServer();
  server.listen(PORT, '0.0.0.0', () => {
    log('service_started', { port: PORT, provider: PROVIDER_NAME, schemaVersion: PRICING_SCHEMA_VERSION });
  });
  const shutdown = (signal) => {
    log('service_stopping', { signal });
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

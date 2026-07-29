export const PRICING_SCHEMA_VERSION = 'LC-PRICE-v0.1.0';

export function normaliseAddress(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\b(street)\b/g, 'st')
    .replace(/\b(road)\b/g, 'rd')
    .replace(/\b(avenue)\b/g, 'ave')
    .replace(/\b(parade)\b/g, 'pde')
    .replace(/\b(crescent)\b/g, 'cres')
    .replace(/\b(terrace)\b/g, 'tce')
    .replace(/\b(queensland)\b/g, 'qld')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function moneyNumber(token) {
  if (!token) return null;
  const clean = String(token).toLowerCase().replace(/a\$|\$|,/g, '').trim();
  const match = clean.match(/^([0-9]+(?:\.[0-9]+)?)\s*(m|million|k)?$/i);
  if (!match) return null;
  let value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  if (match[2] === 'm' || match[2] === 'million') value *= 1_000_000;
  if (match[2] === 'k') value *= 1_000;
  return Math.round(value);
}

export function parseDisplayPrice(displayPrice) {
  const raw = String(displayPrice || '').trim();
  if (!raw) return { raw, numeric: false, strategy: 'missing', low: null, mid: null, high: null };
  const lowerText = raw.toLowerCase();
  const strategy = /auction/.test(lowerText) ? 'auction'
    : /contact|enquire|call agent|price on application|poa/.test(lowerText) ? 'contact_agent'
    : /offers?\s+over|from\s+\$/.test(lowerText) ? 'offers_over'
    : /offers?\s+around|guide|price guide/.test(lowerText) ? 'guide'
    : /-/g.test(raw) ? 'range'
    : 'fixed_or_unspecified';

  const tokens = [...raw.matchAll(/(?:A\$|\$)?\s*([0-9][0-9,.]*(?:\.[0-9]+)?\s*(?:m|million|k)?)/gi)]
    .map(match => moneyNumber(match[1]))
    .filter(value => Number.isFinite(value) && value >= 20_000 && value <= 500_000_000);
  if (!tokens.length) return { raw, numeric: false, strategy, low: null, mid: null, high: null };
  const low = Math.min(...tokens);
  const high = Math.max(...tokens);
  const mid = strategy === 'offers_over' ? low : Math.round((low + high) / 2);
  return { raw, numeric: true, strategy, low, mid, high };
}

export function exactAddressMatch(requested, candidates) {
  const target = normaliseAddress(requested);
  const scored = (candidates || []).map(candidate => {
    const address = candidate.address || candidate.displayAddress || '';
    const normalised = normaliseAddress(address);
    const exact = normalised === target;
    const containment = normalised.includes(target) || target.includes(normalised);
    const providerScore = Number(candidate.relativeScore || 0);
    return { candidate, exact, score: exact ? 10_000 : containment ? 5_000 + providerScore : providerScore };
  }).sort((a, b) => b.score - a.score);
  return scored[0] || null;
}

function cleanAmount(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 20_000 && number <= 500_000_000 ? Math.round(number) : null;
}

export function buildPricingResponse({ requestedAddress, propertyMatch, property, estimate, listing, provider = 'domain' }) {
  const listingPrice = parseDisplayPrice(listing?.priceDetails?.displayPrice || listing?.priceDetails?.price || '');
  const lower = cleanAmount(estimate?.lowerPrice);
  const mid = cleanAmount(estimate?.midPrice);
  const upper = cleanAmount(estimate?.upperPrice);
  const sales = Array.isArray(property?.history?.sales) ? property.history.sales : [];
  const saleHistory = sales
    .filter(sale => !sale.suppressDetails)
    .map(sale => ({
      date: sale.date || null,
      price: sale.suppressPrice ? null : cleanAmount(sale.price),
      type: sale.type || null,
      documentedAsSold: Boolean(sale.documentedAsSold),
      reportedAsSold: Boolean(sale.reportedAsSold),
      daysOnMarket: Number.isFinite(Number(sale.daysOnMarket)) ? Number(sale.daysOnMarket) : null,
    }))
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
    .slice(0, 10);

  const matchedAddress = propertyMatch?.address || property?.address || null;
  const matchQuality = propertyMatch?.exact ? 'exact' : propertyMatch ? 'best_available' : 'unresolved';
  const estimateAvailable = [lower, mid, upper].some(Number.isFinite);
  const listingAvailable = Boolean(listing);
  const status = estimateAvailable && listingAvailable ? 'complete' : estimateAvailable || listingAvailable || saleHistory.length ? 'partial' : 'unavailable';

  return {
    schemaVersion: PRICING_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    status,
    requestedAddress,
    propertyMatch: {
      provider,
      propertyId: propertyMatch?.id || property?.id || null,
      address: matchedAddress,
      quality: matchQuality,
      relativeScore: Number.isFinite(Number(propertyMatch?.relativeScore)) ? Number(propertyMatch.relativeScore) : null,
    },
    listing: {
      status: listingAvailable ? String(listing.status || 'available') : 'not_found',
      listingId: listing?.id || null,
      listingType: listing?.listingType || listing?.objective || null,
      saleMode: listing?.saleMode || null,
      displayPrice: listingPrice.raw || null,
      price: listingPrice,
      dateUpdated: listing?.dateUpdated || listing?.dateListed || null,
      url: listing?.seoUrl || listing?.listingSlug || null,
    },
    marketEstimate: {
      available: estimateAvailable,
      low: lower,
      mid,
      high: upper,
      confidence: estimate?.priceConfidence || null,
      asOf: estimate?.date || null,
    },
    saleHistory,
    sources: [
      {
        provider: 'Domain',
        kind: 'property_match',
        authority: 'commercial_provider',
        limitation: 'Domain property identifiers and records are subject to the licensed API plan and attribution requirements.',
      },
      {
        provider: 'Domain',
        kind: 'market_estimate',
        authority: 'commercial_avm',
        limitation: 'An automated valuation estimate is not a professional valuation and may be unavailable or inaccurate for unusual properties.',
      },
      {
        provider: 'Domain',
        kind: 'listing_price',
        authority: 'advertised_listing',
        limitation: 'Display price is the agent or vendor marketing position, not evidence of market value or a guaranteed sale price.',
      },
    ],
  };
}

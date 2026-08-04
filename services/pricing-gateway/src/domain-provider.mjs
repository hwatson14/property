import { buildPricingResponse, exactAddressMatch, normaliseAddress } from './normalise.mjs';

const AUTH_URL = 'https://auth.domain.com.au/v1/connect/token';
const API_BASE = 'https://api.domain.com.au';

function listingAddress(listing) {
  const details = listing?.propertyDetails || {};
  const parts = listing?.addressParts || details?.addressParts || {};
  if (parts.displayAddress) return parts.displayAddress;
  if (details.displayableAddress) return details.displayableAddress;
  if (details.displayAddress) return details.displayAddress;
  const streetNumber = parts.streetNumber || details.streetNumber || '';
  const street = parts.street || details.street || '';
  const suburb = parts.suburb || details.suburb || '';
  const state = parts.stateAbbreviation || details.state || '';
  const postcode = parts.postcode || details.postcode || '';
  return `${streetNumber} ${street}, ${suburb} ${state} ${postcode}`.replace(/\s+/g, ' ').trim();
}

function listingObject(item) {
  return item?.listing || item?.propertyListing || item || null;
}

export class DomainPricingProvider {
  constructor({ clientId, clientSecret, fetchImpl = fetch, apiBase = API_BASE, authUrl = AUTH_URL, scopes = 'api_properties_read api_listings_read' } = {}) {
    if (!clientId || !clientSecret) throw new Error('DOMAIN_CLIENT_ID and DOMAIN_CLIENT_SECRET are required');
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.fetch = fetchImpl;
    this.apiBase = apiBase.replace(/\/$/, '');
    this.authUrl = authUrl;
    this.scopes = scopes;
    this.token = null;
    this.tokenExpiresAt = 0;
  }

  async accessToken() {
    if (this.token && Date.now() < this.tokenExpiresAt - 60_000) return this.token;
    const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    const body = new URLSearchParams({ grant_type: 'client_credentials', scope: this.scopes });
    const response = await this.fetch(this.authUrl, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.access_token) {
      const detail = payload.error_description || payload.error || `HTTP ${response.status}`;
      throw new Error(`Domain authentication failed: ${detail}`);
    }
    this.token = payload.access_token;
    this.tokenExpiresAt = Date.now() + (Number(payload.expires_in || 3600) * 1000);
    return this.token;
  }

  async request(path, options = {}) {
    const token = await this.accessToken();
    const response = await this.fetch(`${this.apiBase}${path}`, {
      ...options,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {}),
      },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = payload.message || payload.error || `HTTP ${response.status}`;
      const error = new Error(`Domain API request failed for ${path}: ${message}`);
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  async suggest(address) {
    const query = new URLSearchParams({ terms: address, channel: 'Residential', pageSize: '10' });
    const candidates = await this.request(`/v1/properties/_suggest?${query}`);
    const best = exactAddressMatch(address, Array.isArray(candidates) ? candidates : []);
    if (best?.ambiguous) throw new Error(`Domain returned multiple postcode candidates for ${address}`);
    if (!best?.candidate?.id) throw new Error(`Domain could not resolve a property ID for ${address}`);
    return { ...best.candidate, exact: best.exact };
  }

  async property(propertyId) {
    return this.request(`/v1/properties/${encodeURIComponent(propertyId)}`);
  }

  async estimate(propertyId) {
    try {
      return await this.request(`/v1/properties/${encodeURIComponent(propertyId)}/priceEstimate`);
    } catch (error) {
      if ([404, 422].includes(error.status)) return null;
      throw error;
    }
  }

  async listingFor(propertyMatch, property) {
    const components = propertyMatch.addressComponents || {};
    const suburb = components.suburb || '';
    const state = components.state || 'QLD';
    const postCode = components.postCode || components.postcode || '';
    if (!suburb) return null;
    const query = new URLSearchParams({ pageSize: '200' });
    const results = await this.request(`/v1/listings/residential/_search?${query}`, {
      method: 'POST',
      body: JSON.stringify({
        listingType: 'Sale',
        locations: [{ state, suburb, postCode, includeSurroundingSuburbs: false }],
      }),
    });
    const target = normaliseAddress(propertyMatch.address || property?.address || '');
    const listings = (Array.isArray(results) ? results : []).map(listingObject).filter(Boolean);
    const exact = listings.find(listing => normaliseAddress(listingAddress(listing)) === target);
    if (exact) return exact;
    const propertyId = String(propertyMatch.id || property?.id || '');
    return listings.find(listing => String(listing.propertyId || listing.propertyDetails?.propertyId || '') === propertyId) || null;
  }

  async pricing(address) {
    const propertyMatch = await this.suggest(address);
    const [property, estimate] = await Promise.all([
      this.property(propertyMatch.id),
      this.estimate(propertyMatch.id),
    ]);
    const listing = await this.listingFor(propertyMatch, property);
    return buildPricingResponse({ requestedAddress: address, propertyMatch, property, estimate, listing, provider: 'domain' });
  }
}

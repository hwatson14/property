import { buildPricingResponse, exactAddressMatch } from './normalise.mjs';

const FIXTURES = [
  {
    address: '28 Annie Street Hamilton QLD 4007',
    id: 'DOMAIN-FIXTURE-ANNIE',
    relativeScore: 100,
    addressComponents: { streetNumber: '28', streetName: 'Annie', streetTypeLong: 'Street', suburb: 'Hamilton', state: 'QLD', postCode: '4007' },
    property: {
      id: 'DOMAIN-FIXTURE-ANNIE',
      address: '28 Annie Street Hamilton QLD 4007',
      history: { sales: [{ date: '2020-02-01', price: 1800000, type: 'Private Treaty - Sold', documentedAsSold: true, suppressDetails: false, suppressPrice: false }] },
    },
    estimate: { lowerPrice: 2350000, midPrice: 2500000, upperPrice: 2700000, priceConfidence: 'medium', date: '2026-07-29' },
    listing: { id: 100001, status: 'live', listingType: 'Sale', saleMode: 'privateTreaty', dateUpdated: '2026-07-29', priceDetails: { displayPrice: 'Offers over $2.4m' }, addressParts: { displayAddress: '28 Annie Street Hamilton QLD 4007' }, seoUrl: 'https://example.invalid/annie' },
  },
  {
    address: '1 William Street Brisbane City QLD 4000',
    id: 'DOMAIN-FIXTURE-WILLIAM',
    relativeScore: 100,
    addressComponents: { streetNumber: '1', streetName: 'William', streetTypeLong: 'Street', suburb: 'Brisbane City', state: 'QLD', postCode: '4000' },
    property: {
      id: 'DOMAIN-FIXTURE-WILLIAM',
      address: '1 William Street Brisbane City QLD 4000',
      history: { sales: [{ date: '2021-06-01', price: 3200000, type: 'Private Treaty - Sold', documentedAsSold: true, suppressDetails: false, suppressPrice: false }] },
    },
    estimate: { lowerPrice: 3400000, midPrice: 3600000, upperPrice: 3900000, priceConfidence: 'low', date: '2026-07-29' },
    listing: { id: 100002, status: 'live', listingType: 'Sale', saleMode: 'auction', dateUpdated: '2026-07-29', priceDetails: { displayPrice: 'Auction' }, addressParts: { displayAddress: '1 William Street Brisbane City QLD 4000' }, seoUrl: 'https://example.invalid/william' },
  },
];

export class FixturePricingProvider {
  async pricing(address) {
    const match = exactAddressMatch(address, FIXTURES);
    if (!match?.candidate || !match.exact) throw new Error(`Fixture pricing not found for ${address}`);
    const fixture = match.candidate;
    return buildPricingResponse({
      requestedAddress: address,
      propertyMatch: { ...fixture, exact: true },
      property: fixture.property,
      estimate: fixture.estimate,
      listing: fixture.listing,
      provider: 'fixture',
    });
  }
}

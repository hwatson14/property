# LemonCheck Automated Pricing Gateway

Version: `LC-PRICE-v0.1.0`

This service keeps commercial property-data credentials off the public GitHub Pages client. It resolves an address through Domain, retrieves the Domain property record and price estimate, checks for an exact current sale listing, and returns one versioned pricing record.

## Pricing semantics

The gateway never merges these into one unlabeled value:

| Field | Meaning |
|---|---|
| `listing.displayPrice` | Agent/vendor marketing text such as `Offers over $1.35m` or `Auction` |
| `listing.price` | Parsed listing-price range where the marketing text contains a number |
| `marketEstimate` | Commercial provider AVM low/mid/high range |
| `saleHistory` | Historical sale evidence returned for the matched property |
| statutory land value | Not currently returned; must remain separate from market value when added |

A listing price is not market value. An AVM is not a professional valuation. `Auction`, `Contact Agent`, and similar text remain non-numeric.

## Domain configuration

1. Create a Domain Developer project.
2. Create an OAuth client using Client Credentials.
3. Request/add API access providing these scopes:
   - `api_properties_read`
   - `api_listings_read`
4. Configure `DOMAIN_CLIENT_ID` and `DOMAIN_CLIENT_SECRET` only on the server.
5. Do not place either credential in the LemonCheck static site, browser storage, repository, or build output.

The provider calls:

1. `POST https://auth.domain.com.au/v1/connect/token`
2. `GET /v1/properties/_suggest`
3. `GET /v1/properties/{propertyId}`
4. `GET /v1/properties/{propertyId}/priceEstimate`
5. `POST /v1/listings/residential/_search`

The exact address match is verified before price data is accepted.

## Run locally

```bash
cd services/pricing-gateway
cp .env.example .env
# export the variables from .env using your preferred tool
node src/server.mjs
```

Health check:

```bash
curl http://127.0.0.1:8787/health
```

Pricing request:

```bash
curl --get http://127.0.0.1:8787/v1/pricing \
  --data-urlencode "address=28 Annie Street Hamilton QLD 4007"
```

## Deterministic test mode

Test mode exercises the full HTTP and browser contract without implying that fixture values are live evidence:

```bash
PRICING_PROVIDER=fixture node src/server.mjs
```

Fixture results carry `authority: test_only` and must never be displayed as live pricing.

## Tests

```bash
npm test
```

The tests cover:

- exact address matching versus misleading partial results;
- OAuth token reuse;
- AVM normalisation;
- current-listing matching;
- sale-history retention;
- price strings and ranges;
- non-numeric auction/contact-agent results;
- partial pricing responses;
- cache behaviour;
- fixture provenance.

## Production deployment

Build with the included Dockerfile and deploy the container to a service capable of storing secrets, such as Render, Cloud Run, Fly.io, Azure Container Apps, or AWS App Runner.

Required production controls before public use:

- confirm Domain package access, price, quota, attribution, storage and redistribution rights;
- restrict CORS to the LemonCheck domains;
- add request-level rate limiting and abuse controls;
- persist pricing snapshots and source timestamps outside process memory;
- add structured monitoring and alerts;
- validate at least 20 Brisbane houses, including off-market, auction, multi-lot, recently sold and unusual properties;
- display Domain-required attribution and disclaimers in the client;
- never substitute statutory land value for market estimate.

# LemonCheck Automated Pricing Pipeline

**Version:** 0.1  
**Date:** 2026-07-30  
**Status:** Proposed architecture implemented and contract-tested; live provider credentials pending

## Locked product requirement

Pricing must be pulled automatically. A user-entered estimate must not be presented as LemonCheck's market value.

## Pricing values remain separate

| Kind | Definition | Permitted Deal Score use |
|---|---|---|
| `listing_price` | Current agent/vendor marketing position | Candidate purchase price only when numerically stated |
| `market_estimate` | Licensed provider automated valuation range | Candidate base-value evidence, with confidence and range disclosed |
| `sale_history` | Historical sale records for the matched property | Evidence and context, not automatically today's value |
| `comparable_sale` | Recent similar-property transaction | Future valuation model input |
| `statutory_land_value` | Queensland statutory value of land | Information only; never a substitute for market value |

## Source discovery outcome

### Rejected as production dependencies

Automated browser probes tested direct and no-key bridge access to public property pages. The tested portals either blocked automated access or did not expose a stable, reusable data contract. This route was rejected because it would be brittle, difficult to licence, and unsafe for a paid product.

The Queensland public land-valuation page was also tested. It is suitable as a user-facing statutory-land-value source, but the tested page workflow did not expose a stable market-price API. Statutory land value would not solve the market-value requirement in any event.

### Selected first provider adapter

Domain is the first adapter because its official developer platform documents:

- OAuth client-credentials authentication;
- address/property suggestions;
- property details and sale history;
- property price estimates;
- current residential listing search and listing price details.

The implementation is provider-neutral. PropTrack, Cotality or another licensed provider can be added without changing the LemonCheck client contract.

## Implemented service

`services/pricing-gateway` provides:

- `GET /health`
- `GET /v1/pricing?address=...`
- exact-address matching before pricing is accepted;
- server-side OAuth token caching;
- Domain property, AVM, listing and sale-history adapters;
- explicit partial/unavailable responses;
- display-price parsing that preserves auction/contact-agent semantics;
- response caching;
- restricted CORS;
- Docker packaging;
- deterministic fixture mode for tests only.

Schema version: `LC-PRICE-v0.1.0`.

## Required Domain access

1. Create a Domain Developer project.
2. Create a Client Credentials OAuth client.
3. Add API packages/scopes sufficient for:
   - `api_properties_read`
   - `api_listings_read`
4. Store the client ID and secret only in the deployed pricing service.
5. Confirm commercial pricing, quotas, attribution, caching, storage and redistribution rights before a paid pilot.

Official references:

- https://developer.domain.com.au/docs/v1/authentication/oauth/client-credentials-grant/
- https://developer.domain.com.au/docs/v1/apis/pkg_property/references/properties_suggest/
- https://developer.domain.com.au/docs/v1/apis/pkg_properties_locations/references/properties_get/
- https://developer.domain.com.au/docs/v1/apis/pkg_price_estimation/references/properties_getpriceestimate/
- https://developer.domain.com.au/docs/latest/apis/pkg_property/references/listings_detailedresidentialsearch/

## Deal Score policy

Deal Score may be calculated automatically only when:

1. the property match is sufficiently strong;
2. a current automated market estimate is available;
3. a purchase price exists, from a numerical listing price or the user's intended offer;
4. every amount retains source, date and limitations.

When a listing says `Auction`, `Contact Agent`, `POA` or equivalent, LemonCheck must preserve that text and request an intended offer rather than inventing a number.

A candidate calculation for later approval is:

`risk-adjusted value = AVM midpoint - known costs - uncertainty allowance`

`deal gap = risk-adjusted value - purchase price`

The uncertainty allowance and score mapping remain proposals and require calibration. They are not part of the provider gateway.

## Deployment boundary

The GitHub Pages client cannot safely hold provider credentials. The gateway must be deployed to a server or managed container platform. The only blockers to live automated pricing are:

- provider account and approved API access;
- deployed secret-bearing gateway URL;
- final provider attribution and usage-policy review.

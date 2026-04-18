# Brisbane Land Value Pipeline MVP

This repo was effectively empty when this tranche started. The initial implementation is intentionally minimal and uses a single Python entrypoint to avoid file sprawl while proving the end-to-end workflow.

## What it does

`property_pipeline.py` runs a 4-stage pipeline:

1. collect current realestate.com.au listings under a configurable max price
2. extract address, explicit asking price, property type, site area, and any apartment-count clues
3. proxy-score the candidates and keep the top shortlist
4. hit the official Queensland valuation search for exact land value, then rank the final output by official dollar land value

For scheme assets the script first tries the full unit address, then the stripped building address. Queensland states that units are not valued separately, so the building/body-corporate level valuation is the relevant target.

## Current repo footprint

- `property_pipeline.py` - single-file MVP pipeline
- `requirements.txt` - runtime dependency

## Runtime setup

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
playwright install chromium
```

## Run

```bash
python property_pipeline.py --max-price 800000 --top-proxy 25 --top-final 10 --max-pages 12 --out-dir out
```

Useful flags:

- `--max-price` price cap, default `800000`
- `--top-proxy` proxy shortlist size before official valuation hits
- `--top-final` final ranked output size
- `--max-pages` number of search result pages to scan
- `--headless` run browser headless
- `--trace-network` write a simple network request log for discovery/debugging

## Output files

The script writes:

- `out/candidates.csv`
- `out/proxy_shortlist.csv`
- `out/official_verified.csv`
- `out/top10.csv`
- `out/rejections.csv`
- `out/run_log.md`

## Important caveats

This is an MVP. The official Queensland valuation flow is JavaScript-driven and may need one live selector-tuning pass in a normal runtime. The extraction code is label-based rather than position-based, but it still depends on the current shape of the public page.

Specific caveats:

- listing collection currently targets `realestate.com.au`
- Brisbane filtering is enforced at the official valuation stage using the returned local government field
- apartment counts are inferred from listing text only in this tranche
- unresolved apartment counts are excluded from the final ranked output

## Intended next tranche

1. prove one standalone, one boutique unit block, and one tower end-to-end
2. harden official valuation extraction with a discovery pass and stable selectors/endpoints
3. add a stronger apartment-count resolver
4. add suburb-level proxy signals if needed

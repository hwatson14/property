#!/usr/bin/env python3
"""Brisbane property land-value pipeline.

This script builds a candidate pool of current listings under a configurable price
cap, narrows them with a proxy score, then hits Queensland's official valuation
search for exact land values. Apartments are normalized by a resolved apartment
count when the count can be inferred from listing text.

Source of truth for final ranking:
- Queensland official valuation search
- For scheme assets, the script first tries the building address in the same
  official search. Queensland states units are not valued separately, so the
  building/body-corporate level valuation is the relevant target.

This file is intentionally single-file to keep the initial repo footprint small.
Selectors for official Queensland pages may need one live tuning pass.
"""

from __future__ import annotations

import argparse
import csv
import json
import logging
import math
import re
import sys
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Iterable, Optional
from urllib.parse import urljoin

from playwright.sync_api import Browser, BrowserContext, Page, TimeoutError, sync_playwright

LOG = logging.getLogger("property_pipeline")

REA_URL_TEMPLATE = (
    "https://www.realestate.com.au/buy/in-{region}/list-{page}?"
    "activeSort=price-asc&maxPrice={max_price}"
)
QLD_VALUATION_URL = "https://www.qld.gov.au/environment/land/title/valuation/find-your-land-valuation"

EXPLICIT_PRICE_PATTERNS = [
    re.compile(r"\$\s?([\d,]+)(?!\s*per)", re.I),
    re.compile(r"offers?\s+(?:over|above|from)\s*\$\s?([\d,]+)", re.I),
    re.compile(r"best offer over\s*\$\s?([\d,]+)", re.I),
    re.compile(r"guide\s*\$\s?([\d,]+)", re.I),
    re.compile(r"price guide\s*\$\s?([\d,]+)", re.I),
    re.compile(r"\$\s?([\d,]+)\s*(?:to|-|–)\s*\$\s?([\d,]+)", re.I),
]

NON_EXPLICIT_PRICE_MARKERS = [
    "auction",
    "contact agent",
    "for sale",
    "for sale by negotiation",
    "negotiation",
    "eoi",
    "expressions of interest",
    "submit offers",
    "price on application",
    "poa",
    "under contract",
    "under offer",
]

APARTMENT_COUNT_PATTERNS = [
    re.compile(r"complex of\s+(\d+)", re.I),
    re.compile(r"block of\s+(\d+)", re.I),
    re.compile(r"one of only\s+(\d+)", re.I),
    re.compile(r"only\s+(\d+)\s+(?:units|apartments|residences|townhomes|townhouses)", re.I),
    re.compile(r"boutique\s+(?:complex|block|building)\s+of\s+(\d+)", re.I),
    re.compile(r"small complex of\s+(\d+)", re.I),
]

VALUATION_FIELDS = {
    "current_value": re.compile(r"Current\s+value\s*:?\s*\$?\s*([\d,]+)", re.I),
    "new_value": re.compile(r"New\s+value\s*:?\s*\$?\s*([\d,]+)", re.I),
    "valuation_date": re.compile(r"Valuation\s+date\s*:?\s*([^\n]+)", re.I),
    "property_id": re.compile(r"Property\s+ID\s*:?\s*([^\n]+)", re.I),
    "local_government": re.compile(r"Local\s+government\s*:?\s*([^\n]+)", re.I),
    "area_size": re.compile(r"Area\s+size\s*:?\s*([^\n]+)", re.I),
    "valuation_methodology": re.compile(r"Valuation\s+methodology\s*:?\s*([^\n]+)", re.I),
    "real_property_description": re.compile(r"Real\s+property\s+description\s*:?\s*([^\n]+)", re.I),
}

PROPERTY_TYPE_FACTORS = {
    "house": 1.25,
    "residential land": 1.30,
    "land": 1.30,
    "townhouse": 0.95,
    "villa": 0.95,
    "unit": 1.00,
    "apartment": 1.00,
    "duplex": 0.90,
    "acreage": 0.70,
}


@dataclass
class ListingRecord:
    listing_url: str
    source: str
    address_raw: str = ""
    address_normalized: str = ""
    building_address: str = ""
    unit_number: str = ""
    suburb: str = ""
    postcode: str = ""
    property_type: str = ""
    ask_price_text: str = ""
    ask_price_value: Optional[int] = None
    explicit_price: bool = False
    site_area_sqm: Optional[float] = None
    apartment_count: Optional[int] = None
    apartment_count_source: str = ""
    description_excerpt: str = ""
    proxy_score: float = 0.0
    notes: list[str] = field(default_factory=list)


@dataclass
class OfficialValuation:
    query_address: str
    current_value: Optional[int] = None
    new_value: Optional[int] = None
    valuation_date: str = ""
    property_id: str = ""
    local_government: str = ""
    area_size: str = ""
    valuation_methodology: str = ""
    real_property_description: str = ""
    source_url: str = QLD_VALUATION_URL
    success: bool = False
    raw_excerpt: str = ""


@dataclass
class FinalRow:
    rank: int
    address: str
    ask_price: int
    address_land_value: int
    qty_apartments: int
    apartment_land_value: float
    valuation_date: str
    property_id: str
    valuation_methodology: str
    link: str
    notes: str


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Brisbane land-value pipeline")
    parser.add_argument("--max-price", type=int, default=800000, help="Maximum ask price")
    parser.add_argument("--top-proxy", type=int, default=25, help="Number of proxy shortlisted listings")
    parser.add_argument("--top-final", type=int, default=10, help="Final ranked output size")
    parser.add_argument("--max-pages", type=int, default=12, help="Number of listing search pages to scan")
    parser.add_argument("--region", default="brisbane-greater_region-qld-5700", help="REA region slug")
    parser.add_argument("--headless", action="store_true", help="Run Playwright headless")
    parser.add_argument("--out-dir", default="out", help="Output directory")
    parser.add_argument("--trace-network", action="store_true", help="Write network request log")
    parser.add_argument("--log-level", default="INFO", help="Logging level")
    return parser.parse_args()


def setup_logging(level: str) -> None:
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format="%(asctime)s | %(levelname)s | %(message)s",
    )


def ensure_dir(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path


def clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "")).strip()


def normalize_address(address: str) -> str:
    address = clean_text(address)
    address = address.replace(" Qld ", " QLD ").replace(" Queensland ", " QLD ")
    address = re.sub(r"\bUnit\b", "", address, flags=re.I)
    address = re.sub(r"\s+", " ", address).strip(" ,")
    return address


def split_unit_and_building_address(address: str) -> tuple[str, str]:
    address = normalize_address(address)
    match = re.match(r"^(\d+[A-Za-z]?)[/\\-](.+)$", address)
    if match:
        return match.group(1), clean_text(match.group(2))
    match = re.match(r"^(?:Apartment|Apt|Unit|U)\s*(\d+[A-Za-z]?)\s+(.+)$", address, re.I)
    if match:
        return match.group(1), clean_text(match.group(2))
    return "", address


def parse_money_value(text: str) -> Optional[int]:
    if not text:
        return None
    text = clean_text(text)
    for marker in NON_EXPLICIT_PRICE_MARKERS:
        if marker in text.lower() and "$" not in text:
            return None
    for pattern in EXPLICIT_PRICE_PATTERNS:
        match = pattern.search(text)
        if not match:
            continue
        if len(match.groups()) == 2 and match.group(2):
            a = int(match.group(1).replace(",", ""))
            b = int(match.group(2).replace(",", ""))
            return min(a, b)
        return int(match.group(1).replace(",", ""))
    return None


def is_explicit_price(text: str) -> bool:
    return parse_money_value(text) is not None


def infer_property_type(text: str) -> str:
    lowered = text.lower()
    for token in [
        "residential land",
        "townhouse",
        "apartment",
        "unit",
        "villa",
        "duplex",
        "house",
        "acreage",
        "land",
    ]:
        if token in lowered:
            return token
    return "unknown"


def extract_site_area_sqm(text: str) -> Optional[float]:
    candidates: list[float] = []
    for match in re.finditer(r"(\d[\d,]*)\s*m²", text, re.I):
        value = float(match.group(1).replace(",", ""))
        if 20 <= value <= 50000:
            candidates.append(value)
    for match in re.finditer(r"(\d+(?:\.\d+)?)\s*acres?", text, re.I):
        acres = float(match.group(1))
        sqm = acres * 4046.8564224
        if 20 <= sqm <= 500000:
            candidates.append(sqm)
    if not candidates:
        return None
    return max(candidates)


def resolve_apartment_count(text: str) -> tuple[Optional[int], str]:
    for pattern in APARTMENT_COUNT_PATTERNS:
        match = pattern.search(text)
        if match:
            return int(match.group(1)), pattern.pattern
    return None, ""


def extract_json_ld(page: Page) -> list[dict]:
    payloads: list[dict] = []
    scripts = page.locator("script[type='application/ld+json']")
    for i in range(scripts.count()):
        raw = scripts.nth(i).text_content() or ""
        raw = raw.strip()
        if not raw:
            continue
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                payloads.extend(x for x in parsed if isinstance(x, dict))
            elif isinstance(parsed, dict):
                payloads.append(parsed)
        except json.JSONDecodeError:
            continue
    return payloads


def extract_address_from_ld(payloads: Iterable[dict]) -> str:
    for payload in payloads:
        address = payload.get("address")
        if isinstance(address, dict):
            parts = [
                address.get("streetAddress"),
                address.get("addressLocality"),
                address.get("addressRegion"),
                address.get("postalCode"),
            ]
            value = clean_text(", ".join(str(x) for x in parts if x))
            if value:
                return value
    return ""


def extract_property_type_from_ld(payloads: Iterable[dict]) -> str:
    for payload in payloads:
        for key in ("additionalType", "@type", "category"):
            value = payload.get(key)
            if isinstance(value, str) and value:
                guess = infer_property_type(value)
                if guess != "unknown":
                    return guess
    return ""


def extract_candidate_urls(page: Page) -> list[str]:
    hrefs = page.eval_on_selector_all("a[href]", "els => els.map(e => e.href)")
    urls = []
    seen = set()
    for href in hrefs:
        if not href:
            continue
        if "/property-" not in href:
            continue
        href = href.split("?")[0]
        if href in seen:
            continue
        seen.add(href)
        urls.append(href)
    return urls


def safe_first_text(page: Page, selectors: list[str]) -> str:
    for selector in selectors:
        locator = page.locator(selector)
        if locator.count() == 0:
            continue
        try:
            text = clean_text(locator.first.inner_text(timeout=1000))
            if text:
                return text
        except Exception:
            continue
    return ""


def extract_listing_record(page: Page, url: str, max_price: int) -> Optional[ListingRecord]:
    LOG.info("Extract listing detail: %s", url)
    try:
        page.goto(url, wait_until="domcontentloaded", timeout=45000)
        page.wait_for_timeout(1000)
    except TimeoutError:
        LOG.warning("Timeout on listing %s", url)
        return None

    body_text = clean_text(page.locator("body").inner_text())
    payloads = extract_json_ld(page)
    address = extract_address_from_ld(payloads)
    if not address:
        address = safe_first_text(page, ["h1", "[data-testid='listing-details__summary-title']", "main h1"])
    address = normalize_address(address)
    unit_number, building_address = split_unit_and_building_address(address)

    price_text = safe_first_text(
        page,
        [
            "[data-testid='listing-details__summary-title'] + div",
            "[data-testid='listing-details__summary-price']",
            "main",
        ],
    )
    if not price_text:
        price_text = body_text[:1000]

    ask_price = parse_money_value(price_text)
    explicit = ask_price is not None and ask_price <= max_price

    prop_type = extract_property_type_from_ld(payloads) or infer_property_type(body_text)
    site_area_sqm = extract_site_area_sqm(body_text)
    apartment_count, apartment_count_source = resolve_apartment_count(body_text)

    suburb_match = re.search(r",\s*([^,]+),\s*QLD\s*(\d{4})", address)
    suburb = suburb_match.group(1) if suburb_match else ""
    postcode = suburb_match.group(2) if suburb_match else ""

    description_excerpt = body_text[:800]
    record = ListingRecord(
        listing_url=url,
        source="realestate.com.au",
        address_raw=address,
        address_normalized=address,
        building_address=building_address,
        unit_number=unit_number,
        suburb=suburb,
        postcode=postcode,
        property_type=prop_type,
        ask_price_text=clean_text(price_text)[:250],
        ask_price_value=ask_price,
        explicit_price=explicit,
        site_area_sqm=site_area_sqm,
        apartment_count=apartment_count,
        apartment_count_source=apartment_count_source,
        description_excerpt=description_excerpt,
    )
    if not explicit:
        record.notes.append("price_not_explicit_or_over_cap")
    if site_area_sqm is None:
        record.notes.append("site_area_missing")
    if prop_type in {"apartment", "unit", "townhouse", "villa", "duplex"} and apartment_count is None:
        record.notes.append("apartment_count_unresolved")
    return record


def build_proxy_score(record: ListingRecord, max_price: int) -> float:
    price_value = record.ask_price_value or max_price
    type_factor = PROPERTY_TYPE_FACTORS.get(record.property_type, 1.0)
    site_area = record.site_area_sqm or 0.0
    denom = record.apartment_count or 1
    site_share = site_area / denom if site_area else 0.0
    boutique_bonus = 1.0
    if record.apartment_count:
        if record.apartment_count <= 6:
            boutique_bonus = 1.35
        elif record.apartment_count <= 12:
            boutique_bonus = 1.15
        elif record.apartment_count >= 50:
            boutique_bonus = 0.70
        elif record.apartment_count >= 200:
            boutique_bonus = 0.45
    old_stock_bonus = 1.0
    lowered = record.description_excerpt.lower()
    if any(token in lowered for token in ["walk-up", "solid brick", "post-war", "1970", "1960", "197", "198"]):
        old_stock_bonus = 1.10
    explicit_price_bonus = 1.0 if record.explicit_price else 0.25
    price_efficiency = max(0.25, 1.10 - (price_value / max_price) * 0.25)
    base = math.log1p(max(site_share, site_area, 1.0))
    score = base * type_factor * boutique_bonus * old_stock_bonus * explicit_price_bonus * price_efficiency
    return round(score, 4)


def configure_network_trace(context: BrowserContext, out_dir: Path) -> None:
    log_path = out_dir / "network.log"

    def handle_request(request) -> None:
        try:
            with log_path.open("a", encoding="utf-8") as fh:
                fh.write(f"{request.method} {request.url}\n")
        except Exception:
            return

    context.on("request", handle_request)


def first_visible_locator(page: Page, selectors: list[str]):
    for selector in selectors:
        locator = page.locator(selector)
        try:
            if locator.count() and locator.first.is_visible():
                return locator.first
        except Exception:
            continue
    return None


def parse_official_valuation_from_text(text: str, query_address: str) -> OfficialValuation:
    result = OfficialValuation(query_address=query_address, raw_excerpt=text[:2000])
    for field_name, pattern in VALUATION_FIELDS.items():
        match = pattern.search(text)
        if not match:
            continue
        value = clean_text(match.group(1))
        if field_name in {"current_value", "new_value"}:
            setattr(result, field_name, int(value.replace(",", "")))
        else:
            setattr(result, field_name, value)
    result.success = result.current_value is not None
    return result


def search_official_valuation(page: Page, address: str) -> OfficialValuation:
    LOG.info("Official valuation lookup: %s", address)
    page.goto(QLD_VALUATION_URL, wait_until="domcontentloaded", timeout=45000)
    page.wait_for_timeout(1500)

    input_locator = first_visible_locator(
        page,
        [
            "input[type='search']",
            "input[placeholder*='address' i]",
            "input[aria-label*='address' i]",
            "input[type='text']",
        ],
    )
    if input_locator is None:
        raise RuntimeError("Could not locate official valuation search input")

    input_locator.click()
    input_locator.fill(address)
    page.wait_for_timeout(500)

    search_button = first_visible_locator(
        page,
        [
            "button:has-text('Search')",
            "button:has-text('Find')",
            "input[type='submit']",
        ],
    )
    if search_button is not None:
        search_button.click()
    else:
        input_locator.press("Enter")

    page.wait_for_timeout(2500)
    body_text = clean_text(page.locator("body").inner_text())
    result = parse_official_valuation_from_text(body_text, query_address=address)
    if not result.success and "Property ID" not in body_text and "Current value" not in body_text:
        result.raw_excerpt = body_text[:2000]
    return result


def lookup_valuation_for_listing(page: Page, record: ListingRecord) -> OfficialValuation:
    query_order = []
    if record.address_normalized:
        query_order.append(record.address_normalized)
    if record.building_address and record.building_address not in query_order:
        query_order.append(record.building_address)

    last = OfficialValuation(query_address=record.address_normalized)
    for address in query_order:
        try:
            current = search_official_valuation(page, address)
        except Exception as exc:
            LOG.warning("Valuation lookup failed for %s: %s", address, exc)
            last = OfficialValuation(query_address=address, raw_excerpt=str(exc), success=False)
            continue
        if current.success:
            return current
        last = current
    return last


def write_csv(path: Path, rows: list[dict]) -> None:
    if not rows:
        path.write_text("", encoding="utf-8")
        return
    with path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)


def collect_listing_urls(page: Page, region: str, max_price: int, max_pages: int) -> list[str]:
    urls: list[str] = []
    seen = set()
    for page_number in range(1, max_pages + 1):
        search_url = REA_URL_TEMPLATE.format(region=region, page=page_number, max_price=max_price)
        LOG.info("Search page %s", search_url)
        try:
            page.goto(search_url, wait_until="domcontentloaded", timeout=45000)
            page.wait_for_timeout(1500)
        except TimeoutError:
            LOG.warning("Timeout on search page %s", search_url)
            continue
        page_urls = extract_candidate_urls(page)
        if not page_urls:
            LOG.info("No listing urls on page %s", page_number)
            break
        new_count = 0
        for url in page_urls:
            if url in seen:
                continue
            seen.add(url)
            urls.append(url)
            new_count += 1
        LOG.info("Collected %s new urls from page %s", new_count, page_number)
    return urls


def make_final_rows(records: list[ListingRecord], valuations: dict[str, OfficialValuation], top_final: int) -> list[FinalRow]:
    rows: list[FinalRow] = []
    for record in records:
        valuation = valuations.get(record.listing_url)
        if not valuation or not valuation.success or valuation.current_value is None:
            continue
        qty = record.apartment_count or 1
        if record.property_type in {"apartment", "unit", "townhouse", "villa", "duplex"} and record.apartment_count is None:
            continue
        apartment_value = valuation.current_value / qty
        rows.append(
            FinalRow(
                rank=0,
                address=record.address_normalized,
                ask_price=record.ask_price_value or 0,
                address_land_value=valuation.current_value,
                qty_apartments=qty,
                apartment_land_value=round(apartment_value, 2),
                valuation_date=valuation.valuation_date,
                property_id=valuation.property_id,
                valuation_methodology=valuation.valuation_methodology,
                link=record.listing_url,
                notes="; ".join(record.notes),
            )
        )
    rows.sort(key=lambda row: (row.apartment_land_value, row.address_land_value, -row.ask_price), reverse=True)
    for idx, row in enumerate(rows[:top_final], start=1):
        row.rank = idx
    return rows[:top_final]


def run_pipeline(args: argparse.Namespace) -> int:
    out_dir = ensure_dir(Path(args.out_dir))
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=args.headless)
        context = browser.new_context(viewport={"width": 1440, "height": 2200})
        if args.trace_network:
            configure_network_trace(context, out_dir)
        search_page = context.new_page()
        detail_page = context.new_page()
        valuation_page = context.new_page()

        urls = collect_listing_urls(search_page, args.region, args.max_price, args.max_pages)
        if not urls:
            LOG.error("No listing URLs collected")
            return 1

        candidates: list[ListingRecord] = []
        for url in urls:
            record = extract_listing_record(detail_page, url, args.max_price)
            if record is None:
                continue
            if not record.explicit_price:
                continue
            record.proxy_score = build_proxy_score(record, args.max_price)
            candidates.append(record)

        candidates.sort(key=lambda r: r.proxy_score, reverse=True)
        shortlisted = candidates[: args.top_proxy]

        valuations: dict[str, OfficialValuation] = {}
        rejected_rows: list[dict] = []
        for record in shortlisted:
            valuation = lookup_valuation_for_listing(valuation_page, record)
            valuations[record.listing_url] = valuation
            if not valuation.success:
                rejected_rows.append(
                    {
                        "listing_url": record.listing_url,
                        "address": record.address_normalized,
                        "reason": "official_value_not_found",
                        "query_address": valuation.query_address,
                        "raw_excerpt": valuation.raw_excerpt[:500],
                    }
                )
            elif valuation.local_government and "brisbane" not in valuation.local_government.lower():
                rejected_rows.append(
                    {
                        "listing_url": record.listing_url,
                        "address": record.address_normalized,
                        "reason": "outside_brisbane_lga",
                        "query_address": valuation.query_address,
                        "local_government": valuation.local_government,
                    }
                )

        final_rows = make_final_rows(shortlisted, valuations, args.top_final)

        write_csv(out_dir / "candidates.csv", [asdict(r) for r in candidates])
        write_csv(out_dir / "proxy_shortlist.csv", [asdict(r) for r in shortlisted])
        write_csv(out_dir / "official_verified.csv", [asdict(v) for v in valuations.values()])
        write_csv(out_dir / "top10.csv", [asdict(r) for r in final_rows])
        write_csv(out_dir / "rejections.csv", rejected_rows)

        run_log = [
            f"max_price={args.max_price}",
            f"max_pages={args.max_pages}",
            f"candidates={len(candidates)}",
            f"shortlisted={len(shortlisted)}",
            f"final_rows={len(final_rows)}",
            "notes:",
            "- official valuation extraction uses label-based parsing and may need one live selector tuning pass",
            "- scheme assets first try the full address, then the stripped building address",
            "- final rows exclude unresolved apartment counts for scheme assets",
        ]
        (out_dir / "run_log.md").write_text("\n".join(run_log) + "\n", encoding="utf-8")

        browser.close()
    return 0


def main() -> int:
    args = parse_args()
    setup_logging(args.log_level)
    try:
        return run_pipeline(args)
    except KeyboardInterrupt:
        LOG.warning("Interrupted")
        return 130


if __name__ == "__main__":
    raise SystemExit(main())

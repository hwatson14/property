#!/usr/bin/env python3
"""Apply the verified Brisbane address-search fix to the assembled browser bundle."""
from __future__ import annotations

import sys
from pathlib import Path

TOKEN_BLOCK_OLD = '''    const query = normaliseSearchText(rawQuery);
    const tokens = query.split(" ").filter((token) => token.length >= 2).slice(0, 8);
    if (!tokens.length) return [];
    const conditions = tokens.map((token) => `UPPER(address) LIKE '%${escSql(token)}%'`);
    conditions.push("UPPER(local_authority) = 'BRISBANE CITY'");
'''

TOKEN_BLOCK_NEW = '''    const query = normaliseSearchText(rawQuery);
    const ignoredTokens = new Set(["QLD", "QUEENSLAND", "AUSTRALIA"]);
    const tokens = query
      .split(" ")
      .filter((token) => !ignoredTokens.has(token) && !/^\\d{4}$/.test(token))
      .filter((token) => token.length >= 2 || /^\\d+[A-Z]?$/.test(token))
      .slice(0, 8);
    if (!tokens.length) return [];
    const conditions = tokens.map((token) => `UPPER(address) LIKE '%${escSql(token)}%'`);
'''

FILTER_BLOCK_OLD = '''      const pid = attrs.address_pid || attrs.ADDRESS_PID;
      const address = attrs.address || attrs.ADDRESS;
      if (!pid || !address) continue;
'''

FILTER_BLOCK_NEW = '''      const pid = attrs.address_pid || attrs.ADDRESS_PID;
      const address = attrs.address || attrs.ADDRESS;
      const localAuthority = attrs.local_authority || attrs.LOCAL_AUTHORITY || "";
      if (!pid || !address || !/BRISBANE/i.test(localAuthority)) continue;
'''


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"Expected one {label} block; found {count}.")
    return text.replace(old, new, 1)


def main(path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    text = replace_once(text, TOKEN_BLOCK_OLD, TOKEN_BLOCK_NEW, "token parsing")
    text = replace_once(text, FILTER_BLOCK_OLD, FILTER_BLOCK_NEW, "Brisbane result filtering")
    path.write_text(text, encoding="utf-8")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: patch-live-search.py PATH_TO_LIVE_PROPERTY_JS")
    main(Path(sys.argv[1]))

#!/usr/bin/env python3
"""Replace the fixture-only address adapter with the live browser data layer."""
from __future__ import annotations

import re
import sys
from pathlib import Path

FIXTURE_BLOCK = re.compile(
    r'''<script>\(\(\) => \{\n  "use strict";\n  const base = "";\n  const fixture = \{.*?window\.PROPERTY_CHECK_STATIC_DEMO = true;\n\}\)\(\);\n</script>''',
    re.DOTALL,
)
REPLACEMENT = '<script src="./live-property.js"></script>'


def build(source: Path, destination: Path) -> None:
    html = source.read_text(encoding="utf-8")
    output, count = FIXTURE_BLOCK.subn(REPLACEMENT, html, count=1)
    if count != 1:
        raise SystemExit(f"Expected one fixture adapter in {source}; replaced {count}.")
    if "PROPERTY_CHECK_STATIC_DEMO = true" in output:
        raise SystemExit("Fixture-only adapter remains after build.")
    if REPLACEMENT not in output:
        raise SystemExit("Live data layer reference was not inserted.")
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(output, encoding="utf-8")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("Usage: build-live-site.py SOURCE_HTML OUTPUT_HTML")
    build(Path(sys.argv[1]), Path(sys.argv[2]))

#!/usr/bin/env python3
from __future__ import annotations

import argparse
import base64
import gzip
import hashlib
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent
INDEX_SHA256 = "cc3561dda4bda26473747f7f90a47f6145dd196166b6e8ff9442d0a0ab118faa"
LIVE_SHA256 = "2f2f5b3150023412efa8c7b957090700b6d12b74ec81c6b252257a817d19afad"

CSS_ASSETS = [
    "enhancements.css",
    "decision-layer.css",
    "decision-governance.css",
    "shortlist.css",
    "ux-simplification.css",
    "full-report-preview.css",
    "ux-overhaul.css",
    "ux-overhaul-detail.css",
]
JS_ASSETS = [
    "enhancements.js",
    "map-initial-state.js",
    "decision-layer-guard.js",
    "decision-layer.js",
    "decision-governance.js",
    "shortlist.js",
    "ux-simplification.js",
    "full-report-preview.js",
    "ux-overhaul.js",
    "ux-overhaul-sync.js",
]
COPY_ASSETS = ["favicon.svg", *CSS_ASSETS, *JS_ASSETS]


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def build(output: Path) -> None:
    if output.exists():
        shutil.rmtree(output)
    output.mkdir(parents=True)

    chunks = []
    for path in sorted(ROOT.glob("index.parts/part-0[0-4].b64.part")):
        chunks.append(path.read_text(encoding="utf-8"))
    for path in sorted(ROOT.glob("index.parts/part-05.fragments/*.b64.part")):
        chunks.append(path.read_text(encoding="utf-8"))
    chunks.append((ROOT / "index.parts/part-06.b64.part").read_text(encoding="utf-8"))
    encoded = "".join(chunks).replace("\n", "").replace("\r", "")
    index_path = output / "index.html"
    index_path.write_bytes(gzip.decompress(base64.b64decode(encoded)))
    if sha256(index_path) != INDEX_SHA256:
        raise RuntimeError("Base index integrity check failed")

    live_path = output / "live-property.js"
    live_path.write_text(
        "".join(path.read_text(encoding="utf-8") for path in sorted(ROOT.glob("live-property.parts/*.js.part"))),
        encoding="utf-8",
    )
    subprocess.run(["python3", str(ROOT / "patch-live-search.py"), str(live_path)], check=True)
    if sha256(live_path) != LIVE_SHA256:
        raise RuntimeError("Live property bundle integrity check failed")

    for name in COPY_ASSETS:
        shutil.copy2(ROOT / name, output / name)

    html = index_path.read_text(encoding="utf-8")
    head = "\n".join(
        ["  <link rel=\"icon\" type=\"image/svg+xml\" href=\"./favicon.svg\">"]
        + [f"  <link rel=\"stylesheet\" href=\"./{name}\">" for name in CSS_ASSETS]
    )
    scripts = "\n".join(f"  <script src=\"./{name}\"></script>" for name in JS_ASSETS)
    html = html.replace("</head>", f"{head}\n</head>", 1)
    html = html.replace("</body>", f"{scripts}\n</body>", 1)
    index_path.write_text(html, encoding="utf-8")
    (output / ".nojekyll").touch()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("output", nargs="?", default=".pages-site")
    args = parser.parse_args()
    build(Path(args.output).resolve())
    print(f"Built LemonCheck static site at {Path(args.output).resolve()}")

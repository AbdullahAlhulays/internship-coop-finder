#!/usr/bin/env python3
"""Read the site's existing cards out of src/data/companies.js into
plain Python dicts, so dedupe.py can compare against them.

The obvious approach -- regex the JS file apart in Python -- is a bad
idea: it breaks on trailing commas, nested brackets inside strings,
comments, template literals, and any style change to the file. So
instead this hands the file to Node and asks it to do the parsing,
because Node is the authority on what a .js file means. Node prints
JSON, Python reads JSON. No JS parser reimplemented in Python, and
no way for the two to disagree about the file's contents.

This is READ-only. Writing still goes through publish.py's targeted
string edits -- deliberately never a read-parse-rewrite cycle, which
would reformat the whole file and produce an unreviewable diff.
"""

from __future__ import annotations

import json
import subprocess
import tempfile
from pathlib import Path

from _console import use_utf8_stdout

use_utf8_stdout()

NODE_TIMEOUT = 20


class ReadCompaniesError(RuntimeError):
    """The file couldn't be read as a list of cards. Never falls back
    to "assume empty" -- an empty list would make dedupe think nothing
    is published yet and re-add every card on the site."""


_LOADER = """\
import * as mod from {url};
const arr = mod.companies ?? mod.default;
if (!Array.isArray(arr)) {{
  throw new Error(
    "expected companies.js to export an array (as `companies` or as the default export), got " +
    (arr === undefined ? "neither export" : typeof arr)
  );
}}
process.stdout.write(JSON.stringify(arr));
"""


def read_companies(path: str | Path) -> list[dict]:
    """Return the site's cards as a list of dicts, in file order."""
    js_path = Path(path)
    if not js_path.exists():
        raise ReadCompaniesError(f"{js_path} does not exist")

    script = _LOADER.format(url=json.dumps(js_path.resolve().as_uri()))
    with tempfile.NamedTemporaryFile("w", suffix=".mjs", delete=False, encoding="utf-8") as f:
        f.write(script)
        loader_path = f.name

    try:
        result = subprocess.run(
            ["node", loader_path],
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=NODE_TIMEOUT,
        )
    except FileNotFoundError as exc:
        raise ReadCompaniesError(
            "node isn't installed or isn't on PATH -- it's needed to read companies.js. "
            "Install Node from nodejs.org."
        ) from exc
    finally:
        Path(loader_path).unlink(missing_ok=True)

    if result.returncode != 0:
        raise ReadCompaniesError(f"node couldn't read {js_path}:\n{result.stderr.strip()}")

    try:
        cards = json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        raise ReadCompaniesError(f"node's output wasn't valid JSON: {exc}") from exc

    for i, card in enumerate(cards):
        if not isinstance(card, dict):
            raise ReadCompaniesError(f"entry {i} is a {type(card).__name__}, expected an object")
        if not card.get("applicationLink"):
            raise ReadCompaniesError(
                f"entry {i} ({card.get('name', 'unnamed')!r}) has no applicationLink -- "
                "that's the field dedupe matches on, so this must be fixed before the agent runs"
            )
    return cards


def main() -> int:
    import argparse

    parser = argparse.ArgumentParser(description="Print the site's cards as JSON.")
    parser.add_argument("path", help="path to src/data/companies.js")
    parser.add_argument("--count", action="store_true", help="just print how many cards there are")
    args = parser.parse_args()

    try:
        cards = read_companies(args.path)
    except ReadCompaniesError as exc:
        print(f"FAILED: {exc}")
        return 1

    if args.count:
        print(f"{len(cards)} cards")
    else:
        print(json.dumps(cards, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
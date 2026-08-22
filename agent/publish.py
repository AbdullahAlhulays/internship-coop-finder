#!/usr/bin/env python3
"""Step 4 (site writer): safely apply an approved decision to the real
site source files -- src/data/companies.js and src/App.jsx.

This is the highest-stakes file operation in the whole pipeline. These
are real source files bundled into the live site, not a JSON payload
-- a malformed edit here doesn't just corrupt one card, it can break
the whole build. Two rules, no exceptions:

  1. Never guess at the file's structure. Every anchor pattern below
     must match EXACTLY ONCE. Zero matches or more than one match ->
     raise PublishError and stop, rather than editing the wrong spot
     or silently corrupting something.
  2. Never let a result out the door without validating it. For
     companies.js that means running the new text through
     `node --check` before it's ever written or committed. For
     App.jsx we don't run a full parse (it's JSX, which plain Node
     can't parse) -- instead the edit is proven safe by construction:
     it only ever swaps the text between two existing quote marks
     with a string built from a fixed, quote-free character set (see
     format_last_updated), so it cannot introduce a syntax error.

NOTE: the anchor patterns below (the raw card-array declaration and
the per-field regexes) mirror the live source layout. Keep the
current-layout regression test and a no-write dry run against the real
companies.js whenever that layout changes.
"""

from __future__ import annotations

import json
import re
import subprocess
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

from dedupe import Decision

RIYADH = timezone(timedelta(hours=3))

MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]


class PublishError(RuntimeError):
    """Something didn't match what we expect closely enough to edit
    safely. Always means: stop, don't guess, tell a human."""


# --------------------------------------------------------- LAST_UPDATED

LAST_UPDATED_PATTERN = re.compile(r'const LAST_UPDATED = "([^"]*)";')


def format_last_updated(dt: datetime) -> str:
    """'August 9, 2026' -- full month name, no leading zero on the
    day, comma, 4-digit year. dt is converted to Saudi Arabia time
    (UTC+03:00) before formatting, per the spec. Only ever produces
    letters, digits, a space, and a comma -- never a character that
    could break out of the surrounding JS string literal."""
    local = dt.astimezone(RIYADH)
    return f"{MONTHS[local.month - 1]} {local.day}, {local.year}"


def bump_last_updated(app_jsx_source: str, today: datetime) -> str:
    """Replace the LAST_UPDATED string in App.jsx with today's date.
    Raises PublishError if the line isn't found exactly once -- e.g.
    if the variable ever gets renamed or the file restructured, this
    must stop and ask rather than silently doing nothing or editing
    the wrong line."""
    matches = list(LAST_UPDATED_PATTERN.finditer(app_jsx_source))
    if len(matches) != 1:
        raise PublishError(
            f"expected exactly one 'const LAST_UPDATED = \"...\";' line in "
            f"App.jsx, found {len(matches)}. Refusing to guess -- check "
            f"the file still matches the expected format."
        )
    new_value = format_last_updated(today)
    match = matches[0]
    return (
        app_jsx_source[: match.start()]
        + f'const LAST_UPDATED = "{new_value}";'
        + app_jsx_source[match.end() :]
    )


# ------------------------------------------------------- companies.js

# The current site keeps editable source cards in `companyRecords` and
# exports a derived `companies` array after filling fallback descriptions.
# Older revisions exported the editable array directly as `companies`.
# Accept either shape, but still require exactly one matching raw array so
# a future refactor cannot make us guess which collection to modify.
ARRAY_START_PATTERN = re.compile(
    r"(?:export\s+)?const\s+(?:companyRecords|companies)\s*=\s*\["
)

_FIELD_ORDER = (
    "name", "location", "applicationLink", "deadline", "type",
    "description", "requiresLetter", "addedAt",
)


def _to_js_literal(value) -> str:
    if value is True:
        return "true"
    if value is False:
        return "false"
    return json.dumps(value, ensure_ascii=False)


def _find_array_bounds(source: str) -> tuple[int, int]:
    """(start, end) character offsets of the array's opening '[' and
    its matching closing ']', found by counting bracket depth -- not
    a greedy regex, which would stop at the wrong ']' the moment any
    string value in the data happens to contain a bracket character."""
    starts = list(ARRAY_START_PATTERN.finditer(source))
    if len(starts) != 1:
        raise PublishError(
            f"expected exactly one editable 'companyRecords = [' or "
            f"'companies = [' declaration, "
            f"found {len(starts)}. Refusing to guess which one is the "
            f"real data array."
        )
    open_bracket = starts[0].end() - 1
    depth = 0
    i = open_bracket
    in_string: str | None = None
    while i < len(source):
        ch = source[i]
        if in_string:
            if ch == "\\":
                i += 2
                continue
            if ch == in_string:
                in_string = None
        elif ch in ("'", '"', "`"):
            in_string = ch
        elif ch == "[":
            depth += 1
        elif ch == "]":
            depth -= 1
            if depth == 0:
                return open_bracket, i
        i += 1
    raise PublishError("array never closes -- unbalanced brackets in companies.js")


def _find_object_bounds(source: str, start: int, end: int, needle: str) -> tuple[int, int]:
    """Within source[start:end], find the single object literal whose
    text contains `needle` (an applicationLink value -- the site's
    real identity for a card) and return its (start, end) offsets,
    by brace-depth counting so nested braces/strings can't fool it."""
    matches = [m.start() for m in re.finditer(re.escape(needle), source[start:end])]
    if len(matches) != 1:
        raise PublishError(
            f"expected exactly one existing card containing {needle!r}, "
            f"found {len(matches)}. Refusing to guess which one to edit."
        )
    needle_pos = start + matches[0]

    depth = 0
    i = needle_pos
    obj_start = None
    while i >= start:
        ch = source[i]
        if ch == "}":
            depth += 1
        elif ch == "{":
            if depth == 0:
                obj_start = i
                break
            depth -= 1
        i -= 1
    if obj_start is None:
        raise PublishError(f"could not find the opening '{{' for the card containing {needle!r}")

    depth = 0
    i = obj_start
    in_string: str | None = None
    while i < end:
        ch = source[i]
        if in_string:
            if ch == "\\":
                i += 2
                continue
            if ch == in_string:
                in_string = None
        elif ch in ("'", '"', "`"):
            in_string = ch
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return obj_start, i + 1
        i += 1
    raise PublishError(f"card object containing {needle!r} never closes")


def _serialize_card(card: dict, indent: str) -> str:
    """Format a card dict as a JS object literal matching the site's
    style: unquoted keys, one field per line, trailing comma. Only
    includes keys actually present in `card` -- to_card() already
    omits empty optional fields; this must not reintroduce them."""
    inner = indent + "  "
    lines = ["{"]
    for key in _FIELD_ORDER:
        if key not in card:
            continue
        lines.append(f"{inner}{key}: {_to_js_literal(card[key])},")
    lines.append(f"{indent}}},")
    return "\n".join(lines)


def _replace_field(obj_text: str, field: str, js_value: str) -> tuple[str, bool]:
    """If `field` already exists on its own line inside obj_text,
    replace only its value (keeping indentation and trailing comma)
    and return (new_text, True). If not found, return (obj_text,
    False) unchanged so the caller can insert it as a new line."""
    pattern = re.compile(rf"^([ \t]*{re.escape(field)}\s*:\s*).+?(,?)\s*$", re.MULTILINE)
    m = pattern.search(obj_text)
    if not m:
        return obj_text, False
    prefix, comma = m.group(1), m.group(2)
    new_line = f"{prefix}{js_value}{comma}"
    return obj_text[: m.start()] + new_line + obj_text[m.end() :], True


def apply_decision(companies_js_source: str, decision: Decision, card: dict) -> str:
    """Apply an already-made dedupe.Decision to companies.js source
    text and return the new file text.

    Never touches applicationLink or name on an update.
    REFRESHABLE_FIELDS in dedupe.py already guarantees decision.changes
    can't contain either -- this is a second, independent guard."""
    if decision.action == "skip":
        raise PublishError("apply_decision called with a 'skip' decision -- nothing to apply")

    array_start, array_end = _find_array_bounds(companies_js_source)

    if decision.action == "add":
        first_entry_match = re.search(r"\n(\s+)\{", companies_js_source[array_start:array_end])
        indent = first_entry_match.group(1) if first_entry_match else "  "
        new_entry = _serialize_card(card, indent)
        return (
            companies_js_source[:array_end]
            + f"\n{indent}"
            + new_entry
            + companies_js_source[array_end:]
        )

    if decision.action == "update":
        if "applicationLink" in decision.changes or "name" in decision.changes:
            raise PublishError("refusing to apply a decision that changes applicationLink or name")
        link = card["applicationLink"]
        obj_start, obj_end = _find_object_bounds(companies_js_source, array_start, array_end, link)
        new_obj_text = companies_js_source[obj_start:obj_end]

        for field, new_value in decision.changes.items():
            js_value = _to_js_literal(new_value)
            new_obj_text, found = _replace_field(new_obj_text, field, js_value)
            if not found:
                brace_end = new_obj_text.index("{") + 1
                indent_match = re.search(r"\n([ \t]+)\S", new_obj_text)
                field_indent = indent_match.group(1) if indent_match else "    "
                new_obj_text = (
                    new_obj_text[:brace_end]
                    + f"\n{field_indent}{field}: {js_value},"
                    + new_obj_text[brace_end:]
                )
            occurrences = len(re.findall(rf"^[ \t]*{re.escape(field)}\s*:", new_obj_text, re.MULTILINE))
            if occurrences != 1:
                raise PublishError(
                    f"after updating {field!r} the card object has {occurrences} lines "
                    f"matching that key instead of exactly 1 -- refusing to write a "
                    f"possibly duplicated field"
                )

        return companies_js_source[:obj_start] + new_obj_text + companies_js_source[obj_end:]

    raise PublishError(f"unknown decision action {decision.action!r}")


# ------------------------------------------------------ JS validation


def validate_js_syntax(source: str) -> None:
    """Confirm `source` is still syntactically valid JavaScript by
    shelling out to `node --check`. Raises PublishError if not. This
    is the last safety net before anything gets written to disk or
    committed -- a broken companies.js would fail the entire site
    build. Written with an .mjs suffix so `export const ...` syntax
    checks correctly (companies.js is an ES module)."""
    with tempfile.NamedTemporaryFile(mode="w", suffix=".mjs", delete=False, encoding="utf-8") as f:
        f.write(source)
        path = f.name
    try:
        result = subprocess.run(
            ["node", "--check", path],
            capture_output=True,
            text=True,
            timeout=15,
        )
    finally:
        Path(path).unlink(missing_ok=True)
    if result.returncode != 0:
        raise PublishError(f"resulting file is not valid JavaScript:\n{result.stderr.strip()}")

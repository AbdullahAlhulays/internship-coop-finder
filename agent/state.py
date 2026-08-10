#!/usr/bin/env python3
"""Small persisted JSON files the pipeline uses to remember things
between runs. GitHub Actions doesn't stay running, and Abood might
not tap a Telegram button for hours, so anything that needs to
survive between "the bot sent a card" and "Abood tapped something"
has to live on disk -- committed to the repo -- not in memory.

Two files, two different jobs:

  state/pending.json   -- candidates currently awaiting a Telegram
                           decision. Written when notify.send_candidate()
                           fires, read + removed when the webhook's
                           GitHub Actions job processes a tap.

  state/published.json -- the dedupe ledger (dedupe.py's `ledger`
                           parameter): which applicationLinks this
                           pipeline has published before, and when, so
                           dedupe.decide() can tell a genuinely newer
                           repost from noise, versus a hand-added card
                           it has no business touching.

Both are plain JSON living in the repo -- free, versioned, readable in
a PR diff like everything else here. Every write is atomic (write to
a temp file, then a single os.replace) so a crash mid-write can never
leave a half-written, corrupted state file behind.
"""

from __future__ import annotations

import json
import os
import tempfile
from dataclasses import asdict
from pathlib import Path

from dedupe import Decision
from extract import Extracted

PENDING_PATH = "state/pending.json"
PUBLISHED_PATH = "state/published.json"
SEEN_PATH = "state/seen.json"


class StateError(RuntimeError):
    """The state file doesn't look like what we expect -- stop rather
    than guess and potentially lose track of a pending candidate."""


def _read_json(path: str | Path) -> dict:
    p = Path(path)
    if not p.exists():
        return {}
    try:
        with p.open(encoding="utf-8") as f:
            data = json.load(f)
    except json.JSONDecodeError as exc:
        raise StateError(f"{path} exists but is not valid JSON -- refusing to guess its contents: {exc}") from exc
    if not isinstance(data, dict):
        raise StateError(f"{path} must contain a JSON object at the top level, found {type(data).__name__}")
    return data


def _write_json_atomic(path: str | Path, data: dict) -> None:
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_path = tempfile.mkstemp(dir=p.parent, prefix=f".{p.name}.", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2, sort_keys=True)
            f.write("\n")
        os.replace(tmp_path, p)  # atomic on both POSIX and Windows
    except BaseException:
        Path(tmp_path).unlink(missing_ok=True)
        raise


def make_candidate_id(channel: str, message_id: int) -> str:
    """One canonical id format, used everywhere: notify.py's
    callback_data, pending.json's keys, and the webhook's lookups.
    Keeping it in one function means it can only drift out of sync
    with itself in one place."""
    return f"{channel.lstrip('@')}:{message_id}"


# ------------------------------------------------------------- pending


def load_pending(path: str | Path = PENDING_PATH) -> dict[str, dict]:
    return _read_json(path)


def add_pending(
    candidate_id: str, extracted: Extracted, post: dict, decision: Decision, path: str | Path = PENDING_PATH
) -> dict[str, dict]:
    """Record a candidate as awaiting a Telegram decision. Stores the
    dedupe.Decision computed at extraction time too -- not just the
    raw extraction -- so approving it later doesn't require re-reading
    and re-parsing companies.js from scratch (there's no JS parser in
    this pipeline, deliberately; publish.py only ever performs small,
    targeted edits, never a full read-and-reconstruct).

    Known tradeoff: if companies.js is hand-edited between when this
    candidate is sent and when Abood approves it, this stored decision
    could go stale (e.g. existing_index pointing at a shifted entry).
    Acceptable given approvals normally happen within hours, but worth
    knowing -- the dry run (see the project plan) should specifically
    check this before it's trusted unattended.

    Refuses to overwrite an existing entry for the same id silently --
    that would normally mean the same post got processed twice in one
    run, itself worth stopping and looking at, not papering over."""
    pending = load_pending(path)
    if candidate_id in pending:
        raise StateError(
            f"{candidate_id!r} is already pending -- refusing to overwrite it "
            f"silently. If this post is genuinely being re-sent, pop the old "
            f"entry first."
        )
    pending[candidate_id] = {"extracted": asdict(extracted), "post": post, "decision": asdict(decision)}
    _write_json_atomic(path, pending)
    return pending


def pop_pending(candidate_id: str, path: str | Path = PENDING_PATH) -> tuple[dict, dict[str, dict]]:
    """Remove and return one pending candidate's record. Raises
    StateError if it's not there -- e.g. a tap on a stale or
    already-handled message -- rather than silently doing nothing,
    which would look to Abood like his tap was simply ignored."""
    pending = load_pending(path)
    if candidate_id not in pending:
        raise StateError(
            f"{candidate_id!r} is not in {path} -- it may already have been "
            f"handled, or the state file was reset. Nothing to apply."
        )
    record = pending.pop(candidate_id)
    _write_json_atomic(path, pending)
    return record, pending


def record_to_extracted(record: dict) -> Extracted:
    """Turn a stored pending record's "extracted" field back into a
    real Extracted -- the one place this reconstruction happens, so
    it can't drift out of sync with itself across callers."""
    return Extracted(**record["extracted"])


def record_to_decision(record: dict) -> Decision:
    """Same, for the stored dedupe.Decision."""
    return Decision(**record["decision"])


# -------------------------------------------------------------- seen


def load_seen(path: str | Path = SEEN_PATH) -> dict[str, list[int]]:
    """{channel: [message_id, ...]} -- every post already processed,
    whatever the outcome (sent for review, skipped as a paid course,
    failed extraction). Without this, an hourly scheduled run would
    re-read the same recent posts and message Abood about each one
    again, every hour."""
    return _read_json(path)


def is_seen(channel: str, message_id: int, seen: dict[str, list[int]]) -> bool:
    return message_id in seen.get(channel.lstrip("@"), [])


def mark_seen(channel: str, message_ids: list[int], path: str | Path = SEEN_PATH) -> dict[str, list[int]]:
    """Record posts as processed. Kept per-channel and sorted so the
    file stays readable in a git diff."""
    seen = load_seen(path)
    key = channel.lstrip("@")
    seen[key] = sorted(set(seen.get(key, [])) | set(message_ids))
    _write_json_atomic(path, seen)
    return seen


# ------------------------------------------------------------ ledger


def load_ledger(path: str | Path = PUBLISHED_PATH) -> dict[str, dict]:
    """What dedupe.decide()'s `ledger` parameter expects directly."""
    return _read_json(path)


def record_published(
    link: str, posted_at: str, message_id: int, channel: str, path: str | Path = PUBLISHED_PATH
) -> dict[str, dict]:
    """Called after publish.py successfully writes a card, so the
    next run's dedupe.decide() knows this pipeline (not a human) is
    the one that published it, and when."""
    from dedupe import ledger_entry

    ledger = load_ledger(path)
    key, entry = ledger_entry(link, posted_at, message_id, channel)
    ledger[key] = entry
    _write_json_atomic(path, ledger)
    return ledger

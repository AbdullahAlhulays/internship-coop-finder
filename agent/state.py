#!/usr/bin/env python3
"""Small persisted JSON files the pipeline uses to remember things
between runs. GitHub Actions doesn't stay running, and Abood might
not tap a Telegram button for hours, so anything that needs to
survive between "the bot sent a card" and "Abood tapped something"
has to live on disk -- committed to the repo -- not in memory.

Three files, three different jobs:

  state/pending.json   -- candidates currently awaiting a Telegram
                           decision. Each new record also carries its
                           durable Telegram delivery state (queued or
                           sent), so an outage cannot strand a saved card.
                           Read + removed when the webhook's GitHub Actions
                           job processes a tap.

  state/published.json -- the dedupe ledger (dedupe.py's `ledger`
                           parameter): which applicationLinks this
                           pipeline has published before, and when, so
                           dedupe.decide() can tell a genuinely newer
                           repost from noise, versus a hand-added card
                           it has no business touching.

  state/seen.json      -- source posts the hourly scanner has already
                           handled, so it never re-extracts the same
                           Telegram message every hour.

All three are plain JSON living in the repo -- free, versioned, readable in
a PR diff like everything else here. Every write is atomic (write to
a temp file, then a single os.replace) so a crash mid-write can never
leave a half-written, corrupted state file behind.
"""

from __future__ import annotations

import json
import os
import tempfile
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path

from dedupe import Decision
from extract import Extracted

PENDING_PATH = "state/pending.json"
PUBLISHED_PATH = "state/published.json"
SEEN_PATH = "state/seen.json"

DELIVERY_QUEUED = "queued"
DELIVERY_SENT = "sent"
DELIVERY_STATUSES = {DELIVERY_QUEUED, DELIVERY_SENT}


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
    candidate_id: str,
    extracted: Extracted,
    post: dict,
    decision: Decision,
    path: str | Path = PENDING_PATH,
    delivery_status: str = DELIVERY_SENT,
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
    if delivery_status not in DELIVERY_STATUSES:
        raise StateError(
            f"invalid delivery status {delivery_status!r} for {candidate_id!r}; "
            f"expected one of {sorted(DELIVERY_STATUSES)}"
        )

    pending = load_pending(path)
    if candidate_id in pending:
        raise StateError(
            f"{candidate_id!r} is already pending -- refusing to overwrite it "
            f"silently. If this post is genuinely being re-sent, pop the old "
            f"entry first."
        )
    delivery = {"status": delivery_status}
    if delivery_status == DELIVERY_QUEUED:
        delivery["queued_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    pending[candidate_id] = {
        "extracted": asdict(extracted),
        "post": post,
        "decision": asdict(decision),
        "delivery": delivery,
    }
    _write_json_atomic(path, pending)
    return pending


def delivery_status_of(record: dict) -> str:
    """Return a pending record's Telegram delivery status.

    Records committed before the self-healing queue existed have no
    ``delivery`` field. They were created by the old send-first workflow,
    so treating them as already sent is the only migration that cannot
    duplicate historical review cards.
    """
    delivery = record.get("delivery")
    if delivery is None:
        return DELIVERY_SENT
    if not isinstance(delivery, dict):
        raise StateError("pending candidate delivery metadata must be an object")
    status = delivery.get("status")
    if status not in DELIVERY_STATUSES:
        raise StateError(
            f"pending candidate has invalid delivery status {status!r}; "
            f"expected one of {sorted(DELIVERY_STATUSES)}"
        )
    return status


def queued_delivery_ids(pending: dict[str, dict]) -> list[str]:
    """The stable, sorted list of cards that still need Telegram."""
    return sorted(
        candidate_id
        for candidate_id, record in pending.items()
        if "creating_step" not in record and delivery_status_of(record) == DELIVERY_QUEUED
    )


def mark_delivery_sent(
    candidate_id: str,
    telegram_message_id: int | None,
    *,
    sent_at: str | None = None,
    path: str | Path = PENDING_PATH,
) -> bool:
    """Persist Telegram's successful response for one candidate.

    Returns False when the candidate was already removed by an approval;
    that is a safe idempotent outcome when replaying receipts after a git
    push collision. A conflicting message id fails closed instead of
    silently hiding a duplicate send.
    """
    if telegram_message_id is not None and (
        isinstance(telegram_message_id, bool) or not isinstance(telegram_message_id, int)
    ):
        raise StateError("telegram_message_id must be an integer or null")
    if sent_at is not None:
        if not isinstance(sent_at, str) or not sent_at:
            raise StateError("sent_at must be a non-empty ISO timestamp or null")
        try:
            parsed_sent_at = datetime.fromisoformat(sent_at)
        except ValueError as exc:
            raise StateError(f"sent_at is not a valid ISO timestamp: {sent_at!r}") from exc
        if parsed_sent_at.tzinfo is None:
            raise StateError("sent_at must include a timezone")

    pending = load_pending(path)
    record = pending.get(candidate_id)
    if record is None:
        return False

    status = delivery_status_of(record)
    existing_delivery = record.get("delivery") or {"status": DELIVERY_SENT}
    if status == DELIVERY_SENT:
        existing_message_id = existing_delivery.get("telegram_message_id")
        if existing_message_id is not None and telegram_message_id is not None and existing_message_id != telegram_message_id:
            raise StateError(
                f"{candidate_id!r} is already recorded as Telegram message "
                f"{existing_message_id}, refusing conflicting receipt {telegram_message_id}"
            )
        return False

    record["delivery"] = {
        "status": DELIVERY_SENT,
        "sent_at": sent_at or datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "telegram_message_id": telegram_message_id,
    }
    _write_json_atomic(path, pending)
    return True


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

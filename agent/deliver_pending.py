#!/usr/bin/env python3
"""Deliver and recover Telegram review cards from durable pending state.

New candidates are committed with ``delivery.status == "queued"`` before
Telegram is called. This command retries queued cards, records successful
Telegram message ids, and leaves failures queued for the next scheduled run.
It can also replay saved receipts after a git push collision without sending
the Telegram message a second time.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

from _console import use_utf8_stdout
from notify import send_candidate
from state import (
    DELIVERY_QUEUED,
    PENDING_PATH,
    StateError,
    delivery_status_of,
    load_pending,
    mark_delivery_sent,
    queued_delivery_ids,
    record_to_extracted,
)

use_utf8_stdout()


class DeliveryError(RuntimeError):
    ...


def _message_id(response: object) -> int | None:
    if response is None:  # test transports may deliberately return nothing
        return None
    if not isinstance(response, dict):
        raise DeliveryError(f"Telegram sender returned {type(response).__name__}, expected an object")
    result = response.get("result")
    message_id = result.get("message_id") if isinstance(result, dict) else None
    if isinstance(message_id, bool) or not isinstance(message_id, int):
        raise DeliveryError("Telegram success response did not contain an integer result.message_id")
    return message_id


def deliver_queued(
    *,
    pending_path: str = PENDING_PATH,
    candidate_ids: list[str] | None = None,
    attempts: int = 3,
    minimum_age_seconds: int = 0,
    now: datetime | None = None,
    send_fn=send_candidate,
    sleep_fn=time.sleep,
    mark_sent_fn=mark_delivery_sent,
) -> tuple[dict, list[dict]]:
    if attempts < 1:
        raise ValueError("attempts must be at least 1")
    if minimum_age_seconds < 0:
        raise ValueError("minimum_age_seconds cannot be negative")

    pending = load_pending(pending_path)
    explicit_ids = set(candidate_ids or [])
    # Explicit ids are owned by this workflow run and may be delivered
    # immediately. Also include every older queued card so an outage from
    # a prior run heals automatically.
    selected = sorted(set(queued_delivery_ids(pending)) | explicit_ids)
    reference_time = now or datetime.now(timezone.utc)
    cutoff = reference_time - timedelta(seconds=minimum_age_seconds)

    summary = {
        "selected": 0,
        "sent": 0,
        "already_sent": 0,
        "missing": 0,
        "too_new": 0,
        "failed": 0,
        "receipt_failed": 0,
    }
    receipts: list[dict] = []

    for candidate_id in selected:
        record = pending.get(candidate_id)
        if record is None:
            summary["missing"] += 1
            print(f"  [missing] {candidate_id}: no longer pending; nothing to deliver")
            continue
        if delivery_status_of(record) != DELIVERY_QUEUED:
            summary["already_sent"] += 1
            print(f"  [sent]    {candidate_id}: receipt already committed")
            continue

        if candidate_id not in explicit_ids and minimum_age_seconds:
            queued_at_raw = record.get("delivery", {}).get("queued_at")
            try:
                queued_at = datetime.fromisoformat(queued_at_raw)
            except (TypeError, ValueError) as exc:
                raise DeliveryError(f"{candidate_id} has invalid delivery.queued_at {queued_at_raw!r}") from exc
            if queued_at.tzinfo is None:
                raise DeliveryError(f"{candidate_id} delivery.queued_at must include a timezone")
            if queued_at > cutoff:
                summary["too_new"] += 1
                print(f"  [wait]    {candidate_id}: queued too recently for recovery")
                continue

        summary["selected"] += 1
        extracted = record_to_extracted(record)
        delivered = False
        response: object = None
        for attempt in range(1, attempts + 1):
            try:
                response = send_fn(extracted, candidate_id, post=record.get("post"))
                delivered = True
                break
            except Exception as exc:
                print(f"  [retry]   {candidate_id}: attempt {attempt}/{attempts} failed: {exc}", file=sys.stderr)
                if attempt < attempts:
                    sleep_fn(attempt * 3)

        if not delivered:
            summary["failed"] += 1
            print(f"  [queued]  {candidate_id}: still queued for the next run", file=sys.stderr)
            continue

        # Telegram has accepted the card. Do not put receipt parsing or
        # local persistence inside the retry loop: retrying after a
        # successful send would create a duplicate message.
        try:
            message_id = _message_id(response)
        except DeliveryError as exc:
            summary["receipt_failed"] += 1
            print(f"  [receipt] {candidate_id}: {exc}; refusing to send it again", file=sys.stderr)
            continue

        sent_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
        receipt = {"candidate_id": candidate_id, "telegram_message_id": message_id, "sent_at": sent_at}
        receipts.append(receipt)
        summary["sent"] += 1
        try:
            mark_sent_fn(candidate_id, message_id, sent_at=sent_at, path=pending_path)
        except Exception as exc:
            # Keep the receipt in the output. The workflow can reset to a
            # fresh git base and replay it without calling Telegram again.
            summary["receipt_failed"] += 1
            print(f"  [receipt] {candidate_id}: local persistence failed: {exc}", file=sys.stderr)
        print(f"  [sent]    {candidate_id}: Telegram message {message_id}")

    return summary, receipts


def apply_receipts(receipts: list[dict], *, pending_path: str = PENDING_PATH) -> dict:
    result = {"applied": 0, "already_applied_or_removed": 0}
    for receipt in receipts:
        if not isinstance(receipt, dict):
            raise DeliveryError("every receipt must be an object")
        candidate_id = receipt.get("candidate_id")
        if not isinstance(candidate_id, str) or not candidate_id:
            raise DeliveryError("receipt candidate_id must be a non-empty string")
        changed = mark_delivery_sent(
            candidate_id,
            receipt.get("telegram_message_id"),
            sent_at=receipt.get("sent_at"),
            path=pending_path,
        )
        result["applied" if changed else "already_applied_or_removed"] += 1
    return result


def _read_receipts(path: str) -> list[dict]:
    try:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise DeliveryError(f"could not read receipts from {path}: {exc}") from exc
    if not isinstance(data, list):
        raise DeliveryError("receipts file must contain a JSON array")
    return data


def main() -> int:
    parser = argparse.ArgumentParser(description="Send queued Telegram review cards and persist delivery receipts.")
    parser.add_argument("--pending", default=PENDING_PATH)
    parser.add_argument("--candidate-id", action="append", dest="candidate_ids")
    parser.add_argument("--attempts", type=int, default=3)
    parser.add_argument("--minimum-age-seconds", type=int, default=0)
    parser.add_argument("--receipts-file")
    parser.add_argument("--summary-file")
    parser.add_argument("--apply-receipts")
    args = parser.parse_args()

    try:
        if args.apply_receipts:
            summary = apply_receipts(_read_receipts(args.apply_receipts), pending_path=args.pending)
            receipts: list[dict] = []
        else:
            summary, receipts = deliver_queued(
                pending_path=args.pending,
                candidate_ids=args.candidate_ids,
                attempts=args.attempts,
                minimum_age_seconds=args.minimum_age_seconds,
            )
        if args.receipts_file:
            Path(args.receipts_file).write_text(json.dumps(receipts, indent=2) + "\n", encoding="utf-8")
        if args.summary_file:
            Path(args.summary_file).write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    except (DeliveryError, StateError, ValueError) as exc:
        print(f"FAILED: {exc}", file=sys.stderr)
        return 1

    print("delivery summary: " + " | ".join(f"{key} {value}" for key, value in summary.items()))
    return 1 if summary.get("failed", 0) or summary.get("receipt_failed", 0) else 0


if __name__ == "__main__":
    raise SystemExit(main())

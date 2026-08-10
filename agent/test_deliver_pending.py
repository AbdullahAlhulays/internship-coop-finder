#!/usr/bin/env python3
"""Offline outage/recovery tests for the durable Telegram outbox."""

from __future__ import annotations

import tempfile
from dataclasses import replace
from datetime import datetime, timezone
from pathlib import Path

from dedupe import Decision
from deliver_pending import apply_receipts, deliver_queued
from extract import Extracted
from state import (
    DELIVERY_QUEUED,
    DELIVERY_SENT,
    add_pending,
    delivery_status_of,
    load_pending,
    pop_pending,
    queued_delivery_ids,
)


checks = 0


def check(label: str, condition: bool) -> None:
    global checks
    if not condition:
        raise AssertionError(label)
    checks += 1
    print(f"  [pass] {label}")


BASE = Extracted(
    is_opportunity=True,
    reason_excluded=None,
    type="coop",
    company="Recovery Test",
    title="CO-OP",
    url="https://example.com/apply/1",
    contact=None,
    requires_letter=False,
    deadline=None,
    deadline_raw=None,
    location="Riyadh, Saudi Arabia",
    confidence=0.95,
    evidence={},
)
DECISION = Decision("add", "new link")


def queue(path: Path, candidate_id: str, number: int) -> None:
    add_pending(
        candidate_id,
        replace(BASE, company=f"Recovery Test {number}", url=f"https://example.com/apply/{number}"),
        {"channel": "SALTRAI", "message_id": number},
        DECISION,
        path=path,
        delivery_status=DELIVERY_QUEUED,
    )


print("sustained Telegram outage: data remains queued")
with tempfile.TemporaryDirectory() as tmp:
    path = Path(tmp) / "pending.json"
    queue(path, "SALTRAI:1", 1)
    calls = []

    def unavailable(_extracted, candidate_id, post=None):
        calls.append(candidate_id)
        raise RuntimeError("Telegram unavailable")

    summary, receipts = deliver_queued(
        pending_path=str(path), attempts=3, send_fn=unavailable, sleep_fn=lambda _seconds: None
    )
    check("all configured retries were attempted", calls == ["SALTRAI:1"] * 3)
    check("failed delivery is reported", summary["failed"] == 1 and receipts == [])
    check("candidate data is preserved", "SALTRAI:1" in load_pending(path))
    check("failed card remains queued for the next run", queued_delivery_ids(load_pending(path)) == ["SALTRAI:1"])

    recovery_calls = []
    summary, receipts = deliver_queued(
        pending_path=str(path),
        send_fn=lambda _e, cid, post=None: recovery_calls.append(cid) or {"ok": True, "result": {"message_id": 501}},
        sleep_fn=lambda _seconds: None,
    )
    check("the next run automatically recovers the card", summary["sent"] == 1 and recovery_calls == ["SALTRAI:1"])
    check("the Telegram receipt is durable", load_pending(path)["SALTRAI:1"]["delivery"]["telegram_message_id"] == 501)
    check("successful recovery clears the retry queue", queued_delivery_ids(load_pending(path)) == [])

    deliver_queued(
        pending_path=str(path),
        send_fn=lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("must not resend")),
    )
    check("a later run does not duplicate the recovered card", True)


print("partial batch failure: successes advance, failures remain")
with tempfile.TemporaryDirectory() as tmp:
    path = Path(tmp) / "pending.json"
    queue(path, "SALTRAI:10", 10)
    queue(path, "SALTRAI:11", 11)

    def partial(_extracted, candidate_id, post=None):
        if candidate_id == "SALTRAI:10":
            return {"ok": True, "result": {"message_id": 510}}
        raise RuntimeError("still down for this card")

    summary, receipts = deliver_queued(
        pending_path=str(path), attempts=2, send_fn=partial, sleep_fn=lambda _seconds: None
    )
    pending = load_pending(path)
    check("one success and one failure are both reported", summary["sent"] == 1 and summary["failed"] == 1)
    check("successful card is not retried", delivery_status_of(pending["SALTRAI:10"]) == DELIVERY_SENT)
    check("only the failed card remains queued", queued_delivery_ids(pending) == ["SALTRAI:11"])
    check("only successful deliveries create receipts", [r["candidate_id"] for r in receipts] == ["SALTRAI:10"])


print("push collision: replay the receipt without sending twice")
with tempfile.TemporaryDirectory() as tmp:
    path = Path(tmp) / "pending.json"
    queue(path, "SALTRAI:20", 20)
    queued_snapshot = path.read_text(encoding="utf-8")
    sends = []
    _summary, receipts = deliver_queued(
        pending_path=str(path),
        send_fn=lambda _e, cid, post=None: sends.append(cid) or {"ok": True, "result": {"message_id": 520}},
    )
    path.write_text(queued_snapshot, encoding="utf-8")  # simulate reset to the new remote base
    result = apply_receipts(receipts, pending_path=str(path))
    check("receipt replay reapplies delivery state", result["applied"] == 1)
    check("receipt replay performs no second Telegram call", sends == ["SALTRAI:20"])
    check("reapplied message id is exact", load_pending(path)["SALTRAI:20"]["delivery"]["telegram_message_id"] == 520)
    result = apply_receipts(receipts, pending_path=str(path))
    check("receipt replay itself is idempotent", result["already_applied_or_removed"] == 1)
    pop_pending("SALTRAI:20", path=path)
    result = apply_receipts(receipts, pending_path=str(path))
    check("an approval racing receipt persistence is a safe no-op", result["already_applied_or_removed"] == 1)


print("local receipt write failure: never resend an accepted Telegram card")
with tempfile.TemporaryDirectory() as tmp:
    path = Path(tmp) / "pending.json"
    queue(path, "SALTRAI:25", 25)
    sends = []

    def fail_local_receipt(*_args, **_kwargs):
        raise OSError("disk temporarily unavailable")

    summary, receipts = deliver_queued(
        pending_path=str(path),
        attempts=3,
        send_fn=lambda _e, cid, post=None: sends.append(cid) or {"ok": True, "result": {"message_id": 525}},
        mark_sent_fn=fail_local_receipt,
        sleep_fn=lambda _seconds: None,
    )
    check("Telegram was called exactly once", sends == ["SALTRAI:25"])
    check("the successful receipt is still returned for workflow replay", receipts[0]["telegram_message_id"] == 525)
    check("receipt persistence failure is loud", summary["receipt_failed"] == 1)
    apply_receipts(receipts, pending_path=str(path))
    check("workflow receipt replay recovers without another send", delivery_status_of(load_pending(path)["SALTRAI:25"]) == DELIVERY_SENT)


print("recovery age guard: a different fresh workflow is not raced")
with tempfile.TemporaryDirectory() as tmp:
    path = Path(tmp) / "pending.json"
    queue(path, "manual:30", 30)
    current = datetime.now(timezone.utc)
    summary, _receipts = deliver_queued(
        pending_path=str(path),
        minimum_age_seconds=600,
        now=current,
        send_fn=lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("fresh card must wait")),
    )
    check("fresh non-owned cards wait for their original workflow", summary["too_new"] == 1 and summary["sent"] == 0)
    summary, _receipts = deliver_queued(
        pending_path=str(path),
        candidate_ids=["manual:30"],
        minimum_age_seconds=600,
        now=current,
        send_fn=lambda _e, _cid, post=None: {"ok": True, "result": {"message_id": 530}},
    )
    check("an explicitly owned fresh card sends immediately", summary["sent"] == 1)


print(f"\n{checks}/{checks} checks passed")

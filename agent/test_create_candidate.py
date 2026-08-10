#!/usr/bin/env python3
"""Offline checks for the Telegram /new materialization step."""

from __future__ import annotations

import tempfile
from pathlib import Path

from create_candidate import CreateError, create_candidate, send_pending_candidate
from state import DELIVERY_QUEUED, DELIVERY_SENT, delivery_status_of, load_pending


checks = 0


def check(label: str, condition: bool) -> None:
    global checks
    if not condition:
        raise AssertionError(label)
    checks += 1
    print(f"  [pass] {label}")


def fake_companies(_path: str) -> list[dict]:
    return [{"name": "Existing", "type": "Internship", "applicationLink": "https://existing.example/apply"}]


def no_ledger(_path: str) -> dict:
    return {}


def candidate_args() -> dict:
    return {
        "draft_id": "manual:test-1",
        "company": "Test Company",
        "type_": "internship",
        "url": "https://test.example/apply",
        "location": "Riyadh, Saudi Arabia",
        "deadline": "2026-12-31",
        "requires_letter": True,
    }


with tempfile.TemporaryDirectory() as tmp:
    pending_path = str(Path(tmp) / "pending.json")
    ledger_path = str(Path(tmp) / "published.json")
    sent: list[tuple] = []
    failures: list[tuple] = []

    print("new candidate: writes real pending state without sending before the push")
    create_candidate(
        **candidate_args(),
        defer_send=True,
        pending_path=pending_path,
        ledger_path=ledger_path,
        read_companies_fn=fake_companies,
        load_ledger_fn=no_ledger,
        send_candidate_fn=lambda *args, **kwargs: sent.append((args, kwargs)),
        send_result_fn=lambda *args, **kwargs: failures.append((args, kwargs)),
    )
    pending = load_pending(pending_path)
    check("candidate is stored under the draft id", "manual:test-1" in pending)
    check("company survives the state round trip", pending["manual:test-1"]["extracted"]["company"] == "Test Company")
    check("deferred creation sends no Telegram card", sent == [])
    check("deferred creation is durably queued", delivery_status_of(pending["manual:test-1"]) == DELIVERY_QUEUED)
    check("successful creation reports no failure", failures == [])

    print("workflow rerun: identical committed candidate is idempotent")
    create_candidate(
        **candidate_args(),
        defer_send=True,
        pending_path=pending_path,
        ledger_path=ledger_path,
        read_companies_fn=lambda _path: (_ for _ in ()).throw(AssertionError("should return before rereading companies")),
        load_ledger_fn=lambda _path: (_ for _ in ()).throw(AssertionError("should return before rereading ledger")),
        send_candidate_fn=lambda *args, **kwargs: sent.append((args, kwargs)),
        send_result_fn=lambda *args, **kwargs: failures.append((args, kwargs)),
    )
    check("rerun leaves exactly one pending record", len(load_pending(pending_path)) == 1)
    check("deferred rerun still sends nothing", sent == [])

    print("workflow rerun: reused id with different fields fails closed")
    changed = candidate_args()
    changed["company"] = "Different Company"
    try:
        create_candidate(
            **changed,
            defer_send=True,
            pending_path=pending_path,
            ledger_path=ledger_path,
            read_companies_fn=fake_companies,
            load_ledger_fn=no_ledger,
            send_candidate_fn=lambda *args, **kwargs: sent.append((args, kwargs)),
            send_result_fn=lambda *args, **kwargs: failures.append((args, kwargs)),
        )
        raise AssertionError("different fields unexpectedly overwrote the existing draft")
    except CreateError:
        pass
    check("different fields do not overwrite saved data", load_pending(pending_path)["manual:test-1"]["extracted"]["company"] == "Test Company")
    check("id collision produces a failure notification", len(failures) == 1)

    print("send-only: sends exactly the committed record")
    send_pending_candidate(
        "manual:test-1",
        pending_path=pending_path,
        send_candidate_fn=lambda *args, **kwargs: sent.append((args, kwargs)),
    )
    check("send-only emits one review card", len(sent) == 1)
    check("send-only uses the original draft id", sent[0][0][1] == "manual:test-1")
    check("send-only records successful delivery", delivery_status_of(load_pending(pending_path)["manual:test-1"]) == DELIVERY_SENT)
    send_pending_candidate(
        "manual:test-1",
        pending_path=pending_path,
        send_candidate_fn=lambda *args, **kwargs: sent.append((args, kwargs)),
    )
    check("re-running send-only cannot duplicate a delivered card", len(sent) == 1)

    try:
        send_pending_candidate("manual:missing", pending_path=pending_path, send_candidate_fn=lambda *_args, **_kwargs: None)
        raise AssertionError("missing draft unexpectedly sent")
    except CreateError:
        pass
    check("send-only refuses a draft that was never committed", True)

print(f"\n{checks}/{checks} checks passed")

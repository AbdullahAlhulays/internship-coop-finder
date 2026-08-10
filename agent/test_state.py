#!/usr/bin/env python3
"""Offline tests for state.py. Every test runs against a temporary
directory, never any real state/ files.

Run with:
    python test_state.py
"""

import json
import tempfile
from pathlib import Path

from dedupe import Decision
from extract import Extracted
from _console import use_utf8_stdout
from state import (
    DELIVERY_QUEUED,
    DELIVERY_SENT,
    StateError,
    add_pending,
    delivery_status_of,
    load_ledger,
    load_pending,
    make_candidate_id,
    mark_delivery_sent,
    pop_pending,
    queued_delivery_ids,
    record_published,
    record_to_decision,
    record_to_extracted,
)

use_utf8_stdout()

results: list[bool] = []


def check(label: str, condition: bool) -> None:
    mark = "pass" if condition else "FAIL"
    print(f"  [{mark}] {label}")
    results.append(condition)


def check_raises(label: str, fn) -> None:
    try:
        fn()
        check(label, False)
    except StateError:
        check(label, True)


ARAMCO = Extracted(
    is_opportunity=True, reason_excluded=None, type="internship",
    company="Saudi Aramco", title="Summer Internship",
    url="https://careers.aramco.com/job/12345", contact=None,
    requires_letter=False, deadline="2026-09-15", deadline_raw="١٥ سبتمبر",
    location="Dhahran, Saudi Arabia", confidence=0.95, evidence={},
)


print("make_candidate_id")
check("strips a leading @ from the channel", make_candidate_id("@SALTRAI", 5478) == "SALTRAI:5478")
check("leaves a channel with no @ untouched", make_candidate_id("SALTRAI", 5478) == "SALTRAI:5478")


with tempfile.TemporaryDirectory() as tmp:
    pending_path = Path(tmp) / "state" / "pending.json"

    print("\nload_pending on a file that doesn't exist yet")
    check("returns an empty dict, not an error", load_pending(pending_path) == {})

    print("\nadd_pending / load_pending / pop_pending round trip")
    cid = make_candidate_id("@SALTRAI", 5478)
    post = {"channel": "@SALTRAI", "permalink": "https://t.me/SALTRAI/5478", "posted_at": "2026-08-07T11:15:16+00:00"}
    decision = Decision("add", "no existing card has this application link")
    add_pending(cid, ARAMCO, post, decision, path=pending_path)
    check("file was actually created", pending_path.exists())

    reloaded = load_pending(pending_path)
    check("candidate shows up after reloading from disk", cid in reloaded)
    check("extracted data round-trips (company)", reloaded[cid]["extracted"]["company"] == "Saudi Aramco")
    check("post metadata round-trips", reloaded[cid]["post"]["channel"] == "@SALTRAI")
    check("decision round-trips too", reloaded[cid]["decision"]["action"] == "add")
    check("legacy/default additions are treated as already delivered", delivery_status_of(reloaded[cid]) == DELIVERY_SENT)

    check_raises(
        "adding the same candidate id twice raises instead of silently overwriting",
        lambda: add_pending(cid, ARAMCO, post, decision, path=pending_path),
    )

    record, remaining = pop_pending(cid, path=pending_path)
    check("pop returns the right record", record["extracted"]["company"] == "Saudi Aramco")
    check("pop removes it from the in-memory result", cid not in remaining)
    check("pop removes it from disk too", cid not in load_pending(pending_path))

    print("\ndurable Telegram delivery state")
    queued_id = make_candidate_id("@SALTRAI", 5479)
    add_pending(
        queued_id,
        ARAMCO,
        {**post, "message_id": 5479},
        decision,
        path=pending_path,
        delivery_status=DELIVERY_QUEUED,
    )
    queued_record = load_pending(pending_path)[queued_id]
    check("a deferred card is visibly queued", delivery_status_of(queued_record) == DELIVERY_QUEUED)
    check("queued_at is persisted with the card", bool(queued_record["delivery"].get("queued_at")))
    check("queue lookup finds only the queued card", queued_delivery_ids(load_pending(pending_path)) == [queued_id])
    draft_record = {**queued_record, "creating_step": "company"}
    check("an in-progress /new draft can never enter the delivery queue", queued_delivery_ids({"manual:123": draft_record}) == [])
    check("a Telegram receipt changes queued to sent", mark_delivery_sent(queued_id, 91234, path=pending_path))
    delivered_record = load_pending(pending_path)[queued_id]
    check("Telegram message id is persisted", delivered_record["delivery"]["telegram_message_id"] == 91234)
    check("sent cards disappear from the retry queue", queued_delivery_ids(load_pending(pending_path)) == [])
    check("replaying the same receipt is idempotent", not mark_delivery_sent(queued_id, 91234, path=pending_path))
    check_raises(
        "a conflicting Telegram receipt fails closed",
        lambda: mark_delivery_sent(queued_id, 99999, path=pending_path),
    )
    pop_pending(queued_id, path=pending_path)
    check("a receipt for an already-approved card is a safe no-op", not mark_delivery_sent(queued_id, 91234, path=pending_path))

    print("\nreconstructing typed objects from a popped record")
    rebuilt_extracted = record_to_extracted(record)
    check("rebuilt Extracted is equivalent to the original", rebuilt_extracted == ARAMCO)
    rebuilt_decision = record_to_decision(record)
    check("rebuilt Decision is equivalent to the original", rebuilt_decision == decision)

    check_raises(
        "popping an id that was never pending raises, doesn't silently no-op",
        lambda: pop_pending("nonexistent:1", path=pending_path),
    )
    check_raises(
        "popping an id that was already popped raises too",
        lambda: pop_pending(cid, path=pending_path),
    )

    print("\nmany cards pending at once, answered out of order (the normal way Abood uses this)")
    from dataclasses import replace

    ids = []
    for n in range(1, 6):
        cid_n = make_candidate_id("@SALTRAI", 6000 + n)
        ids.append(cid_n)
        add_pending(
            cid_n,
            replace(ARAMCO, company=f"Company {n}", url=f"https://example.com/apply/{n}"),
            {"channel": "@SALTRAI", "message_id": 6000 + n},
            Decision("add", "no existing card has this application link"),
            path=pending_path,
        )
    check("all five are waiting at once, none blocking the others", len(load_pending(pending_path)) == 5)

    # Answer the 4th one first, then the 2nd -- deliberately not in order.
    fourth, _ = pop_pending(ids[3], path=pending_path)
    check("answering the 4th first returns the 4th's data, not the 1st's",
          fourth["extracted"]["company"] == "Company 4")
    second, _ = pop_pending(ids[1], path=pending_path)
    check("then answering the 2nd returns the 2nd's data", second["extracted"]["company"] == "Company 2")

    still_waiting = load_pending(pending_path)
    check("the three untouched cards are still waiting, unaffected", len(still_waiting) == 3)
    check("specifically 1, 3 and 5 -- the ones never answered",
          sorted(v["extracted"]["company"] for v in still_waiting.values()) == ["Company 1", "Company 3", "Company 5"])
    check("an answered card is gone for good and can't be double-applied", ids[3] not in still_waiting)

    for cid_n in (ids[0], ids[2], ids[4]):
        pop_pending(cid_n, path=pending_path)
    check("after clearing the rest, nothing is left pending", load_pending(pending_path) == {})

    print("\nno leftover temp files after normal operations")
    leftovers = list((Path(tmp) / "state").glob(".*tmp*"))
    check("atomic write cleaned up after itself", leftovers == [])


with tempfile.TemporaryDirectory() as tmp:
    print("\ncorrupted state file is rejected, not silently treated as empty")
    bad_path = Path(tmp) / "state" / "pending.json"
    bad_path.parent.mkdir(parents=True)
    bad_path.write_text("{not valid json", encoding="utf-8")
    check_raises("raises StateError on malformed JSON", lambda: load_pending(bad_path))

    list_path = Path(tmp) / "state" / "list.json"
    list_path.parent.mkdir(parents=True, exist_ok=True)
    list_path.write_text(json.dumps(["not", "a", "dict"]), encoding="utf-8")
    check_raises("raises StateError when the top level isn't an object", lambda: load_pending(list_path))


with tempfile.TemporaryDirectory() as tmp:
    ledger_path = Path(tmp) / "state" / "published.json"

    print("\npublished ledger")
    check("empty ledger to start", load_ledger(ledger_path) == {})
    record_published(
        "https://careers.aramco.com/job/12345", "2026-08-07T11:15:16+00:00", 5478, "@SALTRAI", path=ledger_path
    )
    ledger = load_ledger(ledger_path)
    check("link is now a key in the ledger", "https://careers.aramco.com/job/12345" in ledger)
    check("posted_at recorded, in the shape dedupe.decide() expects",
          ledger["https://careers.aramco.com/job/12345"]["posted_at"] == "2026-08-07T11:15:16+00:00")

    print("\nledger dict is directly usable as dedupe.decide()'s ledger argument")
    from dedupe import decide

    existing = [{"name": "Saudi Aramco", "applicationLink": "https://careers.aramco.com/job/12345", "type": "Internship"}]
    d = decide(
        {"name": "Saudi Aramco", "applicationLink": "https://careers.aramco.com/job/12345", "type": "Internship",
         "location": "Dhahran, Riyadh, Saudi Arabia"},
        new_posted_at="2026-08-08T00:00:00+00:00",  # after the recorded post
        existing_cards=existing,
        ledger=ledger,
    )
    check("dedupe recognizes this as a known-published repost and allows a refresh", d.action == "update")


passed = sum(results)
total = len(results)
print(f"\n{passed}/{total} checks passed")
if passed != total:
    raise SystemExit(1)

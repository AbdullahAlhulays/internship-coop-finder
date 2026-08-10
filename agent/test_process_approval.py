#!/usr/bin/env python3
"""Offline tests for process_approval.py. Everything runs against
temp files and stub Telegram/state functions -- no network, no real
GROQ/Telegram credentials, no real repo files touched.

Run with:
    python test_process_approval.py
"""

import tempfile
from pathlib import Path

from dedupe import Decision
from extract import Extracted
from process_approval import ApprovalError, process_approval
from state import StateError, add_pending

from _console import use_utf8_stdout

use_utf8_stdout()

results: list[bool] = []


def check(label: str, condition: bool) -> None:
    mark = "pass" if condition else "FAIL"
    print(f"  [{mark}] {label}")
    results.append(condition)


def check_raises(label: str, exc_type, fn) -> None:
    try:
        fn()
        check(label, False)
    except exc_type:
        check(label, True)


def stub_calls():
    """Records every call made to it; returns a dict-like recorder plus
    the three stand-in functions themselves."""
    calls = {"result": [], "rejected": [], "published": []}

    def send_result_fn(candidate_id, applied, detail=""):
        calls["result"].append({"candidate_id": candidate_id, "applied": applied, "detail": detail})

    def send_rejected_fn(candidate_id):
        calls["rejected"].append(candidate_id)

    def record_published_fn(link, posted_at, message_id, channel, path=None):
        calls["published"].append({"link": link, "posted_at": posted_at, "message_id": message_id, "channel": channel})

    return calls, send_result_fn, send_rejected_fn, record_published_fn


ARAMCO = Extracted(
    is_opportunity=True, reason_excluded=None, type="internship",
    company="Saudi Aramco", title="Summer Internship",
    url="https://careers.aramco.com/job/999", contact=None,
    requires_letter=False, deadline="2026-09-15", deadline_raw="١٥ سبتمبر",
    location="Dhahran, Saudi Arabia", confidence=0.95, evidence={},
)

APP_JSX = '''import React from "react";
const LAST_UPDATED = "June 2, 2026";
function App() { return <div>{LAST_UPDATED}</div>; }
export default App;
'''

COMPANIES_JS = '''export const companies = [
  {
    name: "SSCL",
    applicationLink: "https://forms.office.com/pages/abc",
    type: "CO-OP Training",
  },
];
'''


def make_temp_repo():
    tmp = tempfile.TemporaryDirectory()
    root = Path(tmp.name)
    (root / "src" / "data").mkdir(parents=True)
    companies_path = root / "src" / "data" / "companies.js"
    app_path = root / "src" / "App.jsx"
    companies_path.write_text(COMPANIES_JS, encoding="utf-8")
    app_path.write_text(APP_JSX, encoding="utf-8")
    pending_path = root / "state" / "pending.json"
    ledger_path = root / "state" / "published.json"
    return tmp, companies_path, app_path, pending_path, ledger_path


print("reject: no files touched, no publish, distinct notification")
tmp, companies_path, app_path, pending_path, ledger_path = make_temp_repo()
with tmp:
    decision = Decision("add", "no existing card has this application link")
    add_pending("SALTRAI:1", ARAMCO, {"channel": "@SALTRAI", "message_id": 1}, decision, path=pending_path)
    calls, send_result_fn, send_rejected_fn, record_published_fn = stub_calls()

    process_approval(
        "SALTRAI:1", "reject",
        companies_js_path=str(companies_path), app_jsx_path=str(app_path),
        pending_path=str(pending_path), ledger_path=str(ledger_path),
        send_result_fn=send_result_fn, send_rejected_fn=send_rejected_fn, record_published_fn=record_published_fn,
    )
    check("send_rejected_fn was called exactly once", calls["rejected"] == ["SALTRAI:1"])
    check("send_result_fn (success/failure) was never called for a reject", calls["result"] == [])
    check("companies.js untouched", companies_path.read_text(encoding="utf-8") == COMPANIES_JS)
    check("App.jsx untouched", app_path.read_text(encoding="utf-8") == APP_JSX)
    check("nothing recorded to the published ledger", calls["published"] == [])


print("\napprove (add): files updated correctly, ledger recorded, success notified")
tmp, companies_path, app_path, pending_path, ledger_path = make_temp_repo()
with tmp:
    decision = Decision("add", "no existing card has this application link")
    add_pending("SALTRAI:2", ARAMCO, {"channel": "@SALTRAI", "message_id": 2, "posted_at": "2026-08-07T11:00:00+00:00"}, decision, path=pending_path)
    calls, send_result_fn, send_rejected_fn, record_published_fn = stub_calls()

    process_approval(
        "SALTRAI:2", "approve",
        companies_js_path=str(companies_path), app_jsx_path=str(app_path),
        pending_path=str(pending_path), ledger_path=str(ledger_path),
        send_result_fn=send_result_fn, send_rejected_fn=send_rejected_fn, record_published_fn=record_published_fn,
    )

    new_companies = companies_path.read_text(encoding="utf-8")
    check("new card was actually added to companies.js", "Saudi Aramco" in new_companies)
    check("original SSCL card is untouched", "SSCL" in new_companies)

    new_app = app_path.read_text(encoding="utf-8")
    check("App.jsx's LAST_UPDATED was bumped off the old placeholder date", "June 2, 2026" not in new_app)

    check("success was reported for this candidate", calls["result"] == [{"candidate_id": "SALTRAI:2", "applied": True, "detail": ""}])
    check("published ledger got exactly one entry, for the right link",
          len(calls["published"]) == 1 and calls["published"][0]["link"] == "https://careers.aramco.com/job/999")


print("\napprove (update): fills in a missing deadline on an existing card")
tmp, companies_path, app_path, pending_path, ledger_path = make_temp_repo()
with tmp:
    sscl_extracted = Extracted(
        is_opportunity=True, reason_excluded=None, type="coop",
        company="SSCL", title=None, url="https://forms.office.com/pages/abc",
        contact=None, requires_letter=False, deadline="2026-09-01", deadline_raw=None,
        location=None, confidence=0.9, evidence={},
    )
    decision = Decision("update", "existing card has no deadline, this post has one", existing_index=0, changes={"deadline": "2026-09-01"})
    add_pending("SALTRAI:3", sscl_extracted, {"channel": "@SALTRAI", "message_id": 3}, decision, path=pending_path)
    calls, send_result_fn, send_rejected_fn, record_published_fn = stub_calls()

    process_approval(
        "SALTRAI:3", "approve",
        companies_js_path=str(companies_path), app_jsx_path=str(app_path),
        pending_path=str(pending_path), ledger_path=str(ledger_path),
        send_result_fn=send_result_fn, send_rejected_fn=send_rejected_fn, record_published_fn=record_published_fn,
    )
    new_companies = companies_path.read_text(encoding="utf-8")
    check("deadline was filled in on the existing SSCL card", 'deadline: "2026-09-01",' in new_companies)
    check("no second SSCL card was created", new_companies.count('name: "SSCL"') == 1)
    check("success reported", calls["result"][0]["applied"] is True)


print("\napprove, but companies.js doesn't match the expected structure -- must fail loudly, change nothing")
tmp, companies_path, app_path, pending_path, ledger_path = make_temp_repo()
with tmp:
    companies_path.write_text("export const somethingElse = [];\n", encoding="utf-8")  # no 'companies' array at all
    decision = Decision("add", "no existing card has this application link")
    add_pending("SALTRAI:4", ARAMCO, {"channel": "@SALTRAI", "message_id": 4}, decision, path=pending_path)
    calls, send_result_fn, send_rejected_fn, record_published_fn = stub_calls()

    check_raises(
        "raises ApprovalError instead of silently doing nothing or guessing",
        ApprovalError,
        lambda: process_approval(
            "SALTRAI:4", "approve",
            companies_js_path=str(companies_path), app_jsx_path=str(app_path),
            pending_path=str(pending_path), ledger_path=str(ledger_path),
            send_result_fn=send_result_fn, send_rejected_fn=send_rejected_fn, record_published_fn=record_published_fn,
        ),
    )
    check("Abood was still notified of the failure, with the real reason", calls["result"] and calls["result"][0]["applied"] is False and "companies" in calls["result"][0]["detail"])
    check("the broken file was never touched further", companies_path.read_text(encoding="utf-8") == "export const somethingElse = [];\n")
    check("App.jsx also untouched -- both-or-neither, not a half-applied state", app_path.read_text(encoding="utf-8") == APP_JSX)
    check("nothing recorded to the published ledger on failure", calls["published"] == [])


print("\napprove, but the candidate isn't pending at all (stale / already-handled tap)")
tmp, companies_path, app_path, pending_path, ledger_path = make_temp_repo()
with tmp:
    calls, send_result_fn, send_rejected_fn, record_published_fn = stub_calls()
    check_raises(
        "raises StateError, doesn't silently do nothing",
        StateError,
        lambda: process_approval(
            "GHOST:1", "approve",
            companies_js_path=str(companies_path), app_jsx_path=str(app_path),
            pending_path=str(pending_path), ledger_path=str(ledger_path),
            send_result_fn=send_result_fn, send_rejected_fn=send_rejected_fn, record_published_fn=record_published_fn,
        ),
    )
    check("Abood is still told something, not left wondering why nothing happened",
          calls["result"] and calls["result"][0]["applied"] is False)


print("\ndefer_notice: files still change, but nothing is announced until the caller pushes")
tmp, companies_path, app_path, pending_path, ledger_path = make_temp_repo()
with tmp:
    decision = Decision("add", "no existing card has this application link")
    add_pending("SALTRAI:6", ARAMCO, {"channel": "@SALTRAI", "message_id": 6}, decision, path=pending_path)
    calls, send_result_fn, send_rejected_fn, record_published_fn = stub_calls()

    process_approval(
        "SALTRAI:6", "approve", defer_notice=True,
        companies_js_path=str(companies_path), app_jsx_path=str(app_path),
        pending_path=str(pending_path), ledger_path=str(ledger_path),
        send_result_fn=send_result_fn, send_rejected_fn=send_rejected_fn, record_published_fn=record_published_fn,
    )
    check("the card really was written to companies.js", "Saudi Aramco" in companies_path.read_text(encoding="utf-8"))
    check("but no 'Applied' message was sent — the push hasn't happened yet", calls["result"] == [])

print("\ndefer_notice on a reject: also stays quiet until the caller confirms")
tmp, companies_path, app_path, pending_path, ledger_path = make_temp_repo()
with tmp:
    decision = Decision("add", "no existing card has this application link")
    add_pending("SALTRAI:7", ARAMCO, {"channel": "@SALTRAI", "message_id": 7}, decision, path=pending_path)
    calls, send_result_fn, send_rejected_fn, record_published_fn = stub_calls()

    process_approval(
        "SALTRAI:7", "reject", defer_notice=True,
        companies_js_path=str(companies_path), app_jsx_path=str(app_path),
        pending_path=str(pending_path), ledger_path=str(ledger_path),
        send_result_fn=send_result_fn, send_rejected_fn=send_rejected_fn, record_published_fn=record_published_fn,
    )
    check("no 'Rejected' message sent yet", calls["rejected"] == [])

print("\ndefer_notice does NOT suppress failure messages — a failure aborts, so there's no 'later' to send them")
tmp, companies_path, app_path, pending_path, ledger_path = make_temp_repo()
with tmp:
    companies_path.write_text("export const somethingElse = [];\n", encoding="utf-8")
    decision = Decision("add", "no existing card has this application link")
    add_pending("SALTRAI:8", ARAMCO, {"channel": "@SALTRAI", "message_id": 8}, decision, path=pending_path)
    calls, send_result_fn, send_rejected_fn, record_published_fn = stub_calls()

    check_raises(
        "still raises",
        ApprovalError,
        lambda: process_approval(
            "SALTRAI:8", "approve", defer_notice=True,
            companies_js_path=str(companies_path), app_jsx_path=str(app_path),
            pending_path=str(pending_path), ledger_path=str(ledger_path),
            send_result_fn=send_result_fn, send_rejected_fn=send_rejected_fn, record_published_fn=record_published_fn,
        ),
    )
    check("Abood is still told it failed, even with defer_notice on",
          calls["result"] and calls["result"][0]["applied"] is False)


print("\ntest-mode decisions exercise state but can never publish")
for test_action in ("approve", "reject"):
    tmp, companies_path, app_path, pending_path, ledger_path = make_temp_repo()
    with tmp:
        candidate_id = f"test:{test_action}-1"
        add_pending(
            candidate_id,
            ARAMCO,
            {"channel": "manual", "message_id": None},
            Decision("add", "synthetic test"),
            path=pending_path,
        )
        companies_before = companies_path.read_bytes()
        app_before = app_path.read_bytes()
        calls, send_result_fn, send_rejected_fn, record_published_fn = stub_calls()
        test_results = []

        process_approval(
            candidate_id,
            test_action,
            companies_js_path=str(companies_path), app_jsx_path=str(app_path),
            pending_path=str(pending_path), ledger_path=str(ledger_path),
            send_result_fn=send_result_fn, send_rejected_fn=send_rejected_fn,
            send_test_result_fn=lambda cid, action: test_results.append((cid, action)),
            record_published_fn=record_published_fn,
        )

        from state import load_pending
        check(f"test {test_action} removes the pending card", candidate_id not in load_pending(pending_path))
        check(f"test {test_action} leaves companies.js byte-for-byte unchanged", companies_path.read_bytes() == companies_before)
        check(f"test {test_action} leaves App.jsx byte-for-byte unchanged", app_path.read_bytes() == app_before)
        check(f"test {test_action} never creates or edits the published ledger", not ledger_path.exists() and calls["published"] == [])
        check(f"test {test_action} uses only the explicit test confirmation", test_results == [(candidate_id, test_action)] and calls["result"] == [] and calls["rejected"] == [])

print("\ntest-mode defer_notice waits for the workflow push")
tmp, companies_path, app_path, pending_path, ledger_path = make_temp_repo()
with tmp:
    add_pending("test:deferred", ARAMCO, {"channel": "manual"}, Decision("add", "synthetic test"), path=pending_path)
    test_results = []
    process_approval(
        "test:deferred", "approve", defer_notice=True,
        companies_js_path=str(companies_path), app_jsx_path=str(app_path),
        pending_path=str(pending_path), ledger_path=str(ledger_path),
        send_test_result_fn=lambda cid, action: test_results.append((cid, action)),
    )
    check("test confirmation is deferred until after the state-removal push", test_results == [])


print("\nmany independent candidates: answering one never disturbs the others")
tmp, companies_path, app_path, pending_path, ledger_path = make_temp_repo()
with tmp:
    from dataclasses import replace as dc_replace
    from state import load_pending

    for n in (1, 2, 3):
        add_pending(
            f"SALTRAI:{100 + n}",
            dc_replace(ARAMCO, company=f"Company {n}", url=f"https://example.com/apply/{n}"),
            {"channel": "@SALTRAI", "message_id": 100 + n},
            Decision("add", "no existing card has this application link"),
            path=pending_path,
        )
    calls, send_result_fn, send_rejected_fn, record_published_fn = stub_calls()

    # Approve the middle one only.
    process_approval(
        "SALTRAI:102", "approve",
        companies_js_path=str(companies_path), app_jsx_path=str(app_path),
        pending_path=str(pending_path), ledger_path=str(ledger_path),
        send_result_fn=send_result_fn, send_rejected_fn=send_rejected_fn, record_published_fn=record_published_fn,
    )
    new_companies = companies_path.read_text(encoding="utf-8")
    check("only the approved company was published", "Company 2" in new_companies)
    check("the unanswered ones were NOT published", "Company 1" not in new_companies and "Company 3" not in new_companies)
    remaining = load_pending(pending_path)
    check("the other two are still pending, ready to answer whenever", sorted(remaining) == ["SALTRAI:101", "SALTRAI:103"])


print("\nunknown action")
tmp, companies_path, app_path, pending_path, ledger_path = make_temp_repo()
with tmp:
    calls, send_result_fn, send_rejected_fn, record_published_fn = stub_calls()

    def pop_pending_fn_should_not_be_called(*a, **k):
        raise AssertionError("pop_pending_fn must not be called for an invalid action")

    check_raises(
        "an invalid action is rejected before ever touching state",
        ApprovalError,
        lambda: process_approval(
            "SALTRAI:5", "maybe",
            companies_js_path=str(companies_path), app_jsx_path=str(app_path),
            pending_path=str(pending_path), ledger_path=str(ledger_path),
            pop_pending_fn=pop_pending_fn_should_not_be_called,
            send_result_fn=send_result_fn, send_rejected_fn=send_rejected_fn, record_published_fn=record_published_fn,
        ),
    )


passed = sum(results)
total = len(results)
print(f"\n{passed}/{total} checks passed")
if passed != total:
    raise SystemExit(1)

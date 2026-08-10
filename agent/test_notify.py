#!/usr/bin/env python3
"""Offline tests for notify.py. No network calls, no real
TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID needed -- every send_* call below
passes fake token/chat_id directly and a stub transport that just
records what would have been sent.

Run with:
    python test_notify.py
"""

import os
from unittest.mock import patch

from extract import Extracted
from notify import (
    NotifyError,
    approval_keyboard,
    deadline_warning,
    format_candidate_message,
    format_card_message,
    is_test_candidate,
    main as notify_main,
    send_candidate,
    send_result,
    send_test_result,
)

from _console import use_utf8_stdout

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
    except NotifyError:
        check(label, True)


def stub_transport(sent: list[dict]):
    """Records every payload it's called with; always returns a
    successful Telegram-shaped response."""

    def _transport(url: str, payload: dict) -> dict:
        sent.append({"url": url, "payload": payload})
        return {"ok": True, "result": {"message_id": 42}}

    return _transport


ARAMCO = Extracted(
    is_opportunity=True,
    reason_excluded=None,
    type="internship",
    company="Saudi Aramco",
    title="Summer Internship",
    url="https://careers.aramco.com/job/12345",
    contact=None,
    requires_letter=False,
    deadline="2026-09-15",
    deadline_raw="١٥ سبتمبر",
    location="Dhahran, Saudi Arabia",
    confidence=0.95,
    evidence={"note": "explicit تدريب صيفي framing with a real application link"},
)

NO_DEADLINE = Extracted(
    is_opportunity=True,
    reason_excluded=None,
    type="coop",
    company="SSCL",
    title=None,
    url="https://forms.office.com/pages/some-form",
    contact=None,
    requires_letter=True,
    deadline=None,
    deadline_raw=None,
    location="Riyadh, Saudi Arabia",
    confidence=0.8,
    evidence={},
)

# The real 2026-08-09 bug: Groq returned "2024-09-15" for a post about
# a Sept 15 deadline published in August 2026 -- syntactically valid
# YYYY-MM-DD, semantically nonsense (already years in the past).
WRONG_YEAR = Extracted(
    is_opportunity=True, reason_excluded=None, type="internship",
    company="Aramco", title=None, url="https://careers.aramco.com/job/12345",
    contact=None, requires_letter=False,
    deadline="2024-09-15", deadline_raw="١٥ سبتمبر",
    location="Dhahran, Saudi Arabia", confidence=0.9, evidence={},
)


print("format_card_message")
text = format_card_message(ARAMCO, post={"channel": "@SALTRAI", "permalink": "https://t.me/SALTRAI/5478"})
check("name shown with an explicit label", "Name: Saudi Aramco" in text)
check("resolved deadline shown, not the raw Arabic text", "2026-09-15" in text and "Deadline found" in text)
check("application link present as a clickable href", 'href="https://careers.aramco.com/job/12345"' in text)
check("source post link included for click-through verification", "https://t.me/SALTRAI/5478" in text)
check("confidence shown as a percentage", "95%" in text)
check("letter requirement explicitly shown as No, not hidden, when false", "Requires enrollment letter: No" in text)

text_no_deadline = format_card_message(NO_DEADLINE)
check("missing deadline says so plainly instead of a blank", "not found" in text_no_deadline)
check("letter requirement shown as Yes when true", "Requires enrollment letter: Yes" in text_no_deadline)

print("\ndeadline_warning (catches the real 2024-vs-2026 bug)")
check("no warning for a deadline that's genuinely in the future", deadline_warning(ARAMCO) is None)
check(
    "flags a deadline that's already in the past as likely wrong",
    deadline_warning(WRONG_YEAR) is not None and "2024-09-15" in deadline_warning(WRONG_YEAR),
)
wrong_year_text = format_card_message(WRONG_YEAR)
check("the warning actually shows up in the message Abood receives", "⚠️" in wrong_year_text and "likely wrong" in wrong_year_text)

print("\nHTML escaping (a company/location containing special characters must not break parse_mode=HTML)")
tricky = Extracted(
    is_opportunity=True, reason_excluded=None, type="job", company="A & B <Test> Co",
    title=None, url="https://example.com/a&b", contact=None, requires_letter=False,
    deadline=None, deadline_raw=None, location=None, confidence=0.5, evidence={},
)
tricky_text = format_card_message(tricky)
check("ampersand escaped", "&amp;" in tricky_text)
check("angle brackets escaped, not left as raw HTML tags", "&lt;Test&gt;" in tricky_text)

print("\ntest-card safety banner")
test_text = format_candidate_message(ARAMCO, "test:123", post={"channel": "manual"})
normal_text = format_candidate_message(ARAMCO, "manual:123", post={"channel": "manual"})
check("test ids are recognized only by the dedicated prefix", is_test_candidate("test:123") and not is_test_candidate("manual:test-123"))
check("test card has an unmistakable persistent banner", test_text.startswith("🧪 <b>TEST MODE</b>"))
check("banner explicitly promises no website change", "website will not change" in test_text)
check("normal cards never receive the test banner", "TEST MODE" not in normal_text)


print("\napproval_keyboard")
# 2026-08-09: the deadline button is now ALWAYS present, even when the
# AI found a deadline -- a found deadline can still be wrong (see the
# WRONG_YEAR case above), so "found something" must not mean "no
# button needed" anymore.
kb = approval_keyboard("SSCL:99", current_deadline=None)
check("three rows: approve/reject, deadline, edit -- always, not conditionally", len(kb["inline_keyboard"]) == 3)
check("approve/reject callback_data encodes the candidate id", kb["inline_keyboard"][0][0]["callback_data"] == "approve:SSCL:99")
check("deadline button says 'Set' when none was found", "Set deadline" in kb["inline_keyboard"][1][0]["text"])
check("edit button is present", kb["inline_keyboard"][2][0]["callback_data"] == "edit:SSCL:99")

kb_with_deadline = approval_keyboard("SALTRAI:5478", current_deadline="2026-09-15")
check("deadline button says 'Change' and shows the current value when one was found",
      "Change deadline" in kb_with_deadline["inline_keyboard"][1][0]["text"]
      and "2026-09-15" in kb_with_deadline["inline_keyboard"][1][0]["text"])
check("deadline button callback_data is well-formed regardless of label", kb_with_deadline["inline_keyboard"][1][0]["callback_data"] == "deadline:SALTRAI:5478")

check_raises(
    "raises rather than silently truncating an oversized candidate_id",
    lambda: approval_keyboard("x" * 100, current_deadline=None),
)


print("\nsend_candidate (stub transport, fake credentials, no network)")
sent: list[dict] = []
result = send_candidate(ARAMCO, "SALTRAI:5478", post={"channel": "@SALTRAI"}, transport=stub_transport(sent), token="fake-token", chat_id="724474114")
check("returns Telegram's response", result["ok"] is True)
check("exactly one message was sent", len(sent) == 1)
check("sent to the right chat id", sent[0]["payload"]["chat_id"] == "724474114")
check("hit the sendMessage endpoint with the fake token", "faketoken" not in sent[0]["url"] and "fake-token" in sent[0]["url"])
check("message includes an inline keyboard", "reply_markup" in sent[0]["payload"])
check("parse_mode is HTML", sent[0]["payload"]["parse_mode"] == "HTML")


print("\nsend_result")
sent2: list[dict] = []
send_result("SALTRAI:5478", applied=True, transport=stub_transport(sent2), token="fake-token", chat_id="724474114")
check("success message uses the requested wording", sent2[0]["payload"]["text"] == "Yes Boss! Applied: SALTRAI:5478")

sent3: list[dict] = []
send_result("SSCL:99", applied=False, detail="node --check failed: unexpected token", transport=stub_transport(sent3), token="fake-token", chat_id="724474114")
check("failure message uses an X and includes the reason", "❌" in sent3[0]["payload"]["text"] and "unexpected token" in sent3[0]["payload"]["text"])

print("\nsend_test_result")
sent4: list[dict] = []
send_test_result("test:123", "approve", transport=stub_transport(sent4), token="fake", chat_id="999")
send_test_result("test:124", "reject", transport=stub_transport(sent4), token="fake", chat_id="999")
check("test Approve says it worked without claiming it is live", "Test Approve worked" in sent4[0]["payload"]["text"] and "No website data was changed" in sent4[0]["payload"]["text"])
check("test Reject has its own success confirmation", "Test Reject worked" in sent4[1]["payload"]["text"])
check_raises("unknown test action fails closed", lambda: send_test_result("test:125", "maybe", transport=stub_transport(sent4), token="fake", chat_id="999"))

with patch("notify.send_test_result") as mocked_test_result:
    with patch("sys.argv", ["notify.py", "test:200", "--test-approved"]):
        approved_exit = notify_main()
    with patch("sys.argv", ["notify.py", "test:201", "--test-rejected"]):
        rejected_exit = notify_main()
check("workflow CLI routes --test-approved exactly", approved_exit == 0 and mocked_test_result.call_args_list[0].args == ("test:200", "approve"))
check("workflow CLI routes --test-rejected exactly", rejected_exit == 0 and mocked_test_result.call_args_list[1].args == ("test:201", "reject"))


print("\nerror handling")
check_raises(
    "raises when Telegram itself rejects the call (e.g. bad token)",
    lambda: send_candidate(
        ARAMCO, "id", transport=lambda url, payload: {"ok": False, "description": "Unauthorized"},
        token="bad-token", chat_id="1",
    ),
)
with patch.dict(os.environ, {}, clear=False) as _:
    # Explicitly scrub these two, regardless of whatever happens to be set
    # in whatever environment this test runs in (a dev machine, CI, etc.)
    # -- this check must be deterministic, not dependent on ambient state.
    for _var in ("TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"):
        os.environ.pop(_var, None)
    check_raises(
        "raises when neither token/chat_id is supplied and the environment has none set",
        lambda: send_candidate(ARAMCO, "id", transport=stub_transport([])),
    )


passed = sum(results)
total = len(results)
print(f"\n{passed}/{total} checks passed")
if passed != total:
    raise SystemExit(1)

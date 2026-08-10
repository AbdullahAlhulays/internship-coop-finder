#!/usr/bin/env python3
"""Offline tests for read_companies.py and run.py. No network, no
Groq key, no Telegram credentials -- the model is a stub and Telegram
is a recorder.

Requires node (same as publish.py's validation step does).

Run with:
    python test_run.py
"""

import json
import tempfile
from pathlib import Path

from read_companies import ReadCompaniesError, read_companies
from run import as_plain_text, run
from state import DELIVERY_QUEUED, DELIVERY_SENT, delivery_status_of, load_pending, load_seen

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


# Deliberately awkward: a trailing comma, a URL containing brackets and
# a comma, an Arabic name, a nested-looking string -- all the things a
# regex-based parser would get wrong.
COMPANIES_JS = '''// The site's opportunity data.
export const companies = [
  {
    name: "Saudi Water Authority | الهيئة السعودية للمياه",
    location: "Many, Saudi Arabia",
    applicationLink: "https://www.swa.gov.sa/ar/services?a=[1,2]&b=x,y",
    deadline: "2026-05-18",
    type: "CO-OP Training",
    isClosed: true,
    addedAt: "2026-05-14T00:00:00+03:00",
  },
  {
    name: "SSCL",
    applicationLink: "https://forms.office.com/pages/abc",
    type: "CO-OP Training",
    requiresLetter: true,
  },
];
'''


def write_companies(dirpath: Path, source: str = COMPANIES_JS) -> Path:
    p = dirpath / "companies.js"
    p.write_text(source, encoding="utf-8")
    return p


def stub_model(response: dict):
    def _fn(prompt: str) -> str:
        return json.dumps(response, ensure_ascii=False)
    return _fn


def opportunity_json(**overrides) -> dict:
    base = {
        "is_opportunity": True, "reason_excluded": None, "type": "internship",
        "company": "New Co", "title": "Summer Internship",
        "url": "https://newco.example.com/apply", "contact": None,
        "requires_letter": False, "deadline": None, "deadline_raw": None,
        "location": "Riyadh, Saudi Arabia", "confidence": 0.9, "evidence": {},
    }
    base.update(overrides)
    return base


POST = {"channel": "@SALTRAI", "message_id": 5478, "permalink": "https://t.me/SALTRAI/5478",
        "posted_at": "2026-08-07T12:00:00+00:00", "text": "some post text", "links": []}


print("read_companies: node does the parsing, not a regex")
with tempfile.TemporaryDirectory() as tmp:
    path = write_companies(Path(tmp))
    cards = read_companies(path)
    check("read both cards", len(cards) == 2)
    check("Arabic name survives intact", cards[0]["name"].endswith("الهيئة السعودية للمياه"))
    check("a URL containing brackets and commas is read correctly, not truncated",
          cards[0]["applicationLink"] == "https://www.swa.gov.sa/ar/services?a=[1,2]&b=x,y")
    check("booleans come through as real booleans", cards[0]["isClosed"] is True and cards[1]["requiresLetter"] is True)
    check("a card without an optional field simply lacks the key", "deadline" not in cards[1])

with tempfile.TemporaryDirectory() as tmp:
    check_raises("missing file raises rather than returning []", ReadCompaniesError,
                 lambda: read_companies(Path(tmp) / "nope.js"))

    broken = Path(tmp) / "broken.js"
    broken.write_text("export const companies = [ {name: 'x'", encoding="utf-8")
    check_raises("syntactically broken JS raises", ReadCompaniesError, lambda: read_companies(broken))

    wrong = Path(tmp) / "wrong.js"
    wrong.write_text("export const companies = { not: 'an array' };", encoding="utf-8")
    check_raises("a non-array export raises", ReadCompaniesError, lambda: read_companies(wrong))

    nolink = Path(tmp) / "nolink.js"
    nolink.write_text('export const companies = [{ name: "X", type: "Internship" }];', encoding="utf-8")
    check_raises("a card missing applicationLink raises — dedupe would be unsafe without it",
                 ReadCompaniesError, lambda: read_companies(nolink))


print("\nrun: a brand new opportunity gets sent for review")
with tempfile.TemporaryDirectory() as tmp:
    tmpp = Path(tmp)
    companies = write_companies(tmpp)
    sent = []
    summary = run(
        "@SALTRAI", [POST], str(companies),
        pending_path=str(tmpp / "pending.json"), ledger_path=str(tmpp / "published.json"),
        seen_path=str(tmpp / "seen.json"),
        model_fn=stub_model(opportunity_json()),
        send_fn=lambda extracted, cid, post=None: sent.append(cid),
    )
    check("exactly one card was sent", summary["sent"] == 1 and sent == ["SALTRAI:5478"])
    check("it's now recorded as pending, awaiting an answer", "SALTRAI:5478" in load_pending(tmpp / "pending.json"))
    check("a successful immediate send is recorded", delivery_status_of(load_pending(tmpp / "pending.json")["SALTRAI:5478"]) == DELIVERY_SENT)
    check("the post is marked seen so the next run skips it", load_seen(tmpp / "seen.json") == {"SALTRAI": [5478]})


print("\nrun: re-running the same post sends nothing the second time")
with tempfile.TemporaryDirectory() as tmp:
    tmpp = Path(tmp)
    companies = write_companies(tmpp)
    paths = {"pending_path": str(tmpp / "pending.json"), "ledger_path": str(tmpp / "published.json"),
             "seen_path": str(tmpp / "seen.json")}
    sent = []
    send_fn = lambda extracted, cid, post=None: sent.append(cid)
    run("@SALTRAI", [POST], str(companies), model_fn=stub_model(opportunity_json()), send_fn=send_fn, **paths)
    second = run("@SALTRAI", [POST], str(companies), model_fn=stub_model(opportunity_json()), send_fn=send_fn, **paths)
    check("nothing sent on the second run", second["sent"] == 0)
    check("counted as already handled", second["skipped_seen"] == 1)
    check("still only one message ever sent", sent == ["SALTRAI:5478"])


print("\nrun --defer-send: state is durable before any Telegram message")
with tempfile.TemporaryDirectory() as tmp:
    tmpp = Path(tmp)
    companies = write_companies(tmpp)
    sent = []
    summary = run(
        "@SALTRAI", [POST], str(companies), defer_send=True,
        pending_path=str(tmpp / "pending.json"), ledger_path=str(tmpp / "published.json"),
        seen_path=str(tmpp / "seen.json"),
        model_fn=stub_model(opportunity_json()),
        send_fn=lambda extracted, cid, post=None: sent.append(cid),
    )
    check("deferred run sends nothing before the git push", sent == [] and summary["sent"] == 0)
    check("deferred run reports the queued candidate", summary["queued"] == 1 and summary["candidate_ids"] == ["SALTRAI:5478"])
    check("queued candidate is already durable in pending state", "SALTRAI:5478" in load_pending(tmpp / "pending.json"))
    check("deferred candidate is marked for automatic delivery", delivery_status_of(load_pending(tmpp / "pending.json")["SALTRAI:5478"]) == DELIVERY_QUEUED)
    check("queued post is marked seen in the same transaction", load_seen(tmpp / "seen.json") == {"SALTRAI": [5478]})


print("\nrun: an opportunity already published under the same link is a duplicate, not re-sent")
with tempfile.TemporaryDirectory() as tmp:
    tmpp = Path(tmp)
    companies = write_companies(tmpp)
    sent = []
    summary = run(
        "@SALTRAI", [POST], str(companies),
        pending_path=str(tmpp / "pending.json"), ledger_path=str(tmpp / "published.json"),
        seen_path=str(tmpp / "seen.json"),
        # same applicationLink as SSCL, already on the site
        model_fn=stub_model(opportunity_json(company="SSCL", url="https://forms.office.com/pages/abc", type="coop")),
        send_fn=lambda extracted, cid, post=None: sent.append(cid),
    )
    check("nothing sent", sent == [])
    check("counted as a duplicate", summary["duplicate"] == 1)


print("\nrun: posts that aren't opportunities, or can't be published, are filtered out quietly")
with tempfile.TemporaryDirectory() as tmp:
    tmpp = Path(tmp)
    companies = write_companies(tmpp)
    paths = {"pending_path": str(tmpp / "p.json"), "ledger_path": str(tmpp / "l.json"), "seen_path": str(tmpp / "s.json")}

    sent = []
    s1 = run("@SALTRAI", [POST], str(companies),
             model_fn=stub_model(opportunity_json(is_opportunity=False, reason_excluded="paid course ad", type=None, company=None, url=None)),
             send_fn=lambda e, c, post=None: sent.append(c), **paths)
    check("a paid-course ad is not sent", sent == [] and s1["not_opportunity"] == 1)

    sent2 = []
    s2 = run("@SALTRAI", [{**POST, "message_id": 5479}], str(companies),
             model_fn=stub_model(opportunity_json(url=None, contact={"type": "whatsapp", "value": "+966531058202"})),
             send_fn=lambda e, c, post=None: sent2.append(c), **paths)
    check("a WhatsApp-only post is not sent", sent2 == [] and s2["unpublishable"] == 1)

    sent3 = []
    s3 = run("@SALTRAI", [{**POST, "message_id": 5480}], str(companies),
             model_fn=stub_model(opportunity_json(type="job")),
             send_fn=lambda e, c, post=None: sent3.append(c), **paths)
    check("a plain job posting is not sent", sent3 == [] and s3["unpublishable"] == 1)


print("\nrun: a post the model mangles is counted as failed, never guessed at")
with tempfile.TemporaryDirectory() as tmp:
    tmpp = Path(tmp)
    companies = write_companies(tmpp)
    sent = []
    model_calls = []
    summary = run(
        "@SALTRAI", [POST], str(companies),
        pending_path=str(tmpp / "p.json"), ledger_path=str(tmpp / "l.json"), seen_path=str(tmpp / "s.json"),
        model_fn=lambda prompt: model_calls.append(prompt) or "this isn't json at all",
        send_fn=lambda e, c, post=None: sent.append(c),
        extraction_attempts=2,
    )
    check("nothing sent", sent == [])
    check("counted as failed", summary["failed"] == 1)
    check("retried extraction before giving up", len(model_calls) == 2)
    check("failed extraction is not marked seen, so the next hourly run retries it", load_seen(tmpp / "s.json") == {})


print("\nas_plain_text: the dry-run preview is readable in a terminal")
sample = 'Name: A &amp; B\nLink: <a href="https://x.example.com/a">https://x.example.com/a</a>\n⚠️ check this'
plain = as_plain_text(sample)
check("link tags are unwrapped to just the URL", "https://x.example.com/a" in plain and "<a href" not in plain)
check("the URL isn't duplicated", plain.count("https://x.example.com/a") == 1)
check("escaped entities are turned back into real characters", "A & B" in plain)
check("no HTML tags remain at all", "<" not in plain and ">" not in plain)


print("\nrun --dry-run: sends nothing and writes nothing at all")
with tempfile.TemporaryDirectory() as tmp:
    tmpp = Path(tmp)
    companies = write_companies(tmpp)
    sent = []
    summary = run(
        "@SALTRAI", [POST], str(companies), dry_run=True,
        pending_path=str(tmpp / "pending.json"), ledger_path=str(tmpp / "published.json"),
        seen_path=str(tmpp / "seen.json"),
        model_fn=stub_model(opportunity_json()),
        send_fn=lambda e, c, post=None: sent.append(c),
    )
    check("reports what it would have sent", summary["sent"] == 1)
    check("but sent nothing", sent == [])
    check("wrote no pending file", not (tmpp / "pending.json").exists())
    check("wrote no seen file — a dry run must be repeatable", not (tmpp / "seen.json").exists())


passed = sum(results)
total = len(results)
print(f"\n{passed}/{total} checks passed")
if passed != total:
    raise SystemExit(1)

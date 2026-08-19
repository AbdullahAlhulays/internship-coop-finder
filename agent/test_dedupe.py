#!/usr/bin/env python3
"""Offline tests for dedupe.py, using real entries from the actual
site data (src/data/companies.js, inspected 2026-08-09) as fixtures.

No network, no files touched. Every existing_cards list below is a
real shape taken straight from the live data.

Run with:
    python test_dedupe.py
"""

from dedupe import decide

from _console import use_utf8_stdout

use_utf8_stdout()

results: list[bool] = []


def check(label: str, condition: bool) -> None:
    mark = "pass" if condition else "FAIL"
    print(f"  [{mark}] {label}")
    results.append(condition)


# Real existing entries, taken from the actual site data.
EXISTING = [
    {
        "name": "SSCL",
        "location": "Jeddah, Riyadh, Hail, Abha, and more, Saudi Arabia",
        "applicationLink": "https://forms.office.com/pages/responsepage.aspx?id=G-NK5HRE10mDWZBAkjxbRjie5pCmK0ZGje8cBLxmW8RUMUZTSzdYNVhKQVVaNk1UVkdaU0FGOVNMUS4u&route=shorturl",
        "type": "CO-OP Training",
        "addedAt": "2026-06-04T00:00:00+03:00",
    },
    {
        "name": "Saudi Water Authority | الهيئة السعودية للمياه",
        "location": "Many, Saudi Arabia",
        "applicationLink": "https://www.swa.gov.sa/ar/services/request-service/request-coop-training-program/coop-training",
        "deadline": "2026-05-18",
        "type": "CO-OP Training",
        "isClosed": True,
        "addedAt": "2026-05-14T00:00:00+03:00",
    },
    {
        "name": "Saudi Power Procurement Company (SPPC)",
        "location": "Riyadh, Saudi Arabia",
        "applicationLink": "https://www.linkedin.com/jobs/view/4412211034/",
        "type": "CO-OP Training",
        "requiresLetter": True,
        "addedAt": "2026-05-19T00:00:00+03:00",
    },
]


print("brand new company, no link matches anything")
d = decide(
    {"name": "New Company", "applicationLink": "https://newco.example.com/apply", "type": "Internship"},
    new_posted_at="2026-08-09T10:00:00+00:00",
    existing_cards=EXISTING,
    ledger={},
)
check("action is add", d.action == "add")


print("\nsame company name, but a genuinely different link (SSCL posts a second opening)")
d = decide(
    {"name": "SSCL", "applicationLink": "https://forms.office.com/pages/some-other-form-entirely", "type": "Internship"},
    new_posted_at="2026-08-09T10:00:00+00:00",
    existing_cards=EXISTING,
    ledger={},
)
check("different link -> added as a genuinely new card, not merged with the existing SSCL entry",
      d.action == "add")
check("no ambiguity/needs_review case exists anymore — exact-link matching removed the need for it",
      d.action in ("add", "update", "skip"))


print("\nexact same link seen again, existing has no deadline, new post has one")
d = decide(
    {"name": "SSCL", "applicationLink": EXISTING[0]["applicationLink"], "type": "CO-OP Training",
     "deadline": "2026-09-01"},
    new_posted_at="2026-08-09T10:00:00+00:00",
    existing_cards=EXISTING,
    ledger={},  # not in the ledger — hand-added or pre-dates the pipeline
    # deliberately: even with no ledger entry, filling a missing deadline is always safe
)
check("action is update", d.action == "update")
check("only the deadline changes", d.changes == {"deadline": "2026-09-01"})
check("existing_index points at SSCL (index 0)", d.existing_index == 0)


print("\nexact same link, existing has no description, new post provides verified text")
verified_description = {"en": "Role\nSupport the operations team."}
d = decide(
    {"name": "SSCL", "applicationLink": EXISTING[0]["applicationLink"], "type": "CO-OP Training",
     "description": verified_description},
    new_posted_at="2026-08-09T10:00:00+00:00",
    existing_cards=EXISTING,
    ledger={},
)
check("missing description can be safely filled", d.action == "update")
check("only the verified localized description changes", d.changes == {"description": verified_description})


print("\nexact same link, existing already has a deadline, no ledger entry (not a known repost)")
d = decide(
    {"name": "Saudi Water Authority | الهيئة السعودية للمياه",
     "applicationLink": EXISTING[1]["applicationLink"], "type": "CO-OP Training",
     "location": "Riyadh only, Saudi Arabia"},  # a "fresher" location, but unverifiable
    new_posted_at="2026-08-09T10:00:00+00:00",
    existing_cards=EXISTING,
    ledger={},  # no record this pipeline ever published this card
)
check("no ledger entry -> refuses to overwrite a possibly hand-curated card",
      d.action == "skip")


print("\nsame link, THIS TIME the ledger confirms the pipeline published it, and this post is newer")
d = decide(
    {"name": "Saudi Power Procurement Company (SPPC)",
     "applicationLink": EXISTING[2]["applicationLink"], "type": "CO-OP Training",
     "location": "Riyadh, Jeddah, Saudi Arabia"},  # role expanded to two cities
    new_posted_at="2026-08-09T10:00:00+00:00",
    existing_cards=EXISTING,
    ledger={EXISTING[2]["applicationLink"]: {"posted_at": "2026-05-19T00:00:00+00:00",
                                              "message_id": 111, "channel": "@example"}},
)
check("action is update, since the new post is confirmed newer", d.action == "update")
check("location gets refreshed", d.changes.get("location") == "Riyadh, Jeddah, Saudi Arabia")
check("applicationLink itself is never in the changes — must not be rewritten",
      "applicationLink" not in d.changes)
check("name is never in the changes either", "name" not in d.changes)


print("\nsame link, ledger says the existing post is actually NEWER than this one (an older repost surfaces late)")
d = decide(
    {"name": "Saudi Power Procurement Company (SPPC)",
     "applicationLink": EXISTING[2]["applicationLink"], "type": "CO-OP Training",
     "location": "Somewhere else"},
    new_posted_at="2026-01-01T00:00:00+00:00",  # older than the ledger's record
    existing_cards=EXISTING,
    ledger={EXISTING[2]["applicationLink"]: {"posted_at": "2026-05-19T00:00:00+00:00",
                                              "message_id": 111, "channel": "@example"}},
)
check("older post does not override a newer one", d.action == "skip")


print("\nsame link, ledger confirms it's newer, but nothing actually differs")
d = decide(
    {"name": "Saudi Power Procurement Company (SPPC)",
     "applicationLink": EXISTING[2]["applicationLink"], "type": "CO-OP Training",
     "location": None},  # extraction didn't find a location this time — must not blank it out
    new_posted_at="2026-08-09T10:00:00+00:00",
    existing_cards=EXISTING,
    ledger={EXISTING[2]["applicationLink"]: {"posted_at": "2026-05-19T00:00:00+00:00",
                                              "message_id": 111, "channel": "@example"}},
)
check("a None field never overwrites an existing value", d.action == "skip")


passed = sum(results)
total = len(results)
print(f"\n{passed}/{total} checks passed")
if passed != total:
    raise SystemExit(1)

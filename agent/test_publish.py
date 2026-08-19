#!/usr/bin/env python3
"""Offline tests for publish.py. No network, no real files touched --
everything runs against small fixture strings that mimic the real
App.jsx / companies.js structure. The only external dependency is
`node --check`, which is used to actually validate JS syntax rather
than just trusting the string-editing logic.

Run with:
    python test_publish.py
"""

from datetime import datetime, timezone, timedelta

from _console import use_utf8_stdout
from dedupe import Decision
from publish import (
    PublishError,
    apply_decision,
    bump_last_updated,
    format_last_updated,
    validate_js_syntax,
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
    except PublishError:
        check(label, True)


APP_JSX = '''import React from "react";
import { useState } from "react";

const LAST_UPDATED = "June 2, 2026";

function App() {
  return (
    <div>
      <p>Last updated: {LAST_UPDATED}</p>
    </div>
  );
}

export default App;
'''

COMPANIES_JS = '''export const companies = [
  {
    name: "SSCL",
    location: "Jeddah, Riyadh, Hail, Abha, and more, Saudi Arabia",
    applicationLink: "https://forms.office.com/pages/responsepage.aspx?id=abc",
    type: "CO-OP Training",
    addedAt: "2026-06-04T00:00:00+03:00",
  },
  {
    name: "Saudi Water Authority | الهيئة السعودية للمياه",
    location: "Many, Saudi Arabia",
    applicationLink: "https://www.swa.gov.sa/ar/services/request-service/request-coop-training-program/coop-training",
    deadline: "2026-05-18",
    type: "CO-OP Training",
    isClosed: true,
    addedAt: "2026-05-14T00:00:00+03:00",
  },
];
'''


# ------------------------------------------------------------- format

print("format_last_updated")
check(
    "single-digit day has no leading zero",
    format_last_updated(datetime(2026, 8, 9, 10, 0, tzinfo=timezone.utc)) == "August 9, 2026",
)
check(
    "double-digit day formats normally",
    format_last_updated(datetime(2026, 12, 21, 10, 0, tzinfo=timezone.utc)) == "December 21, 2026",
)
check(
    "UTC time near midnight rolls to the correct Riyadh-local date",
    # 2026-08-09 22:30 UTC = 2026-08-10 01:30 in Riyadh (UTC+3)
    format_last_updated(datetime(2026, 8, 9, 22, 30, tzinfo=timezone.utc)) == "August 10, 2026",
)


# ------------------------------------------------------ bump_last_updated

print("\nbump_last_updated")
today = datetime(2026, 8, 9, 10, 0, tzinfo=timezone.utc)
new_app_jsx = bump_last_updated(APP_JSX, today)
check("old date is gone", "June 2, 2026" not in new_app_jsx)
check("new date is present in the exact required format", 'const LAST_UPDATED = "August 9, 2026";' in new_app_jsx)
check("everything else in the file is untouched", new_app_jsx.replace("August 9, 2026", "June 2, 2026") == APP_JSX)

check_raises(
    "raises if the LAST_UPDATED line is missing entirely (renamed variable etc.)",
    lambda: bump_last_updated(APP_JSX.replace("LAST_UPDATED", "LAST_UPDATED_AT"), today),
)
check_raises(
    "raises if the line appears twice -- never guesses which one",
    lambda: bump_last_updated(APP_JSX + '\nconst LAST_UPDATED = "May 1, 2026";\n', today),
)


# ------------------------------------------------------------- add

print("\napply_decision: add")
new_card = {
    "name": "New Test Co",
    "applicationLink": "https://newtestco.example.com/apply",
    "type": "Internship",
    "location": "Riyadh, Saudi Arabia",
    "description": {"en": "Role\nSupport the engineering team."},
}
add_decision = Decision("add", "no existing card has this application link")
result = apply_decision(COMPANIES_JS, add_decision, new_card)
check("new card's link appears in the result", new_card["applicationLink"] in result)
check("both original cards are still present untouched", "SSCL" in result and "Saudi Water Authority" in result)
check("original SSCL block is byte-for-byte unchanged", '''  {
    name: "SSCL",
    location: "Jeddah, Riyadh, Hail, Abha, and more, Saudi Arabia",
    applicationLink: "https://forms.office.com/pages/responsepage.aspx?id=abc",
    type: "CO-OP Training",
    addedAt: "2026-06-04T00:00:00+03:00",
  },''' in result)
check("array still closes properly", result.rstrip().endswith("];"))
check("localized description is serialized into the new card",
      'description: {"en": "Role\\nSupport the engineering team."},' in result)

try:
    validate_js_syntax(result)
    check("result is valid JavaScript (node --check)", True)
except PublishError as e:
    check(f"result is valid JavaScript (node --check) -- {e}", False)


# ------------------------------------------------------------ update

print("\napply_decision: update (fill in a missing deadline)")
sscl_card = {"name": "SSCL", "applicationLink": "https://forms.office.com/pages/responsepage.aspx?id=abc", "type": "CO-OP Training"}
fill_decision = Decision("update", "existing card has no deadline, this post has one", existing_index=0, changes={"deadline": "2026-09-01"})
result = apply_decision(COMPANIES_JS, fill_decision, sscl_card)
check("new deadline line was inserted", 'deadline: "2026-09-01",' in result)
check("SWA's unrelated deadline is untouched", 'deadline: "2026-05-18",' in result)
check("SSCL's name/link are unchanged", 'name: "SSCL"' in result and "id=abc" in result)
check("SWA card is completely untouched", "isClosed: true," in result and "addedAt: \"2026-05-14T00:00:00+03:00\"," in result)

try:
    validate_js_syntax(result)
    check("result is valid JavaScript (node --check)", True)
except PublishError as e:
    check(f"result is valid JavaScript (node --check) -- {e}", False)


print("\napply_decision: update (refresh an existing field)")
swa_card = {
    "name": "Saudi Water Authority | الهيئة السعودية للمياه",
    "applicationLink": "https://www.swa.gov.sa/ar/services/request-service/request-coop-training-program/coop-training",
    "type": "Internship / CO-OP Training",
}
refresh_decision = Decision(
    "update", "a newer repost of this exact posting has different details",
    existing_index=1, changes={"type": "Internship / CO-OP Training"},
)
result = apply_decision(COMPANIES_JS, refresh_decision, swa_card)
check("type value was updated in place", 'type: "Internship / CO-OP Training",' in result)
check("old type value is gone from the SWA object", result.count('type: "CO-OP Training",') == 1)  # only SSCL's remains
check("SWA's deadline/location/addedAt are untouched", 'deadline: "2026-05-18",' in result and 'addedAt: "2026-05-14T00:00:00+03:00",' in result)

try:
    validate_js_syntax(result)
    check("result is valid JavaScript (node --check)", True)
except PublishError as e:
    check(f"result is valid JavaScript (node --check) -- {e}", False)


print("\nsafety guards")
check_raises(
    "refuses to apply a 'skip' decision",
    lambda: apply_decision(COMPANIES_JS, Decision("skip", "nothing new"), sscl_card),
)
check_raises(
    "refuses a decision that (by some bug upstream) tries to change applicationLink",
    lambda: apply_decision(
        COMPANIES_JS,
        Decision("update", "bad", existing_index=0, changes={"applicationLink": "https://evil.example.com"}),
        sscl_card,
    ),
)
check_raises(
    "refuses a decision that tries to change name",
    lambda: apply_decision(
        COMPANIES_JS,
        Decision("update", "bad", existing_index=0, changes={"name": "Renamed Co"}),
        sscl_card,
    ),
)
check_raises(
    "raises rather than guessing when the array declaration appears twice",
    lambda: apply_decision(COMPANIES_JS + "\nconst companies = [];\n", add_decision, new_card),
)
check_raises(
    "raises when the target applicationLink can't be found for an update",
    lambda: apply_decision(
        COMPANIES_JS,
        Decision("update", "bad", existing_index=0, changes={"deadline": "2026-09-01"}),
        {"name": "Ghost Co", "applicationLink": "https://does-not-exist.example.com", "type": "Internship"},
    ),
)


print("\nvalidate_js_syntax")
check_raises(
    "raises on deliberately broken JS (unbalanced brace)",
    lambda: validate_js_syntax("export const companies = [ { name: 'X' "),
)
try:
    validate_js_syntax(COMPANIES_JS)
    check("accepts the real fixture as valid JS", True)
except PublishError:
    check("accepts the real fixture as valid JS", False)


passed = sum(results)
total = len(results)
print(f"\n{passed}/{total} checks passed")
if passed != total:
    raise SystemExit(1)

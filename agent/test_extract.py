#!/usr/bin/env python3
"""Offline tests for extract.py, using Abood's real channel posts.

No network call, no API key, no cost. A stand-in function plays the
role of the AI model: for each real post below, it returns exactly the
JSON a good extraction should produce, hand-written by reading the
post. The test then checks that extract_opportunity() parses,
validates, and routes that JSON correctly.

This proves the *pipeline* around the model is correct: schema
checking, the contact-vs-url logic, the confidence routing, and the
dead-letter path for bad output. It does not prove the *model* is
accurate — that needs a real token and real calls, see TOKEN_SETUP.md
and the note about golden.json at the bottom of this file.

Run with:
    python test_extract.py
"""

import json
import os
from dataclasses import replace

import extract as extract_module
from extract import ModelError, ValidationError, extract_opportunity, to_card

from _console import use_utf8_stdout

use_utf8_stdout()


def stub(response_json: dict):
    """Build a model_fn that always returns this one canned reply."""
    response_json = {"description": None, **response_json}
    def _fn(prompt: str) -> str:
        return json.dumps(response_json, ensure_ascii=False)
    return _fn


def stub_raw(response_text: str):
    """Same, but for testing malformed/non-JSON replies."""
    def _fn(prompt: str) -> str:
        return response_text
    return _fn


results: list[bool] = []


def check(label: str, condition: bool) -> None:
    mark = "pass" if condition else "FAIL"
    print(f"  [{mark}] {label}")
    results.append(condition)


# ---------------------------------------------------------------------
# Real post #5475 — a paid certification course being advertised.
# Registration fee, "seats limited" as a sales pitch, a marketing
# site. Not a job or internship from an employer. Should be excluded.
# ---------------------------------------------------------------------

POST_5475 = (
    "حوّل خبرتك المهنية إلى مسار احترافي في التدريب والتقييم 🎓\n"
    "برنامج المدرب والمقيّم المهني لمدة 6 أسابيع، يجمع بين المؤهلات "
    "البريطانية، والتطبيق العملي، والإرشاد المهني.\n"
    "التسجيل مفتوح الآن، والمقاعد محدودة.\n"
    "للتفاصيل والتقديم:\n"
    "https://cadremy.info"
)

print("post #5475 — paid course ad, should be excluded")
result = extract_opportunity(
    POST_5475,
    posted_at="2026-08-07T11:15:16+00:00",
    links=["https://cadremy.info/", "https://cadremy.info"],
    model_fn=stub({
        "is_opportunity": False,
        "reason_excluded": "paid certification course advertisement, not an employer posting",
        "type": None, "company": None, "title": None, "url": None, "contact": None,
        "requires_letter": False,
        "deadline": None, "deadline_raw": None, "location": None,
        "confidence": 0.9, "evidence": {},
    }),
)
check("marked as not an opportunity", result.is_opportunity is False)
check("has a reason", bool(result.reason_excluded))
check("routes to skip", result.route == "skip")


# ---------------------------------------------------------------------
# Real post #5476 — a real co-op posting with NO link, only a
# WhatsApp number to send a CV to. Must not be dropped for lacking a
# url; must end up in the contact field instead, with the local Saudi
# number normalized to international form.
# ---------------------------------------------------------------------

POST_5476 = (
    "إعلان تدريب تعاوني\n"
    "تعلن شركة متخصصة في إدارة وتشغيل مرافق الضيافة السياحية بالرياض عن "
    "توفر فرص تدريب تعاوني للطلاب والطالبات...\n"
    "طريقة التقديم:\n"
    "إرسال السيرة الذاتية وخطاب التدريب التعاوني عبر الواتساب:\n"
    "0531058202"
)

print("\npost #5476 — whatsapp-only application, no real link")
result = extract_opportunity(
    POST_5476,
    posted_at="2026-08-07T11:15:16+00:00",
    links=[],
    model_fn=stub({
        "is_opportunity": True,
        "reason_excluded": None,
        "type": "coop",
        "company": "Tourism hospitality facilities company, Riyadh",
        "title": "Cooperative training — tourism, sales, HR, marketing, IT",
        "url": None,
        "contact": {"type": "whatsapp", "value": "+966531058202"},
        # the post explicitly asks for "خطاب التدريب التعاوني" — a
        # letter from the university. This is what requires_letter
        # exists to catch.
        "requires_letter": True,
        "deadline": None, "deadline_raw": None,
        "location": "Riyadh, Saudi Arabia",
        "confidence": 0.8,
        "evidence": {"location": "بالرياض"},
    }),
)
# Decision (2026-08-09): a WhatsApp/email contact is not treated as a
# usable application link. It's still captured on the result — useful
# if you're scanning what got skipped and why — but it never becomes
# a published card. No wa.me link gets invented as a substitute.
check("still recognized as a genuine opportunity", result.is_opportunity is True)
check("url stays null — no link was ever in the post", result.url is None)
check("contact is still captured, for visibility only", result.contact is not None)
check("phone normalized to international form",
      result.contact["value"] == "+966531058202")
check("letter requirement detected from the post text", result.requires_letter is True)
check("no usable link -> routes to skip, not published", result.route == "skip")


# ---------------------------------------------------------------------
# Real post #5477 — hashtags only, no sentence, no link. Nothing to
# extract. Should be excluded, not sent to the model's imagination.
# ---------------------------------------------------------------------

POST_5477 = "#تدريب #تعاوني #تدريب_تعاوني #الاحساء #تسويق"

print("\npost #5477 — hashtags only, no real content")
result = extract_opportunity(
    POST_5477,
    posted_at="2026-08-07T12:01:04+00:00",
    links=[],
    model_fn=stub({
        "is_opportunity": False,
        "reason_excluded": "hashtags only, no real content",
        "type": None, "company": None, "title": None, "url": None, "contact": None,
        "requires_letter": False,
        "deadline": None, "deadline_raw": None, "location": None,
        "confidence": 0.95, "evidence": {},
    }),
)
check("excluded", result.is_opportunity is False)
check("routes to skip", result.route == "skip")


# ---------------------------------------------------------------------
# Real post #5478 — a Google Form link plus hashtags. The company
# short name and the city only appear as hashtags, never as a
# sentence. Lower confidence expected, since it's inferred rather
# than stated outright — should land in needs-eyes, not auto-publish.
# ---------------------------------------------------------------------

POST_5478 = (
    "https://docs.google.com/forms/d/e/1FAIpQLSd28TF29Dt5-HnR-DUeC_4vN1MZRAArF1ssCwNTysLrFF_YOw/viewform\n"
    "#تدريب_تعاوني #اساس #تسويق #اعلام #الاحساء #تعاوني"
)

print("\npost #5478 — form link, metadata only in hashtags")
result = extract_opportunity(
    POST_5478,
    posted_at="2026-08-07T12:01:12+00:00",
    links=["https://docs.google.com/forms/d/e/1FAIpQLSd28TF29Dt5-HnR-DUeC_4vN1MZRAArF1ssCwNTysLrFF_YOw/viewform"],
    model_fn=stub({
        "is_opportunity": True,
        "reason_excluded": None,
        "type": "coop",
        "company": "Asas",
        "title": "Cooperative training — marketing / media",
        "url": "https://docs.google.com/forms/d/e/1FAIpQLSd28TF29Dt5-HnR-DUeC_4vN1MZRAArF1ssCwNTysLrFF_YOw/viewform",
        "contact": None,
        "requires_letter": False,
        "deadline": None, "deadline_raw": None,
        "location": "Al-Ahsa, Saudi Arabia",
        "confidence": 0.72,
        "evidence": {"company": "#اساس", "location": "#الاحساء"},
    }),
)
check("form link kept as the application url", result.url is not None)
check("company pulled from a hashtag, not invented", result.company == "Asas")
check("borderline confidence routes to needs-eyes, not auto-publish",
      result.route == "needs-eyes")


# ---------------------------------------------------------------------
# Real post #5479 — a government survey link. Organization name only
# appears as a hashtag (#وزارة_النقل). No deadline stated, as usual.
# ---------------------------------------------------------------------

POST_5479 = (
    "https://surveys.mot.gov.sa/s/57BF26102AB544F9BE5181ED4CE4D776\n"
    "#وزارة_النقل #تدريب_تعاوني #طلاب_الجامعة #طلاب #تدريب"
)

print("\npost #5479 — ministry link, org name only in hashtag")
result = extract_opportunity(
    POST_5479,
    posted_at="2026-08-07T12:02:59+00:00",
    links=["https://surveys.mot.gov.sa/s/57BF26102AB544F9BE5181ED4CE4D776"],
    model_fn=stub({
        "is_opportunity": True,
        "reason_excluded": None,
        "type": "coop",
        "company": "Ministry of Transport",
        "title": "Cooperative training — Ministry of Transport",
        "url": "https://surveys.mot.gov.sa/s/57BF26102AB544F9BE5181ED4CE4D776",
        "contact": None,
        "requires_letter": False,
        "deadline": None, "deadline_raw": None,
        "location": None,
        "confidence": 0.75,
        "evidence": {"company": "#وزارة_النقل"},
    }),
)
check("deadline stays null, not guessed", result.deadline is None)
check("routes to needs-eyes", result.route == "needs-eyes")


# ---------------------------------------------------------------------
# A real Groq run on this exact post first tagged type "training"
# instead of "internship" — "تدريب صيفي" (summer training) at a named
# employer is standard Gulf phrasing for an internship program, not a
# paid course. Locking in the correct answer here so the fix to the
# prompt can't silently regress.
# ---------------------------------------------------------------------

POST_ARAMCO = "فرصة تدريب صيفي في شركة أرامكو، الظهران. آخر موعد ١٥ سبتمبر. https://careers.aramco.com/job/12345"

print("\npost — 'تدريب صيفي' at a named employer, should be internship not training")
result = extract_opportunity(
    POST_ARAMCO,
    posted_at="2026-08-05T09:00:00+00:00",
    links=["https://careers.aramco.com/job/12345"],
    model_fn=stub({
        "is_opportunity": True, "reason_excluded": None,
        "type": "internship",
        "company": "أرامكو", "title": "فرصة تدريب صيفي",
        "url": "https://careers.aramco.com/job/12345", "contact": None,
        "requires_letter": False,
        "deadline": "2026-09-15", "deadline_raw": "١٥ سبتمبر",
        "location": "الظهران", "confidence": 0.9,
        "evidence": {"company": "شركة أرامكو", "deadline": "آخر موعد ١٥ سبتمبر", "location": "الظهران"},
    }),
)
check("typed as internship, not training", result.type == "internship")
check("deadline converted to ISO with the right year", result.deadline == "2026-09-15")
check("routes to publish", result.route == "publish")

# Corrected 2026-08-09 after inspecting the real site: isClosed is
# NEVER set by the pipeline. The site computes open/closed live from
# `deadline` on every render — no scheduled job needed, and setting it
# here would just be redundant with what the app already does itself.
card = to_card(result, added_at="2026-08-09T10:00:00+03:00")
check("card: no isClosed key at all", "isClosed" not in card)
check("card: internship maps to plain 'Internship' label", card["type"] == "Internship")
check("card: name maps from company", card["name"] == result.company)
check("card: applicationLink maps from url", card["applicationLink"] == result.url)
check("card: addedAt carried through in Riyadh-offset ISO form",
      card["addedAt"] == "2026-08-09T10:00:00+03:00")

card_no_addedat = to_card(result)
check("card: addedAt omitted (not null) when not given", "addedAt" not in card_no_addedat)

# The site's own validator treats a null deadline as a type error and
# rejects the ENTIRE payload, not just one card — so a missing
# deadline must be an absent key, never deadline: null.
card_no_deadline = to_card(replace(result, deadline=None))
check("card: missing deadline is OMITTED, never emitted as null",
      "deadline" not in card_no_deadline)
check("card: requiresLetter omitted when false, matching real file style",
      "requiresLetter" not in card_no_deadline)
check("card: missing description is omitted rather than invented",
      "description" not in card_no_deadline)


print("\npost with explicit English description — preserve verified source text")
POST_WITH_DESCRIPTION = (
    "Acme is offering a cooperative internship in Riyadh.\n"
    "Role\nBuild weekly dashboards from operational data.\n\n"
    "Requirements\n• Current university student\n• Familiarity with Python\n"
    "Apply: https://example.com/acme-coop"
)
verified_description = (
    "Role\nBuild weekly dashboards from operational data.\n\n"
    "Requirements\n• Current university student\n• Familiarity with Python"
)
result_with_description = extract_opportunity(
    POST_WITH_DESCRIPTION,
    posted_at="2026-08-19T12:00:00+03:00",
    links=["https://example.com/acme-coop"],
    model_fn=stub({
        "is_opportunity": True, "reason_excluded": None,
        "type": "coop", "company": "Acme", "title": "Cooperative internship",
        "description": {"en": verified_description, "ar": None},
        "url": "https://example.com/acme-coop", "contact": None,
        "requires_letter": False, "deadline": None, "deadline_raw": None,
        "location": "Riyadh, Saudi Arabia", "confidence": 0.95,
        "evidence": {"description": verified_description},
    }),
)
check("explicit description is kept in its source language",
      result_with_description.description == {"en": verified_description})
description_card = to_card(result_with_description)
check("localized description reaches the site card",
      description_card["description"] == {"en": verified_description})


# ---------------------------------------------------------------------
# A genuinely low-confidence real result — same #5478 post, but
# imagine the model was much less sure. This should go to
# deadletter.json, not to a PR, per the routing table in the plan.
# ---------------------------------------------------------------------

print("\nlow-confidence result — should route to deadletter, not a PR")
result = extract_opportunity(
    POST_5478,
    posted_at="2026-08-07T12:01:12+00:00",
    links=["https://docs.google.com/forms/d/e/1FAIpQLSd28TF29Dt5-HnR-DUeC_4vN1MZRAArF1ssCwNTysLrFF_YOw/viewform"],
    model_fn=stub({
        "is_opportunity": True, "reason_excluded": None,
        "type": "coop", "company": "Asas", "title": "Cooperative training",
        "url": "https://docs.google.com/forms/d/e/1FAIpQLSd28TF29Dt5-HnR-DUeC_4vN1MZRAArF1ssCwNTysLrFF_YOw/viewform",
        "contact": None, "requires_letter": False,
        "deadline": None, "deadline_raw": None, "location": None,
        "confidence": 0.5, "evidence": {},
    }),
)
check("under 0.70 routes to deadletter", result.route == "deadletter")


# ---------------------------------------------------------------------
# Broken-output cases. These prove bad model output gets rejected
# instead of publishing something malformed.
# ---------------------------------------------------------------------

print("\nbroken output — not valid json at all")
try:
    extract_opportunity("some post", model_fn=stub_raw("I think this is an internship!"))
    check("raised ValidationError", False)
except ValidationError:
    check("raised ValidationError", True)


print("\nGroq 429 response exposes the provider's exact retry delay")


class RateLimitResponse:
    status_code = 429
    headers = {"retry-after": "17.25"}
    ok = False
    text = "rate limited"


original_post = extract_module.requests.post
original_key = os.environ.get("GROQ_API_KEY")
try:
    os.environ["GROQ_API_KEY"] = "test-only-key"
    extract_module.requests.post = lambda *args, **kwargs: RateLimitResponse()
    try:
        extract_module.call_model("test prompt")
        check("429 raises ModelError", False)
    except ModelError as exc:
        check("429 raises ModelError", True)
        check("Retry-After is preserved as seconds", exc.retry_after_seconds == 17.25)
finally:
    extract_module.requests.post = original_post
    if original_key is None:
        os.environ.pop("GROQ_API_KEY", None)
    else:
        os.environ["GROQ_API_KEY"] = original_key


print("\nGroq transport failures become retryable pipeline errors")
original_post = extract_module.requests.post
original_key = os.environ.get("GROQ_API_KEY")
try:
    os.environ["GROQ_API_KEY"] = "test-only-key"

    def raise_timeout(*args, **kwargs):
        raise extract_module.requests.Timeout("temporary timeout")

    extract_module.requests.post = raise_timeout
    try:
        extract_module.call_model("test prompt")
        check("network timeout raises ModelError", False)
    except ModelError as exc:
        check("network timeout raises ModelError", True)
        check("network error is safe to show in logs", "Could not reach Groq" in str(exc))
finally:
    extract_module.requests.post = original_post
    if original_key is None:
        os.environ.pop("GROQ_API_KEY", None)
    else:
        os.environ["GROQ_API_KEY"] = original_key

print("\nbroken output — missing required keys")
try:
    extract_opportunity("some post", model_fn=stub({"is_opportunity": True}))
    check("raised ValidationError", False)
except ValidationError:
    check("raised ValidationError", True)

print("\nbroken output — invalid type enum value")
try:
    extract_opportunity("some post", model_fn=stub({
        "is_opportunity": True, "reason_excluded": None,
        "type": "part-time-remote-hybrid",  # not a real value
        "company": "X", "title": "Y", "url": "https://example.com",
        "contact": None, "requires_letter": False,
        "deadline": None, "deadline_raw": None,
        "location": None, "confidence": 0.9, "evidence": {},
    }))
    check("raised ValidationError", False)
except ValidationError:
    check("raised ValidationError", True)

print("\nbroken output — description is not a localized en/ar object")
try:
    extract_opportunity("some post", model_fn=stub({
        "is_opportunity": True, "reason_excluded": None,
        "type": "internship", "company": "X", "title": "Y",
        "description": "invented plain text",
        "url": "https://example.com", "contact": None, "requires_letter": False,
        "deadline": None, "deadline_raw": None,
        "location": None, "confidence": 0.9, "evidence": {},
    }))
    check("raised ValidationError", False)
except ValidationError:
    check("raised ValidationError", True)

print("\nnot broken — opportunity with neither url nor contact is valid data now, just unpublishable")
result = extract_opportunity("some post", model_fn=stub({
    "is_opportunity": True, "reason_excluded": None,
    "type": "internship", "company": "X", "title": "Y",
    "url": None, "contact": None, "requires_letter": False,
    "deadline": None, "deadline_raw": None,
    "location": None, "confidence": 0.9, "evidence": {},
}))
check("no longer a validation error (was, before the skip-if-no-link change)", True)
check("routes to skip — nothing to publish, but not malformed data", result.route == "skip")

# Confirmed 2026-08-09: the real site has exactly 3 type values, no
# "Job" and no bare "Training" — this site is internship/co-op only.
# The prompt is told to exclude plain job postings via is_opportunity,
# but this is the code-level backstop in case the model still tags
# something "job" despite that instruction.
print("\na 'job'-typed result is out of scope for this site — must not be published even with a real link")
result = extract_opportunity("some post", model_fn=stub({
    "is_opportunity": True, "reason_excluded": None,
    "type": "job", "company": "X", "title": "Y",
    "url": "https://example.com/careers/123", "contact": None, "requires_letter": False,
    "deadline": None, "deadline_raw": None,
    "location": None, "confidence": 0.95, "evidence": {},
}))
check("job type has no valid display string on this site", result.type == "job")
check("routes to skip despite a real link and high confidence", result.route == "skip")

print("\nbroken output — deadline not in YYYY-MM-DD (this is what a real Groq call hit on 2026-08-09,")
print("because the prompt never specified the required format — fixed in the prompt, this pipeline-level")
print("check is the backstop for whenever the model still slips)")
try:
    extract_opportunity("some post", model_fn=stub({
        "is_opportunity": True, "reason_excluded": None,
        "type": "internship", "company": "X", "title": "Y",
        "url": "https://example.com", "contact": None, "requires_letter": False,
        "deadline": "15 September", "deadline_raw": "١٥ سبتمبر",
        "location": None, "confidence": 0.9, "evidence": {},
    }))
    check("raised ValidationError", False)
except ValidationError as exc:
    check("raised ValidationError", True)
    check("error message shows the actual bad value, not just the rule name", "15 September" in str(exc))
    check("error message also surfaces deadline_raw, for diagnosing why", "سبتمبر" in str(exc))

print("\nbroken output — opportunity with no company name")
try:
    extract_opportunity("some post", model_fn=stub({
        "is_opportunity": True, "reason_excluded": None,
        "type": "internship", "company": None, "title": "Y",
        "url": "https://example.com", "contact": None, "requires_letter": False,
        "deadline": None, "deadline_raw": None,
        "location": None, "confidence": 0.9, "evidence": {},
    }))
    check("raised ValidationError", False)
except ValidationError:
    check("raised ValidationError", True)


# ---------------------------------------------------------------------

passed = sum(results)
total = len(results)
print(f"\n{passed}/{total} checks passed")

if passed != total:
    raise SystemExit(1)

print(
    "\nThese checks confirm the pipeline handles your real posts correctly\n"
    "IF the model returns good JSON. They do not test the model itself.\n"
    "Once you have a GROQ_API_KEY set (see TOKEN_SETUP.md), run extract.py\n"
    "on real posts and compare its answers to what you'd have written by\n"
    "hand — that is the accuracy test described as Phase 2 in the plan."
)

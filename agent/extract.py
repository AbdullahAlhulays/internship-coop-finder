#!/usr/bin/env python3
"""Turn one messy Telegram post into clean structured fields.

Step 2 of the opportunity agent. This is the only file in the whole
system that talks to an AI model, and its job is narrow on purpose:
messy text in, one JSON object out. It does not decide what gets
published, does not touch GitHub, and does not compare posts against
each other. That happens in later steps.

Every call to the model goes through call_model(), one function. If
you switch provider later (Gemini, paid Claude, whatever's free next
year), that is the only place you change. It's already been swapped
once — this originally called GitHub Models, which shut down entirely
on 2026-07-30. Now it calls Groq, which is free, fast, and unrelated
to GitHub. If Groq ever goes away too, this function is what you fix.

Usage:
    # one post from the command line, useful for trying the prompt
    python extract.py --text "..." --posted-at 2026-08-07T12:00:00+00:00

    # a whole channel dump from fetch_posts.py --json
    python fetch_posts.py your_channel --json > posts.json
    python extract.py --file posts.json

Needs a free Groq API key in the GROQ_API_KEY environment variable.
See TOKEN_SETUP.md.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any

from _console import use_utf8_stdout

use_utf8_stdout()

try:
    import requests
except ImportError:
    sys.exit("Missing library. Install it first:\n    pip install -r requirements.txt")


# ---------------------------------------------------------------- provider

# Groq: fast, free tier, no credit card. If this ever needs to change
# again, everything provider-specific lives in this block and in
# call_model() / list_models() below — nothing else in the file
# touches the network.
CHAT_URL = "https://api.groq.com/openai/v1/chat/completions"
CATALOG_URL = "https://api.groq.com/openai/v1/models"
# openai/gpt-oss-20b supports the JSON response mode used by the extractor.
# If it stops working, run: python extract.py --list-models
DEFAULT_MODEL = os.environ.get("EXTRACT_MODEL", "openai/gpt-oss-20b")
REQUEST_TIMEOUT = 30


class ModelError(RuntimeError):
    """The provider could not be reached or refused the request."""

    def __init__(self, message: str, retry_after_seconds: float | None = None):
        super().__init__(message)
        self.retry_after_seconds = retry_after_seconds


def _auth_headers() -> dict:
    key = os.environ.get("GROQ_API_KEY")
    if not key:
        raise ModelError(
            "GROQ_API_KEY is not set. See TOKEN_SETUP.md for how to create one — "
            "it's free, takes about a minute, no credit card."
        )
    return {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}


def call_model(prompt: str) -> str:
    """Send one prompt to Groq, return the raw text reply.

    This is the only function in the codebase that talks to an AI
    provider. Everything else works with plain Python data. Swapping
    providers again later means rewriting this one function and
    list_models() below, nothing else.
    """
    try:
        response = requests.post(
            CHAT_URL,
            headers=_auth_headers(),
            json={
                "model": DEFAULT_MODEL,
                "temperature": 0,
                "response_format": {"type": "json_object"},
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": prompt},
                ],
            },
            timeout=REQUEST_TIMEOUT,
        )
    except requests.RequestException as exc:
        raise ModelError(f"Could not reach Groq: {exc}") from exc

    if response.status_code == 401:
        raise ModelError("Groq rejected the API key. Check it was copied correctly and hasn't been revoked.")
    if response.status_code == 429:
        retry_after = None
        try:
            retry_after = float(response.headers.get("retry-after", ""))
            if retry_after < 0:
                retry_after = None
        except (TypeError, ValueError):
            retry_after = None
        delay_text = f" Retry after {retry_after:g} seconds." if retry_after is not None else ""
        raise ModelError(
            "Rate limit hit. Groq's free tier is generous but not infinite."
            f"{delay_text}",
            retry_after_seconds=retry_after,
        )
    if response.status_code in (404, 410):
        raise ModelError(
            f"Model {DEFAULT_MODEL!r} is not available (HTTP {response.status_code}). "
            "Run this to see what's currently live:\n"
            "    python extract.py --list-models\n"
            'Then: $env:EXTRACT_MODEL = "the-id-you-found"'
        )
    if not response.ok:
        raise ModelError(f"Groq returned HTTP {response.status_code}: {response.text[:300]}")

    data = response.json()
    return data["choices"][0]["message"]["content"]


def list_models() -> None:
    """Print every model id Groq currently serves.

    Use this whenever DEFAULT_MODEL starts failing with 404/410.
    Providers retire models (or entire products — see the top of this
    file) without much warning, so this asks the live API instead of
    trusting a name written down in code.
    """
    response = requests.get(CATALOG_URL, headers=_auth_headers(), timeout=REQUEST_TIMEOUT)
    response.raise_for_status()
    models = response.json().get("data", [])

    print(f"{len(models)} models available:\n")
    for m in sorted(models, key=lambda m: (m.get("owned_by", ""), m.get("id", ""))):
        print(f"  {m.get('id', '?'):40s} {m.get('owned_by', '?')}")
    print('\nSet one with:\n    $env:EXTRACT_MODEL = "the-id-you-picked"')


# ---------------------------------------------------------------- prompt

# The rules below exist because of specific real posts, not guesses:
#
#   - deadlines are usually absent entirely -> null is the normal case,
#     never invent one
#   - some posts have no application link at all, only a WhatsApp
#     number to send a CV to -> that still counts, captured separately
#   - some posts are paid courses or certificate programs being
#     advertised, not a job or internship from an employer -> excluded
#   - a post that is only hashtags with no sentence, or a repost of an
#     ad, carries nothing usable -> excluded
#   - the company name and city are sometimes only in the hashtags,
#     never written as a sentence -> hashtags must be read as data,
#     not stripped as noise

SYSTEM_PROMPT = """You extract structured data from Telegram posts about
student opportunities. Posts are in Arabic, English, or a mix, and are
often informal: emoji, hashtags, incomplete sentences, WhatsApp numbers
instead of links.

Return ONLY a single JSON object, no other text, matching this shape:

{
  "is_opportunity": boolean,
  "reason_excluded": string or null,
  "type": "internship" | "coop" | "internship_or_coop" | "job" | "training" | null,
  "company": string or null,
  "title": string or null,
  "url": string or null,
  "contact": {"type": "whatsapp" | "phone" | "email", "value": string} or null,
  "requires_letter": boolean,
  "deadline": "YYYY-MM-DD" string (this exact format, nothing else) or null,
  "deadline_raw": string or null,
  "location": string or null,
  "confidence": number,
  "evidence": {"company": string or null, "deadline": string or null, "location": string or null}
}

Rules, in order of importance:

1. is_opportunity is false for: paid courses or certification programs
   being advertised (registration fees, "seats limited" as a sales
   pitch); posts that are only hashtags or emoji with no real content;
   general news, greetings, or reposted ads unrelated to a specific
   opening; a plain full-time job posting with no internship/co-op
   framing at all (this site covers internships and co-op training
   only, not general employment). Set reason_excluded to a short
   phrase explaining why, and leave the other fields null.

2. Do not classify type by the literal word "تدريب" alone — it is
   used loosely in Arabic postings and does not mean the "training"
   category by default. Use these mappings:
     - "تدريب صيفي" (summer training) at a named employer -> internship
     - "تدريب تعاوني" (cooperative training) -> coop
     - just "تدريب" with no qualifier making it clear which one -> internship_or_coop
     - a genuine full-time job/employment posting ("وظيفة" / "دوام")
       with no internship or co-op angle -> this is not an opportunity
       for this site, set is_opportunity: false per rule 1 above
     - a paid course or certification -> also not is_opportunity per
       rule 1

3. Never invent a deadline. If no deadline is stated in the text,
   deadline and deadline_raw are both null. Most real posts have no
   deadline at all — that is normal, not a failure.

   When a deadline IS stated, deadline must be exactly "YYYY-MM-DD"
   (Gregorian calendar), never any other format, and never the raw
   wording — put the raw wording in deadline_raw instead, unchanged
   except for digit normalization (rule 10).

   Posts very often give only a day and month with no year (e.g.
   "آخر موعد ١٥ سبتمبر" / "deadline: Sept 15") — you must still
   resolve this to a full YYYY-MM-DD. A deadline is always in the
   future relative to when the post was published, so: if that
   day/month has not yet happened in the same year as the post's
   published date, use that year; if it has already passed by the
   post's published date, it must mean next year — use that instead.

   If you cannot confidently resolve a full YYYY-MM-DD date (a vague
   phrase like "قريباً" / "soon", or a range with no clear end date),
   leave deadline null and keep whatever was said in deadline_raw.
   Never output a deadline value that is not exactly YYYY-MM-DD —
   null is always safer than a wrong or malformed date.

4. If there is no application link but a phone number or WhatsApp
   number is given to send a CV to, set url to null and fill contact
   instead. Normalize a Saudi local number (starts with 0, 10 digits)
   to international form: 0531058202 becomes +966531058202.

5. If several links appear, prefer the one described as the actual
   application (a form, a portal, "للتقديم") over a generic homepage.

6. Hashtags carry real information here. A hashtag like #الاحساء is a
   location. A hashtag naming an organization is the company. Read
   them the same as you would a sentence.

7. Company name formatting — this matters, match these patterns
   exactly:
     - a globally or regionally known brand name -> use the English
       brand name alone, even if the post is in Arabic:
       "SDAIA", "SAP", "PwC", "Mobily", "Deloitte", "FedEx", "Bosch"
     - a government ministry, agency, or org with both a known English
       name and an Arabic name -> "English Name | Arabic Name":
       "Ministry of Justice | وزارة العدل"
       "Saudi Space Agency | وكالة الفضاء السعودية"
       "SAMI | الشركة السعودية للصناعات العسكرية"
     - a smaller local company with a plausible English transliteration
       -> "Transliteration | Arabic Name":
       "Soudah Development | السودة للتطوير"
       "CEREBRA | سيريبرا"
     - a small local entity with no sensible English name -> keep the
       Arabic name as written, do not force a translation:
       "مركز الملك فهد للبحوث الطبية"
     - never invent a company name that is not in the text; if none is
       given, use the best short description available (for example
       "Tourism hospitality company, Riyadh")

8. Location formatting — always translate to English, "City, Country"
   (or "City, Saudi Arabia" for Saudi cities), matching this exact
   style even when the post is in Arabic: "الظهران" -> "Dhahran, Saudi
   Arabia", "الرياض" -> "Riyadh, Saudi Arabia". Use "Remote" alone if
   the post says the role is remote. Leave null if no location is
   given anywhere, including hashtags.

9. requires_letter is true only if the post explicitly asks for a
   letter, proof of enrollment, or similar document from the
   applicant's university (Arabic: "خطاب تدريب", "خطاب من الجهة
   التعليمية", "إثبات قيد", "شهادة قيد"; English: "letter from your
   university", "enrollment letter", "proof of registration"). If
   nothing like this is mentioned, requires_letter is false — do not
   assume it is required just because the post is about a co-op.

10. Normalize Arabic-Indic digits (٠١٢٣٤٥٦٧٨٩) to Western digits
   everywhere, including inside deadline_raw.

11. confidence is your own estimate, 0 to 1, of how complete and
   certain the extracted fields are. evidence holds the exact
   substring each field came from, or null if the field is null.

Output valid JSON only. No markdown fences, no commentary."""


def build_user_prompt(text: str, posted_at: str | None, links: list[str] | None) -> str:
    parts = [f"Post published at: {posted_at or 'unknown'}", "", "Post text:", '"""', text, '"""']
    if links:
        parts += ["", "Links found in the post (already extracted, for reference):"]
        parts += [f"  {url}" for url in links]
    return "\n".join(parts)


# ---------------------------------------------------------------- schema

VALID_TYPES = {"internship", "coop", "internship_or_coop", "job", "training", None}
VALID_CONTACT_TYPES = {"whatsapp", "phone", "email"}
REQUIRED_KEYS = {
    "is_opportunity", "reason_excluded", "type", "company", "title", "url",
    "contact", "requires_letter", "deadline", "deadline_raw", "location",
    "confidence", "evidence",
}

# The model's internal type stays a controlled enum (easier to validate
# and dedupe on) — this is the only place that maps it to the literal
# strings Abood's site expects. Confirmed 2026-08-09 by inspecting the
# real repo: these THREE strings are the entire valid set. There is no
# "Job" and no bare "Training" — the site is internship/co-op only.
# "job" and "training" map to None on purpose: see route() below,
# which refuses to publish anything TYPE_DISPLAY can't resolve.
TYPE_DISPLAY = {
    "internship": "Internship",
    "coop": "CO-OP Training",
    "internship_or_coop": "Internship / CO-OP Training",
    "job": None,
    "training": None,
    None: None,
}


@dataclass
class Extracted:
    """A validated result. Exactly what came from the model, checked."""

    is_opportunity: bool
    reason_excluded: str | None
    type: str | None
    company: str | None
    title: str | None
    url: str | None
    contact: dict[str, str] | None
    requires_letter: bool
    deadline: str | None
    deadline_raw: str | None
    location: str | None
    confidence: float
    evidence: dict[str, Any] = field(default_factory=dict)

    @property
    def needs_review(self) -> bool:
        return self.is_opportunity and self.confidence < 0.85

    @property
    def route(self) -> str:
        """Where this result should go next, matching the plan's routing table."""
        if not self.is_opportunity:
            return "skip"
        if not self.url:
            # A WhatsApp number or email is not a real application link.
            # Decision: don't publish these, and don't invent a wa.me
            # link to stand in for one — skip. contact is still kept on
            # the Extracted object so it's visible if you're scanning
            # what got skipped and why, it just never becomes a card.
            return "skip"
        if TYPE_DISPLAY.get(self.type) is None:
            # A plain job posting or a genuine paid-training program —
            # this site only covers internships and co-ops. The prompt
            # is told to set is_opportunity: false for these already;
            # this is the backstop in case the model slips.
            return "skip"
        if self.confidence >= 0.85:
            return "publish"
        if self.confidence >= 0.70:
            return "needs-eyes"
        return "deadletter"


def to_card(extracted: Extracted, added_at: str | None = None) -> dict:
    """Map an Extracted result onto Abood's exact site schema.

    Only call this for a result whose route is "publish" or
    "needs-eyes" — those are guaranteed to have a real url and a
    publishable type. This is the only place that produces what
    actually gets written to the site's data — everything else
    (confidence, evidence, reason_excluded, deadline_raw, contact) is
    for the review step and the dead letter file, and never reaches
    the site itself.

    Two things this deliberately does NOT do, both confirmed by
    inspecting the real site code:
      - it never sets isClosed. The site computes open/closed live
        from `deadline` on every render — a scheduled job to flip
        this was in an earlier version of the plan and is not needed.
      - it never emits a key with value null/false. The site's own
        validator treats `deadline: null` as a type error and rejects
        the ENTIRE payload, not just this one card — optional fields
        get left out entirely instead, matching how the real data
        file is written (a card either has `requiresLetter: true`, or
        the key isn't there at all).

    added_at, if given, should be an ISO 8601 timestamp with the
    +03:00 (Riyadh) offset, generated at actual publish time — not
    the Telegram post's timestamp. It drives the site's 48-hour "New"
    badge, so it means "when this was added to the site," not "when
    it was posted."
    """
    card_type = TYPE_DISPLAY.get(extracted.type)
    if card_type is None:
        raise ValueError(
            f"to_card() called on a non-publishable type ({extracted.type!r}) — "
            "check route() before calling this, don't call it unconditionally."
        )

    card: dict = {
        "name": extracted.company,
        "applicationLink": extracted.url,
        "type": card_type,
    }
    if extracted.location:
        card["location"] = extracted.location
    if extracted.deadline:
        card["deadline"] = extracted.deadline
    if extracted.requires_letter:
        card["requiresLetter"] = True
    if added_at:
        card["addedAt"] = added_at
    return card


class ValidationError(ValueError):
    """The model's JSON does not match the shape we require."""


class UnpublishableError(ValidationError):
    """The model returned valid data that still cannot make a safe card."""


def strip_code_fences(raw: str) -> str:
    """Models sometimes wrap JSON in ```json ... ``` even when told not to."""
    text = raw.strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z]*\n", "", text)
        text = re.sub(r"\n```$", "", text)
    return text.strip()


def validate(payload: dict) -> Extracted:
    """Turn a raw dict from the model into a checked Extracted object.

    Anything that doesn't match the contract raises ValidationError,
    which the caller sends to the dead letter file instead of
    guessing. A malformed card is worse than a missing one.
    """
    missing = REQUIRED_KEYS - payload.keys()
    if missing:
        raise ValidationError(f"missing keys: {sorted(missing)}")

    if not isinstance(payload["is_opportunity"], bool):
        raise ValidationError("is_opportunity must be a boolean")

    if payload["type"] not in VALID_TYPES:
        raise ValidationError(f"type {payload['type']!r} is not one of {VALID_TYPES}")

    contact = payload["contact"]
    if contact is not None:
        if not isinstance(contact, dict) or "type" not in contact or "value" not in contact:
            raise ValidationError("contact must be null or {type, value}")
        if contact["type"] not in VALID_CONTACT_TYPES:
            raise ValidationError(f"contact.type {contact['type']!r} is not valid")

    if not isinstance(payload["requires_letter"], bool):
        raise ValidationError("requires_letter must be a boolean")

    confidence = payload["confidence"]
    if not isinstance(confidence, (int, float)) or not (0 <= confidence <= 1):
        raise ValidationError("confidence must be a number between 0 and 1")

    if payload["deadline"] is not None:
        if not re.match(r"^\d{4}-\d{2}-\d{2}$", str(payload["deadline"])):
            raise ValidationError(
                f"deadline {payload['deadline']!r} is not YYYY-MM-DD or null "
                f"(deadline_raw was {payload.get('deadline_raw')!r})"
            )

    # A card with no name isn't valid on the site (name is a required
    # field there). A missing url/contact is NOT an error though — it's
    # a normal, common case (see route(): it just means the result
    # never becomes a card, since there's nothing to skip about it).
    if payload["is_opportunity"] and not payload["company"]:
        raise UnpublishableError("opportunity has no company name")

    return Extracted(
        is_opportunity=payload["is_opportunity"],
        reason_excluded=payload["reason_excluded"],
        type=payload["type"],
        company=payload["company"],
        title=payload["title"],
        url=payload["url"],
        contact=contact,
        requires_letter=payload["requires_letter"],
        deadline=payload["deadline"],
        deadline_raw=payload["deadline_raw"],
        location=payload["location"],
        confidence=float(confidence),
        evidence=payload.get("evidence") or {},
    )


# ---------------------------------------------------------------- pipeline


def extract_opportunity(
    text: str,
    posted_at: str | None = None,
    links: list[str] | None = None,
    model_fn=call_model,
) -> Extracted:
    """Run one post through the model and return a validated result.

    model_fn is injectable so tests can supply a stand-in instead of
    calling a real, metered API. Default is the real GitHub Models
    call.
    """
    prompt = build_user_prompt(text, posted_at, links)
    raw_reply = model_fn(prompt)
    cleaned = strip_code_fences(raw_reply)

    try:
        payload = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise ValidationError(f"model did not return valid json: {exc}") from exc

    return validate(payload)


# ---------------------------------------------------------------- cli


def process_one(text: str, posted_at: str | None, links: list[str] | None) -> None:
    try:
        result = extract_opportunity(text, posted_at, links)
    except (ModelError, ValidationError) as exc:
        print(f"FAILED: {exc}", file=sys.stderr)
        return

    print("--- raw extraction (for review, dedupe, debugging) ---")
    print(json.dumps(asdict(result), ensure_ascii=False, indent=2))
    print(f"\nroute: {result.route}", file=sys.stderr)

    if result.route in ("publish", "needs-eyes"):
        # Riyadh offset (+03:00), matching every real addedAt in the
        # data. This preview uses "now" — the real publish step should
        # generate this fresh at actual publish time, not reuse this.
        added_at = datetime.now(timezone(timedelta(hours=3))).isoformat(timespec="seconds")
        print("\n--- what would be written to the site's data ---")
        print(json.dumps(to_card(result, added_at=added_at), ensure_ascii=False, indent=2))


def main() -> int:
    parser = argparse.ArgumentParser(description="Extract structured fields from a Telegram post.")
    parser.add_argument("--text", help="a single post's text")
    parser.add_argument("--posted-at", default=None, help="ISO timestamp the post was published")
    parser.add_argument("--file", help="a posts.json file from fetch_posts.py --json")
    parser.add_argument(
        "--list-models", action="store_true",
        help="print every model id currently available and exit",
    )
    args = parser.parse_args()

    if args.list_models:
        try:
            list_models()
        except ModelError as exc:
            print(f"FAILED: {exc}", file=sys.stderr)
            return 1
        return 0

    if args.text:
        process_one(args.text, args.posted_at, None)
        return 0

    if args.file:
        with open(args.file, encoding="utf-8") as handle:
            posts = json.load(handle)
        for post in posts:
            print("=" * 72)
            print(post.get("permalink", ""))
            process_one(post["text"], post.get("posted_at"), post.get("links"))
        return 0

    parser.print_help()
    return 1


if __name__ == "__main__":
    sys.exit(main())

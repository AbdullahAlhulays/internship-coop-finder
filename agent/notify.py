#!/usr/bin/env python3
"""Step 5a: send a candidate opportunity to Abood on Telegram for
review, and send a short "applied" / "failed" result once publish.py
has actually run.

This is the SEND-only half of the approval flow. Receiving his tap
(Approve / Reject / pick a deadline) is a separate piece -- Telegram
delivers button taps to whatever webhook URL is registered for the
bot, not to this script, so that part lives in the TypeScript webhook
on Vercel, not here.

Same swappable-transport pattern as extract.py's call_model(): the
real HTTP call is one small function, and tests inject a stub, so
nothing here ever needs a live network call or a real token/chat id
to be checked. token/chat_id are also directly overridable per call
for the same reason -- tests never touch the environment at all.
"""

from __future__ import annotations

import html
import os
from datetime import date, datetime, timedelta, timezone
from typing import Any, Callable

import requests

from _console import use_utf8_stdout

use_utf8_stdout()

RIYADH = timezone(timedelta(hours=3))
API_ROOT = "https://api.telegram.org"
REQUEST_TIMEOUT = 15
CALLBACK_LIMIT = 64  # Telegram's hard limit on callback_data length in bytes
TEST_CANDIDATE_PREFIX = "test:"
TEST_CARD_BANNER = "🧪 <b>TEST MODE</b> — Approve and Reject are simulated; the website will not change."
DESCRIPTION_PREVIEW_LIMIT = 600

TYPE_LABELS = {
    "internship": "Internship",
    "coop": "CO-OP Training",
    "internship_or_coop": "Internship / CO-OP Training",
}


class NotifyError(RuntimeError):
    ...


Transport = Callable[[str, dict], dict]


def _auth_from_env() -> tuple[str, str]:
    token = os.environ.get("TELEGRAM_BOT_TOKEN")
    chat_id = os.environ.get("TELEGRAM_CHAT_ID")
    missing = [name for name, val in (("TELEGRAM_BOT_TOKEN", token), ("TELEGRAM_CHAT_ID", chat_id)) if not val]
    if missing:
        raise NotifyError(f"{', '.join(missing)} not set. See TOKEN_SETUP.md.")
    return token, chat_id


def _resolve_auth(token: str | None, chat_id: str | None) -> tuple[str, str]:
    """Only touches the environment if the caller didn't supply both
    values directly -- lets tests pass fake values and never need
    real secrets set."""
    if token is not None and chat_id is not None:
        return token, chat_id
    env_token, env_chat_id = _auth_from_env()
    return token or env_token, chat_id or env_chat_id


def _default_transport(url: str, payload: dict) -> dict:
    response = requests.post(url, json=payload, timeout=REQUEST_TIMEOUT)
    try:
        return response.json()
    except ValueError as exc:
        raise NotifyError(f"Telegram returned a non-JSON response (status {response.status_code})") from exc


def _call(method: str, payload: dict, token: str, transport: Transport = _default_transport) -> dict:
    url = f"{API_ROOT}/bot{token}/{method}"
    data = transport(url, payload)
    if not data.get("ok"):
        raise NotifyError(f"Telegram rejected {method}: {data.get('description', data)}")
    return data


# ------------------------------------------------------------- message


def _esc(value: Any) -> str:
    return html.escape(str(value)) if value is not None else ""


def _description_preview(value: str) -> str:
    """Keep review cards within Telegram's message limit while the full
    verified text remains stored in pending.json and companies.js."""
    if len(value) <= DESCRIPTION_PREVIEW_LIMIT:
        return value
    return value[:DESCRIPTION_PREVIEW_LIMIT].rstrip() + "… (preview truncated)"


def _reference_date(post: dict | None) -> date:
    """The date to judge 'is this deadline plausible' against: the
    post's own published date if we have it, otherwise today (Riyadh
    time). Used only for the sanity-check warning below -- never for
    deciding what to publish, that's still entirely up to Abood."""
    if post and post.get("posted_at"):
        try:
            return datetime.fromisoformat(post["posted_at"]).date()
        except ValueError:
            pass
    return datetime.now(RIYADH).date()


def deadline_warning(extracted, post: dict | None = None) -> str | None:
    """A deadline that's already in the past relative to the post is
    almost certainly a model mistake (wrong year is the common one --
    the model has genuinely gotten this wrong even with an explicit
    prompt rule telling it not to). Flag it rather than trust it
    silently; Abood still decides via the deadline button either way."""
    if not extracted.deadline:
        return None
    try:
        deadline_date = date.fromisoformat(extracted.deadline)
    except ValueError:
        return None  # validate() already rejects this shape; defensive only
    if deadline_date < _reference_date(post):
        return f"AI found {extracted.deadline}, but that's already in the past — likely wrong, please check"
    return None


def format_card_message(extracted, post: dict | None = None) -> str:
    """extracted is an extract.Extracted. post is optional source
    metadata: {"channel": ..., "permalink": ..., "posted_at": ...},
    included so Abood can click through to the real post and verify
    it himself, same as he asked for early on."""
    type_label = TYPE_LABELS.get(extracted.type, extracted.type or "unknown")
    lines = [
        f"Name: {_esc(extracted.company or 'Unknown company')}",
        f"Type: {_esc(type_label)}",
    ]
    if extracted.location:
        lines.append(f"Location: {_esc(extracted.location)}")
    descriptions = extracted.description or {}
    english_description = descriptions.get("en")
    arabic_description = descriptions.get("ar")
    if english_description:
        lines.append(f"Description (English): {_esc(_description_preview(english_description))}")
    if arabic_description:
        lines.append(f"Description (Arabic): {_esc(_description_preview(arabic_description))}")
    if not english_description and not arabic_description:
        lines.append("Description: not found — use Edit a field to add it")
    if extracted.url:
        lines.append(f'Link: <a href="{_esc(extracted.url)}">{_esc(extracted.url)}</a>')
    if extracted.deadline:
        lines.append(f"Deadline found: {_esc(extracted.deadline)}")
        warning = deadline_warning(extracted, post)
        if warning:
            lines.append(f"⚠️ {_esc(warning)}")
    elif extracted.deadline_raw:
        lines.append(f"No clear deadline parsed — post said: “{_esc(extracted.deadline_raw)}”")
    else:
        lines.append("Deadline: not found — pick one below, or leave it blank")
    # Always shown, even when false -- so it's visible the AI actually
    # checked for this rather than the field just being silently absent.
    lines.append(f"Requires enrollment letter: {'Yes' if extracted.requires_letter else 'No'}")
    if extracted.contact:
        lines.append(
            f"Contact only, no application link: {_esc(extracted.contact.get('type'))} "
            f"{_esc(extracted.contact.get('value'))}"
        )
    lines.append(f"Confidence: {extracted.confidence:.0%}")
    if extracted.evidence:
        note = extracted.evidence.get("note") or extracted.evidence.get("reason")
        if note:
            lines.append(f"Why: {_esc(note)}")
    if post:
        if post.get("permalink"):
            lines.append(f'Source: <a href="{_esc(post["permalink"])}">original post</a>')
        if post.get("channel"):
            lines.append(f"From: {_esc(post['channel'])}")
    return "\n".join(lines)


def is_test_candidate(candidate_id: str) -> bool:
    return candidate_id.startswith(TEST_CANDIDATE_PREFIX)


def format_candidate_message(extracted, candidate_id: str, post: dict | None = None) -> str:
    """Add a persistent safety banner to synthetic test cards. The
    candidate id, not an editable company/title field, controls the
    banner so it cannot disappear when Abood exercises Edit a field."""
    text = format_card_message(extracted, post)
    return f"{TEST_CARD_BANNER}\n\n{text}" if is_test_candidate(candidate_id) else text


# ------------------------------------------------------------ buttons


def _callback(action: str, candidate_id: str) -> str:
    data = f"{action}:{candidate_id}"
    if len(data.encode("utf-8")) > CALLBACK_LIMIT:
        raise NotifyError(
            f"callback_data {data!r} is {len(data.encode('utf-8'))} bytes, over Telegram's "
            f"{CALLBACK_LIMIT}-byte limit -- candidate_id needs to be shorter"
        )
    return data


def approval_keyboard(candidate_id: str, current_deadline: str | None) -> dict:
    """The deadline button is now always shown, not just when the AI
    found nothing (2026-08-09: a real Groq call returned a deadline
    with the wrong year -- confidently wrong, not obviously missing --
    so "the AI found something" is not the same as "the AI is right."
    Abood decides either way; the button label just reflects what's
    there so far. Edit lets him fix any other field before approving,
    instead of only being able to reject the whole card."""
    approve_row = [
        {"text": "✅ Approve", "callback_data": _callback("approve", candidate_id)},
        {"text": "❌ Reject", "callback_data": _callback("reject", candidate_id)},
    ]
    deadline_text = (
        f"\U0001f4c5 Change deadline ({current_deadline})" if current_deadline else "\U0001f4c5 Set deadline"
    )
    return {
        "inline_keyboard": [
            approve_row,
            [{"text": deadline_text, "callback_data": _callback("deadline", candidate_id)}],
            [{"text": "✏️ Edit a field", "callback_data": _callback("edit", candidate_id)}],
        ]
    }


# -------------------------------------------------------------- send


def send_candidate(
    extracted,
    candidate_id: str,
    post: dict | None = None,
    transport: Transport = _default_transport,
    token: str | None = None,
    chat_id: str | None = None,
) -> dict:
    """Sends the review card. Returns Telegram's response, which
    includes the message_id -- useful later for editing this message
    in place once he taps a button, instead of sending a new one."""
    token, chat_id = _resolve_auth(token, chat_id)
    text = format_candidate_message(extracted, candidate_id, post)
    keyboard = approval_keyboard(candidate_id, current_deadline=extracted.deadline)
    payload = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML",
        "disable_web_page_preview": True,
        "reply_markup": keyboard,
    }
    return _call("sendMessage", payload, token, transport=transport)


def send_result(
    candidate_id: str,
    applied: bool,
    detail: str = "",
    transport: Transport = _default_transport,
    token: str | None = None,
    chat_id: str | None = None,
) -> dict:
    """The short follow-up message after publish.py actually runs."""
    token, chat_id = _resolve_auth(token, chat_id)
    if applied:
        text = f"Yes Boss! Applied: {_esc(candidate_id)}"
    else:
        text = f"❌ Failed: {_esc(candidate_id)}"
        if detail:
            text += f"\n{_esc(detail)}"
    # Dynamic values above are HTML-escaped. Tell Telegram to decode those
    # entities instead of visibly showing strings such as &#x27; and &gt;.
    payload = {"chat_id": chat_id, "text": text, "parse_mode": "HTML"}
    return _call("sendMessage", payload, token, transport=transport)


def send_rejected(
    candidate_id: str,
    transport: Transport = _default_transport,
    token: str | None = None,
    chat_id: str | None = None,
) -> dict:
    """A reject is a deliberate decision, not a failure -- distinct
    wording so the history in your Telegram chat is easy to read back
    later without confusing 'you said no' with 'something broke'."""
    token, chat_id = _resolve_auth(token, chat_id)
    payload = {"chat_id": chat_id, "text": f"\U0001f5d1️ Rejected: {_esc(candidate_id)}"}
    return _call("sendMessage", payload, token, transport=transport)


def send_test_result(
    candidate_id: str,
    action: str,
    transport: Transport = _default_transport,
    token: str | None = None,
    chat_id: str | None = None,
) -> dict:
    """Confirmation for a synthetic test decision. It deliberately
    never says Applied/Live: test candidates are removed from pending
    state without touching companies.js, App.jsx, or published.json."""
    if action not in ("approve", "reject"):
        raise NotifyError(f"unknown test action {action!r}")
    token, chat_id = _resolve_auth(token, chat_id)
    label = "Approve" if action == "approve" else "Reject"
    payload = {
        "chat_id": chat_id,
        "text": f"🧪 Test {label} worked: {_esc(candidate_id)}\nNo website data was changed.",
    }
    return _call("sendMessage", payload, token, transport=transport)


# ---------------------------------------------------------------- cli

# Exists so the GitHub Actions workflow can send the outcome message
# only AFTER the commit has actually been pushed. process_approval.py
# used to announce "Applied" the moment it finished writing files --
# but a push can still fail after that (another approval landed
# first), which would have made that message a lie.


def main() -> int:
    import argparse

    parser = argparse.ArgumentParser(description="Send an outcome message to Telegram.")
    parser.add_argument("candidate_id")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--applied", action="store_true", help="the change is live on the site")
    group.add_argument("--rejected", action="store_true", help="Abood said no")
    group.add_argument("--failed", action="store_true", help="something went wrong")
    group.add_argument("--test-approved", action="store_true", help="test Approve worked; nothing was published")
    group.add_argument("--test-rejected", action="store_true", help="test Reject worked; nothing was published")
    parser.add_argument("--detail", default="", help="reason, for --failed")
    args = parser.parse_args()

    try:
        if args.applied:
            send_result(args.candidate_id, applied=True)
        elif args.rejected:
            send_rejected(args.candidate_id)
        elif args.test_approved:
            send_test_result(args.candidate_id, "approve")
        elif args.test_rejected:
            send_test_result(args.candidate_id, "reject")
        else:
            send_result(args.candidate_id, applied=False, detail=args.detail)
    except NotifyError as exc:
        print(f"FAILED to notify: {exc}", file=__import__("sys").stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

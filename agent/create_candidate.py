#!/usr/bin/env python3
"""Step 5d: materialize a manually-created card (built through the
Telegram /new conversation) into a real pending candidate.

Not called by the webhook directly -- same separation as
process_approval.py. The webhook (TypeScript) only collects the six
fields conversationally (company, type, link, location, deadline,
letter) and, once all are answered, tells GitHub via
repository_dispatch (event_type "telegram-create"); this script is
what a GitHub Actions job runs in response.

Deliberately reuses the exact same dedupe.decide(), state.add_pending(),
and notify.send_candidate() a real extracted post goes through -- a
manually-typed company/link is just as capable of duplicating an
existing card as an AI-extracted one, and Abood still gets the
identical Approve/Reject/Set deadline/Edit review card either way,
not a second, less-tested path. This script never touches
companies.js/App.jsx itself -- that still only happens later, in
process_approval.py, after Abood approves the resulting card.

Usage (as GitHub Actions would call it):
    python create_candidate.py manual:171234 "Some Co" internship \
        https://example.com/apply --location "Riyadh, Saudi Arabia" \
        --deadline 2026-09-15 --requires-letter
"""

from __future__ import annotations

import argparse
import sys
from datetime import datetime, timedelta, timezone

from dedupe import decide
from extract import Extracted, to_card
from notify import send_candidate, send_result
from read_companies import ReadCompaniesError, read_companies
from state import PENDING_PATH, PUBLISHED_PATH, StateError, add_pending, load_ledger, load_pending, record_to_extracted

from _console import use_utf8_stdout

use_utf8_stdout()

RIYADH = timezone(timedelta(hours=3))

COMPANIES_JS_PATH = "src/data/companies.js"


class CreateError(RuntimeError):
    """Something about creating this candidate failed. Abood is always
    notified on Telegram before this is raised -- the card he just
    typed in should never just silently vanish."""


def create_candidate(
    draft_id: str,
    company: str,
    type_: str,
    url: str,
    location: str | None = None,
    deadline: str | None = None,
    requires_letter: bool = False,
    defer_send: bool = False,
    companies_js_path: str = COMPANIES_JS_PATH,
    pending_path: str = PENDING_PATH,
    ledger_path: str = PUBLISHED_PATH,
    read_companies_fn=read_companies,
    load_ledger_fn=load_ledger,
    decide_fn=decide,
    add_pending_fn=add_pending,
    send_candidate_fn=send_candidate,
    send_result_fn=send_result,
) -> None:
    """The injectable *_fn parameters exist for the same reason every
    other step in this pipeline has them: offline testing against
    stand-ins, no real repo file or network call needed to verify the
    logic. See test_create_candidate.py.

    defer_send=True skips sending the Telegram review card here --
    same reasoning as process_approval.py's --defer-notice: add_pending
    only writes pending.json locally, uncommitted. If a later git push
    fails (another approval landed first) and this whole attempt gets
    retried against fresh state, a card already sent to Telegram before
    that retry would be a card Abood can tap Approve on that isn't
    actually recorded anywhere. Send only after the push genuinely
    succeeds -- see send_pending_candidate() below, and
    create-candidate.yml's two-step split.
    """
    extracted = Extracted(
        is_opportunity=True,
        reason_excluded=None,
        type=type_,
        company=company,
        title=None,
        url=url,
        contact=None,
        requires_letter=requires_letter,
        deadline=deadline,
        deadline_raw=None,
        location=location,
        confidence=1.0,  # human-entered, not a model guess -- see extract.py's confidence routing
        evidence={"note": "created manually via Telegram /new"},
    )

    # Raises ValueError if type_ isn't one of the three real site
    # values -- shouldn't happen, since the bot only ever offers those
    # three via buttons, never free text (see webhook-logic.ts's
    # CONSTRAINED_CHOICES). Not caught here on purpose: a ValueError
    # escaping uncaught would be a real bug worth seeing loudly, not
    # something to paper over with a generic failure message.
    card = to_card(extracted)

    try:
        existing = read_companies_fn(companies_js_path)
    except ReadCompaniesError as exc:
        detail = f"couldn't read {companies_js_path}: {exc}"
        send_result_fn(draft_id, applied=False, detail=detail)
        raise CreateError(detail) from exc

    ledger = load_ledger_fn(ledger_path)
    now_iso = datetime.now(RIYADH).isoformat(timespec="seconds")
    decision = decide_fn(card, now_iso, existing, ledger)

    if decision.action == "skip":
        # A genuine duplicate of something already on the site -- still
        # worth telling Abood plainly, rather than silently dropping
        # the card he just spent a minute typing in.
        detail = f"this looks like a duplicate of an existing card on the site: {decision.reason}"
        send_result_fn(draft_id, applied=False, detail=detail)
        raise CreateError(detail)

    post = {"channel": "manual", "message_id": None, "posted_at": now_iso, "permalink": None}

    try:
        add_pending_fn(draft_id, extracted, post, decision, path=pending_path)
    except StateError as exc:
        send_result_fn(draft_id, applied=False, detail=str(exc))
        raise

    if not defer_send:
        send_candidate_fn(extracted, draft_id, post=post)


def send_pending_candidate(
    draft_id: str,
    pending_path: str = PENDING_PATH,
    load_pending_fn=load_pending,
    send_candidate_fn=send_candidate,
) -> None:
    """The second half of the deferred flow: called as its own workflow
    step, only once the commit from create_candidate(..., defer_send=True)
    has actually been pushed. Re-reads pending.json fresh off disk --
    this runs after a checkout/pull in the workflow, so it sees the
    genuinely-committed record, not anything held in memory from the
    first step (which could be stale if a retry rewrote it against a
    different base sha). Mirrors process_approval.py's --defer-notice
    two-step split exactly."""
    pending = load_pending_fn(pending_path)
    record = pending.get(draft_id)
    if record is None:
        raise CreateError(f"{draft_id} isn't in {pending_path} -- can't send a card for a draft that was never committed")

    extracted = record_to_extracted(record)
    send_candidate_fn(extracted, draft_id, post=record.get("post"))


def main() -> int:
    parser = argparse.ArgumentParser(description="Turn a completed /new draft into a real pending candidate.")
    parser.add_argument("draft_id")
    parser.add_argument("company", nargs="?", default=None)
    parser.add_argument("type", nargs="?", default=None)
    parser.add_argument("url", nargs="?", default=None)
    parser.add_argument("--location", default="")
    parser.add_argument("--deadline", default="")
    parser.add_argument("--requires-letter", action="store_true")
    parser.add_argument(
        "--defer-send", action="store_true",
        help="add to pending.json but don't send the Telegram card yet -- a later --send-only call does that, after the commit is confirmed pushed",
    )
    parser.add_argument(
        "--send-only", action="store_true",
        help="skip creation entirely; just send the review card for a draft_id that's already committed (the second step after --defer-send)",
    )
    args = parser.parse_args()

    try:
        if args.send_only:
            send_pending_candidate(args.draft_id)
        else:
            if args.company is None or args.type is None or args.url is None:
                parser.error("company, type, and url are required unless --send-only is given")
            create_candidate(
                args.draft_id, args.company, args.type, args.url,
                location=args.location or None,
                deadline=args.deadline or None,
                requires_letter=args.requires_letter,
                defer_send=args.defer_send,
            )
    except (CreateError, StateError) as exc:
        print(f"FAILED: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

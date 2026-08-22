#!/usr/bin/env python3
"""Step 5c: what actually happens when Abood taps Approve or Reject
on Telegram.

This is NOT called by the webhook directly. The webhook (TypeScript,
on Vercel) only relays the tap to GitHub via repository_dispatch --
this script is what a GitHub Actions job runs in response, with the
real repo checked out. Keeping the actual file-editing here, not in
the webhook, means the only code allowed to touch companies.js /
App.jsx is the same already-tested Python from publish.py -- nothing
new to trust in a second language.

This script does NOT run `git commit` / `git push` itself -- that's
the GitHub Actions workflow's job (see
.github/workflows/process-approval.yml), using the same
checkout/commit/push steps every other Action uses. This script's job
ends at "the files on disk are correct, state is updated, and Abood
knows the outcome."

Usage (as GitHub Actions would call it):
    python process_approval.py SALTRAI:5478 approve
    python process_approval.py SALTRAI:5478 reject
"""

from __future__ import annotations

import argparse
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

from extract import to_card
from notify import is_test_candidate, send_rejected, send_result, send_test_result
from publish import apply_decision, bump_last_updated, validate_js_syntax
from state import PENDING_PATH, PUBLISHED_PATH, StateError, pop_pending, record_published, record_to_decision, record_to_extracted
from translate_description import translate_missing_description

from _console import use_utf8_stdout

use_utf8_stdout()

RIYADH = timezone(timedelta(hours=3))

COMPANIES_JS_PATH = "src/data/companies.js"
APP_JSX_PATH = "src/App.jsx"


class ApprovalError(RuntimeError):
    """Something about applying the decision failed. Abood is always
    notified on Telegram before this is raised -- silence is never
    an acceptable outcome here."""


def process_approval(
    candidate_id: str,
    action: str,
    companies_js_path: str = COMPANIES_JS_PATH,
    app_jsx_path: str = APP_JSX_PATH,
    pending_path: str = PENDING_PATH,
    ledger_path: str = PUBLISHED_PATH,
    defer_notice: bool = False,
    pop_pending_fn=pop_pending,
    send_result_fn=send_result,
    send_rejected_fn=send_rejected,
    send_test_result_fn=send_test_result,
    record_published_fn=record_published,
    translate_description_fn=translate_missing_description,
) -> None:
    """The injectable *_fn parameters exist so this can be tested
    offline against temp files and a stub Telegram transport, the
    same way every other step in this pipeline is -- no real network
    call or real repo file needed to verify the logic is correct.

    defer_notice=True suppresses only the POSITIVE outcome messages
    (applied / rejected), leaving the caller to send them once the
    change is genuinely pushed. Failure messages are never deferred:
    a failure aborts here and there's nothing later to send them.

    Why this exists: this function finishing successfully does NOT
    mean the change is live -- the workflow still has to commit and
    push, and that push can be rejected if another approval landed
    first. Announcing "Applied" from in here would be announcing
    something that hasn't happened yet, and could still fail.
    """
    if action not in ("approve", "reject"):
        raise ApprovalError(f"unknown action {action!r} -- expected 'approve' or 'reject'")

    try:
        record, _ = pop_pending_fn(candidate_id, path=pending_path)
    except StateError as exc:
        send_result_fn(candidate_id, applied=False, detail=f"couldn't find this candidate — {exc}")
        raise

    # Synthetic test cards exercise the real Telegram webhook, GitHub
    # dispatch, workflow, state removal, collision retries, and outcome
    # delivery. They stop here deliberately: neither decision may read
    # or write companies.js, App.jsx, or the published ledger.
    if is_test_candidate(candidate_id):
        if not defer_notice:
            send_test_result_fn(candidate_id, action)
        return

    if action == "reject":
        if not defer_notice:
            send_rejected_fn(candidate_id)
        return

    # action == "approve" — every failure from here on notifies Abood
    # with the real reason before it's re-raised.
    try:
        extracted = record_to_extracted(record)
        # This is intentionally after Telegram review and immediately
        # before publishing: translate the final human-edited source
        # text, not the model's first draft.
        extracted = translate_description_fn(extracted)
        decision = record_to_decision(record)
        post = record["post"]

        now = datetime.now(RIYADH)
        card = to_card(extracted, added_at=now.isoformat(timespec="seconds"))
        # Dedupe decided what was safe to update before the missing
        # language existed. Carry the approval-time translation into
        # that same verified description update.
        if decision.action == "update" and "description" in decision.changes and card.get("description"):
            decision.changes["description"] = card["description"]

        companies_js_source = Path(companies_js_path).read_text(encoding="utf-8")
        new_companies_js = apply_decision(companies_js_source, decision, card)
        validate_js_syntax(new_companies_js)

        app_jsx_source = Path(app_jsx_path).read_text(encoding="utf-8")
        new_app_jsx = bump_last_updated(app_jsx_source, now)

        Path(companies_js_path).write_text(new_companies_js, encoding="utf-8")
        Path(app_jsx_path).write_text(new_app_jsx, encoding="utf-8")

        record_published_fn(
            card["applicationLink"],
            post.get("posted_at") or now.isoformat(timespec="seconds"),
            post.get("message_id"),
            post.get("channel"),
            path=ledger_path,
        )
    except Exception as exc:
        send_result_fn(candidate_id, applied=False, detail=str(exc))
        raise ApprovalError(str(exc)) from exc

    if not defer_notice:
        send_result_fn(candidate_id, applied=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="Apply a Telegram approve/reject decision.")
    parser.add_argument("candidate_id")
    parser.add_argument("action", choices=["approve", "reject"])
    parser.add_argument(
        "--defer-notice",
        action="store_true",
        help="don't send the applied/rejected message — the caller will, after pushing",
    )
    args = parser.parse_args()

    try:
        process_approval(args.candidate_id, args.action, defer_notice=args.defer_notice)
    except (ApprovalError, StateError) as exc:
        print(f"FAILED: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

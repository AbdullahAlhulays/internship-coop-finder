#!/usr/bin/env python3
"""One scheduled run, end to end: read new posts -> extract -> dedupe
-> send anything worth reviewing to Telegram."""

from __future__ import annotations

import argparse
import html as html_module
import json
import os
import re
import subprocess
import sys
from pathlib import Path

from dedupe import decide
from extract import ModelError, ValidationError, extract_opportunity, to_card
from notify import format_card_message, send_candidate
from read_companies import ReadCompaniesError, read_companies
from _console import use_utf8_stdout
from state import (
    PENDING_PATH,
    PUBLISHED_PATH,
    SEEN_PATH,
    add_pending,
    is_seen,
    load_ledger,
    load_pending,
    load_seen,
    make_candidate_id,
    mark_seen,
)

use_utf8_stdout()

FETCH_TIMEOUT = 60


class RunError(RuntimeError):
    ...


def as_plain_text(message: str) -> str:
    text = re.sub(r'<a href="[^"]*">([^<]*)</a>', r"\1", message)
    text = re.sub(r"<[^>]+>", "", text)
    return html_module.unescape(text)


def fetch_posts(channel: str, limit: int) -> list[dict]:
    script = Path(__file__).with_name("fetch_posts.py")
    if not script.exists():
        raise RunError(
            f"{script} not found -- run.py needs fetch_posts.py sitting next to it."
        )
    child_env = {**os.environ, "PYTHONIOENCODING": "utf-8"}
    result = subprocess.run(
        [sys.executable, "-X", "utf8", str(script), channel, "--limit", str(limit), "--json"],
        capture_output=True,
        text=True,
        encoding="utf-8",
        env=child_env,
        timeout=FETCH_TIMEOUT,
    )
    if result.returncode != 0:
        raise RunError(f"fetch_posts.py failed:\n{result.stderr.strip()}")
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        raise RunError(f"fetch_posts.py didn't return valid JSON: {exc}") from exc


def run(
    channel: str,
    posts: list[dict],
    companies_path: str,
    dry_run: bool = False,
    ignore_seen: bool = False,
    pending_path: str = PENDING_PATH,
    ledger_path: str = PUBLISHED_PATH,
    seen_path: str = SEEN_PATH,
    model_fn=None,
    send_fn=send_candidate,
) -> dict:
    existing = read_companies(companies_path)
    ledger = load_ledger(ledger_path)
    pending = load_pending(pending_path)
    seen = load_seen(seen_path)

    summary = {"read": len(posts), "skipped_seen": 0, "not_opportunity": 0,
               "unpublishable": 0, "duplicate": 0, "failed": 0, "sent": 0}
    processed_ids: list[int] = []

    for post in posts:
        message_id = post.get("message_id")
        candidate_id = make_candidate_id(channel, message_id)

        if not ignore_seen and is_seen(channel, message_id, seen):
            summary["skipped_seen"] += 1
            continue
        if candidate_id in pending:
            summary["skipped_seen"] += 1
            continue

        try:
            kwargs = {"model_fn": model_fn} if model_fn else {}
            extracted = extract_opportunity(
                post.get("text", ""), post.get("posted_at"), post.get("links"), **kwargs
            )
        except (ModelError, ValidationError) as exc:
            print(f"  [failed]  {candidate_id}: {exc}")
            summary["failed"] += 1
            processed_ids.append(message_id)
            continue

        if not extracted.is_opportunity:
            print(f"  [not an opportunity] {candidate_id}: {extracted.reason_excluded}")
            summary["not_opportunity"] += 1
            processed_ids.append(message_id)
            continue

        if extracted.route == "skip":
            reason = "no application link" if not extracted.url else f"type {extracted.type!r} isn't published on this site"
            print(f"  [skip]    {candidate_id}: {reason}")
            summary["unpublishable"] += 1
            processed_ids.append(message_id)
            continue

        card = to_card(extracted)
        decision = decide(card, post.get("posted_at", ""), existing, ledger)

        if decision.action == "skip":
            print(f"  [dupe]    {candidate_id}: {decision.reason}")
            summary["duplicate"] += 1
            processed_ids.append(message_id)
            continue

        if dry_run:
            print(f"\n  [WOULD SEND] {candidate_id}  ({decision.action}: {decision.reason})")
            print("  " + "-" * 66)
            for line in as_plain_text(format_card_message(extracted, post)).splitlines():
                print(f"  | {line}")
            print("  " + "-" * 66)
            summary["sent"] += 1
            continue

        add_pending(candidate_id, extracted, post, decision, path=pending_path)
        send_fn(extracted, candidate_id, post=post)
        print(f"  [sent]    {candidate_id}: {extracted.company} ({decision.action})")
        summary["sent"] += 1
        processed_ids.append(message_id)

    if processed_ids and not dry_run:
        mark_seen(channel, processed_ids, path=seen_path)

    return summary


def main() -> int:
    parser = argparse.ArgumentParser(description="One end-to-end run of the opportunity agent.")
    parser.add_argument("--channel", help="channel username, e.g. SALTRAI")
    parser.add_argument("--limit", type=int, default=10, help="how many recent posts to read")
    parser.add_argument("--posts-file", help="a posts.json from fetch_posts.py, instead of fetching live")
    parser.add_argument("--companies", default="src/data/companies.js", help="path to the site's companies.js")
    parser.add_argument("--dry-run", action="store_true", help="print what would be sent; send and save nothing")
    parser.add_argument("--ignore-seen", action="store_true", help="re-process posts already handled before")
    args = parser.parse_args()

    if not args.channel and not args.posts_file:
        parser.error("give either --channel or --posts-file")

    try:
        if args.posts_file:
            posts = json.loads(Path(args.posts_file).read_text(encoding="utf-8"))
            channel = args.channel or (posts[0].get("channel", "unknown") if posts else "unknown")
        else:
            channel = args.channel
            posts = fetch_posts(channel, args.limit)

        print(f"{len(posts)} posts from {channel}" + ("  (DRY RUN -- nothing will be sent or saved)" if args.dry_run else ""))
        summary = run(
            channel, posts, args.companies,
            dry_run=args.dry_run, ignore_seen=args.ignore_seen,
        )
    except (RunError, ReadCompaniesError) as exc:
        print(f"FAILED: {exc}", file=sys.stderr)
        return 1

    print(
        f"\nread {summary['read']}"
        f" | already handled {summary['skipped_seen']}"
        f" | not opportunities {summary['not_opportunity']}"
        f" | unpublishable {summary['unpublishable']}"
        f" | duplicates {summary['duplicate']}"
        f" | failed {summary['failed']}"
        f" | {'would send' if args.dry_run else 'sent'} {summary['sent']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
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
import time
from pathlib import Path
from urllib.parse import urlsplit

from dedupe import decide
from extract import ModelError, ValidationError, extract_opportunity, to_card
from notify import format_card_message, send_candidate
from read_companies import ReadCompaniesError, read_companies
from _console import use_utf8_stdout
from state import (
    DELIVERY_QUEUED,
    PENDING_PATH,
    PUBLISHED_PATH,
    SEEN_PATH,
    add_pending,
    is_seen,
    load_ledger,
    load_pending,
    load_seen,
    make_candidate_id,
    mark_delivery_sent,
    mark_seen,
)

use_utf8_stdout()

FETCH_TIMEOUT = 60


class RunError(RuntimeError):
    ...


TELEGRAM_LINK_HOSTS = {"t.me", "telegram.me"}


def is_usable_external_link(value: object) -> bool:
    """True for an HTTP(S) link that points outside Telegram itself.

    fetch_posts.py keeps the source-message permalink in ``permalink``,
    not ``links``, but posts sometimes contain another t.me link in their
    body. Those channel/repost links are not application destinations and
    must not spend a Groq call by themselves.
    """
    if not isinstance(value, str):
        return False
    try:
        parsed = urlsplit(value.strip())
    except ValueError:
        return False
    if parsed.scheme.lower() not in {"http", "https"} or not parsed.hostname:
        return False
    host = parsed.hostname.lower().rstrip(".")
    return not any(host == blocked or host.endswith(f".{blocked}") for blocked in TELEGRAM_LINK_HOSTS)


def has_usable_external_link(post: dict) -> bool:
    links = post.get("links")
    return isinstance(links, list) and any(is_usable_external_link(link) for link in links)


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
    mark_delivery_fn=mark_delivery_sent,
    defer_send: bool = False,
    extraction_attempts: int = 3,
) -> dict:
    existing = read_companies(companies_path)
    ledger = load_ledger(ledger_path)
    pending = load_pending(pending_path)
    seen = load_seen(seen_path)

    if extraction_attempts < 1:
        raise ValueError("extraction_attempts must be at least 1")

    summary = {"read": len(posts), "skipped_seen": 0, "skipped_no_link": 0, "not_opportunity": 0,
               "unpublishable": 0, "duplicate": 0, "failed": 0,
               "queued": 0, "sent": 0, "candidate_ids": []}
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

        # The site requires a real application URL. Reject no-link posts
        # before Groq instead of paying the model to discover something a
        # deterministic check already proves. Media-only posts also stop
        # here until the pipeline actually downloads and sends their image
        # to a vision model; sending an empty text prompt would add cost but
        # reveal nothing. When vision support lands, that media path should
        # deliberately bypass this text/link gate.
        if not has_usable_external_link(post):
            reason = (
                "media is not vision-enabled and has no external link"
                if post.get("has_media")
                else "no external link"
            )
            print(f"  [pre-skip] {candidate_id}: {reason}; Groq not called")
            summary["skipped_no_link"] += 1
            processed_ids.append(message_id)
            continue

        extracted = None
        for extraction_attempt in range(1, extraction_attempts + 1):
            try:
                kwargs = {"model_fn": model_fn} if model_fn else {}
                extracted = extract_opportunity(
                    post.get("text", ""), post.get("posted_at"), post.get("links"), **kwargs
                )
                break
            except (ModelError, ValidationError) as exc:
                if extraction_attempt == extraction_attempts:
                    print(f"  [failed]  {candidate_id} after {extraction_attempts} attempt(s): {exc}")
                    break
                print(f"  [retry]   {candidate_id}: extraction attempt {extraction_attempt} failed: {exc}")
                # Tests inject a deterministic model and should remain
                # instant. Live provider retries get a short backoff.
                if model_fn is None:
                    time.sleep(min(2 ** extraction_attempt, 8))

        if extracted is None:
            summary["failed"] += 1
            # Do NOT mark a failed extraction as seen. A transient Groq
            # outage or malformed response must be retried next hour,
            # never silently discard a real opportunity forever.
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

        # Queue first, then send. If Telegram raises, the durable queued
        # marker remains and the scheduled workflow can recover it later.
        add_pending(
            candidate_id, extracted, post, decision,
            path=pending_path, delivery_status=DELIVERY_QUEUED,
        )
        summary["candidate_ids"].append(candidate_id)
        if defer_send:
            print(f"  [queued]  {candidate_id}: {extracted.company} ({decision.action})")
            summary["queued"] += 1
        else:
            response = send_fn(extracted, candidate_id, post=post)
            telegram_message_id = response.get("result", {}).get("message_id") if isinstance(response, dict) else None
            mark_delivery_fn(candidate_id, telegram_message_id, path=pending_path)
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
    parser.add_argument(
        "--defer-send", action="store_true",
        help="write pending/seen state but send no Telegram cards yet; the workflow sends them only after git push succeeds",
    )
    parser.add_argument("--created-ids-file", help="write the newly queued candidate ids as a JSON array")
    parser.add_argument("--summary-file", help="write the run summary as JSON for workflow reporting")
    parser.add_argument("--extraction-attempts", type=int, default=3, help="attempt each Groq extraction this many times")
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
            defer_send=args.defer_send,
            extraction_attempts=args.extraction_attempts,
        )
    except (RunError, ReadCompaniesError) as exc:
        print(f"FAILED: {exc}", file=sys.stderr)
        return 1

    if args.created_ids_file:
        Path(args.created_ids_file).write_text(
            json.dumps(summary["candidate_ids"], ensure_ascii=False) + "\n", encoding="utf-8"
        )
    if args.summary_file:
        Path(args.summary_file).write_text(
            json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )

    print(
        f"\nread {summary['read']}"
        f" | already handled {summary['skipped_seen']}"
        f" | no external link {summary['skipped_no_link']}"
        f" | not opportunities {summary['not_opportunity']}"
        f" | unpublishable {summary['unpublishable']}"
        f" | duplicates {summary['duplicate']}"
        f" | failed {summary['failed']}"
        f" | queued {summary['queued']}"
        f" | {'would send' if args.dry_run else 'sent'} {summary['sent']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

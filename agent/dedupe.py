#!/usr/bin/env python3
"""Decide what to do with a newly extracted opportunity: add it, update
an existing card, or skip it.

Step 3 of the pipeline. Takes a card already produced by
extract.to_card() and compares it against what's already published,
plus a small internal ledger this script maintains for itself (never
touches Abood's site schema — that stays exactly what his app expects:
name, applicationLink, type, and a handful of optional fields).

Matching key: applicationLink, exact string match. Confirmed by
inspecting the real site (2026-08-09) — applicationLink is the site's
actual identity for a card. It's the React list key, and the "mark as
applied" feature stores a list of applicationLink strings in the
student's browser. Two consequences that shape everything below:

  1. Same link, seen again -> without question the same card. Safe to
     refresh its fields.
  2. Different link, even from the same company -> a genuinely
     different entry by the site's own definition, not ambiguous.
     There is no "might be the same posting with a different link"
     case to guess about — if the link differs, it's a new card.
  3. applicationLink itself must NEVER be rewritten once published.
     Changing it would silently disconnect it from any student who
     already marked it applied.

The rules (2026-08-09, from a real conversation about this problem):

  1. No existing card with this exact link -> add it.
  2. Same link found:
       a. existing card has no deadline, new one does -> fill it in.
       b. this Telegram post is confirmed newer than whatever produced
          the existing card (per the ledger) -> refresh the other
          fields that differ (location, type, requiresLetter) too —
          never the link itself.
       c. neither -> nothing new, skip.
     A card the ledger doesn't recognize (hand-added by Abood, not by
     this pipeline) can only ever have its deadline filled in (2a) —
     never a full refresh (2b) — since there's no evidence a bot's
     read of it is actually more current than a human's.

Nothing here writes to the site's data directly — it only decides.
The caller applies the decision inside the review/PR step.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field

# Fields that are safe to refresh on an exact-link match once we know
# the new post is newer. applicationLink and name are deliberately not
# in this list — the link must never change (see module docstring),
# and if the name legitimately changed the link would usually have
# changed too, so treat that as suspicious rather than auto-applying.
REFRESHABLE_FIELDS = ("location", "deadline", "type", "requiresLetter")


@dataclass
class Decision:
    action: str  # "add" | "update" | "skip"
    reason: str
    existing_index: int | None = None
    changes: dict = field(default_factory=dict)  # what would change, for the PR diff


def decide(
    new_card: dict,
    new_posted_at: str,
    existing_cards: list[dict],
    ledger: dict[str, dict],
) -> Decision:
    """new_card is already extract.to_card() output — always has a
    real applicationLink and a publishable type, since anything
    without one never reaches this step (route() filters those out
    upstream).

    ledger maps applicationLink -> {"posted_at": ...} for cards this
    agent has published before. Cards already on the site before the
    agent existed, or added by hand, won't be in it — see rule 2's
    note above for why that matters.
    """
    link = new_card["applicationLink"]

    match_idx = next(
        (i for i, card in enumerate(existing_cards) if card.get("applicationLink") == link),
        None,
    )

    if match_idx is None:
        return Decision("add", "no existing card has this application link")

    existing = existing_cards[match_idx]
    changes: dict = {}

    if not existing.get("deadline") and new_card.get("deadline"):
        changes["deadline"] = new_card["deadline"]

    known_posted_at = ledger.get(link, {}).get("posted_at")
    if known_posted_at and new_posted_at > known_posted_at:
        for f in REFRESHABLE_FIELDS:
            new_value = new_card.get(f)
            if new_value is not None and new_value != existing.get(f):
                changes[f] = new_value

    if changes:
        reason = (
            "existing card has no deadline, this post has one"
            if set(changes) == {"deadline"}
            else "a newer repost of this exact posting has different details"
        )
        return Decision("update", reason, existing_index=match_idx, changes=changes)

    return Decision("skip", "already published under this exact link, nothing new")


def ledger_entry(link: str, posted_at: str, message_id: int, channel: str) -> tuple[str, dict]:
    """What to record after publishing a card, so a future run can
    tell whether a later post about the same link is actually newer."""
    return link, {"posted_at": posted_at, "message_id": message_id, "channel": channel}


# ---------------------------------------------------------------- cli


def main() -> int:
    import argparse

    parser = argparse.ArgumentParser(
        description="Check one candidate card against the site's existing data (dry run, no writes)."
    )
    parser.add_argument("opportunities_file", help="path to the site's opportunities data (json)")
    parser.add_argument("card_file", help="a single card json, e.g. from extract.py")
    parser.add_argument("--posted-at", required=True)
    parser.add_argument("--ledger", default=None, help="path to state/published.json, if it exists")
    args = parser.parse_args()

    with open(args.opportunities_file, encoding="utf-8") as handle:
        existing = json.load(handle)
    with open(args.card_file, encoding="utf-8") as handle:
        new_card = json.load(handle)
    ledger = {}
    if args.ledger:
        try:
            with open(args.ledger, encoding="utf-8") as handle:
                ledger = json.load(handle)
        except FileNotFoundError:
            pass

    result = decide(new_card, args.posted_at, existing, ledger)
    print(f"action:  {result.action}")
    print(f"reason:  {result.reason}")
    if result.existing_index is not None:
        print(f"index:   {result.existing_index}")
    if result.changes:
        print(f"changes: {json.dumps(result.changes, ensure_ascii=False, indent=2)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

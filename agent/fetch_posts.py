#!/usr/bin/env python3
"""Read recent posts from a public Telegram channel.

Step 1 of the opportunity agent. This script does one job: prove we can
read your channels reliably. There is no AI here, no GitHub, and nothing
is saved between runs yet. That comes later.

It works by downloading the public web preview page that every public
Telegram channel has:

    https://t.me/s/<channel_name>

That page is plain HTML, the same thing you would see in a browser.
No login, no bot, no API key.

Examples:
    python fetch_posts.py durov
    python fetch_posts.py @durov --limit 5
    python fetch_posts.py durov --json > posts.json
    python fetch_posts.py durov --before 4200
    python fetch_posts.py durov --raw page.html
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import asdict, dataclass, field

try:
    import requests
    from bs4 import BeautifulSoup, Tag
except ImportError:
    sys.exit(
        "Missing libraries. Install them first:\n"
        "    pip install -r requirements.txt"
    )


PREVIEW_URL = "https://t.me/s/{channel}"
USER_AGENT = "Mozilla/5.0 (compatible; opportunity-agent/0.1)"
TIMEOUT_SECONDS = 20

# Matches a bare url that Telegram did not turn into a link itself.
BARE_URL = re.compile(r"(?:https?://|www\.)[^\s<>\"']+", re.IGNORECASE)


@dataclass
class Post:
    """One message from a channel."""

    channel: str
    message_id: int
    permalink: str
    posted_at: str | None
    text: str
    links: list[str] = field(default_factory=list)
    has_media: bool = False

    @property
    def is_empty(self) -> bool:
        return not self.text.strip() and not self.links


# ---------------------------------------------------------------- fetching


def fetch_html(channel: str, before: int | None = None) -> str:
    """Download the channel preview page and return the raw HTML."""
    channel = channel.lstrip("@").strip()
    if not channel:
        raise ValueError("Channel name is empty.")

    url = PREVIEW_URL.format(channel=channel)
    params = {"before": before} if before else None

    response = requests.get(
        url,
        params=params,
        headers={"User-Agent": USER_AGENT},
        timeout=TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    response.encoding = "utf-8"
    return response.text


# ---------------------------------------------------------------- parsing


def clean_text(node: Tag) -> str:
    """Turn the message HTML into readable plain text.

    Only <br> tags are real line breaks. Every other newline or run of
    spaces in the html is just source formatting, so it gets collapsed.
    This way the text handed to the AI later looks the same as what a
    person sees in Telegram.
    """
    marker = "\x00"
    for br in node.find_all("br"):
        br.replace_with(marker)

    text = node.get_text()
    text = re.sub(r"[\s\u00a0\u200e\u200f]+", " ", text)
    text = text.replace(marker, "\n")
    text = re.sub(r" *\n *", "\n", text)     # no stray spaces around breaks
    text = re.sub(r"\n{3,}", "\n\n", text)   # collapse big gaps
    return text.strip()


def extract_links(node: Tag, text: str) -> list[str]:
    """Collect every url in the message, in the order they appear.

    Two sources, because the application link is the field we can least
    afford to lose:
      1. real <a href> tags, which hold the full url even when the
         visible text is shortened
      2. bare urls typed as plain text
    """
    urls: list[str] = []

    for anchor in node.find_all("a", href=True):
        href = anchor["href"].strip()
        if href.startswith(("http://", "https://")) and href not in urls:
            urls.append(href)

    for match in BARE_URL.findall(text):
        url = match.rstrip(".,)،؛:!")
        if not url.startswith("http"):
            url = "https://" + url
        if url not in urls:
            urls.append(url)

    return urls


def parse_posts(html: str, channel: str) -> list[Post]:
    """Pull every message out of a channel preview page."""
    soup = BeautifulSoup(html, "html.parser")
    posts: list[Post] = []

    for node in soup.select("div.tgme_widget_message[data-post]"):
        data_post = node.get("data-post", "").strip()
        match = re.search(r"/(\d+)$", data_post)
        if not match:
            continue

        body = node.select_one("div.tgme_widget_message_text")
        text = clean_text(body) if body else ""
        links = extract_links(body, text) if body else []

        time_tag = node.select_one("time[datetime]")
        posted_at = time_tag.get("datetime") if time_tag else None

        has_media = bool(
            node.select_one(
                ".tgme_widget_message_photo, .tgme_widget_message_video, "
                ".tgme_widget_message_document, .tgme_widget_message_poll"
            )
        )

        posts.append(
            Post(
                channel=channel.lstrip("@"),
                message_id=int(match.group(1)),
                permalink=f"https://t.me/{data_post}",
                posted_at=posted_at,
                text=text,
                links=links,
                has_media=has_media,
            )
        )

    # Oldest first. Message ids only ever go up, which is what step 2
    # will use to remember where we stopped.
    posts.sort(key=lambda p: p.message_id)
    return posts


# ---------------------------------------------------------------- output


def indent(text: str, prefix: str = "    ") -> str:
    return "\n".join(prefix + line for line in text.splitlines())


def print_posts(posts: list[Post]) -> None:
    for post in posts:
        print("-" * 72)
        stamp = post.posted_at or "no timestamp"
        print(f"#{post.message_id}   {stamp}")
        print(post.permalink)

        if post.text:
            print()
            print(indent(post.text))
        elif post.has_media:
            print()
            print("    (media only, no text)")

        if post.links:
            print()
            print("    links:")
            for url in post.links:
                print(f"      {url}")
        print()


def print_summary(posts: list[Post], channel: str) -> None:
    print("=" * 72)
    if not posts:
        print(f"No posts found for @{channel}.")
        return

    with_links = sum(1 for p in posts if p.links)
    empty = sum(1 for p in posts if p.is_empty)

    print(f"channel:     @{channel}")
    print(f"posts:       {len(posts)}")
    print(f"id range:    {posts[0].message_id} to {posts[-1].message_id}")
    print(f"with links:  {with_links}")
    print(f"no text:     {empty}")
    print()
    print(f"Older posts:  --before {posts[0].message_id}")


def explain_empty_result(channel: str) -> None:
    print(
        f"\nNothing was found for @{channel}. Usual reasons:\n"
        f"\n"
        f"  1. Typo in the channel name. Open https://t.me/s/{channel}\n"
        f"     in a browser. If you see posts there, the name is right.\n"
        f"  2. The channel is private. Only public channels have this page.\n"
        f"  3. It is a group, not a channel. Groups have no public preview.\n"
        f"  4. The owner turned the web preview off. Rare, but it happens.\n"
        f"\n"
        f"If the browser shows posts but this script finds none, save the\n"
        f"page with --raw page.html and the parser can be adjusted.\n",
        file=sys.stderr,
    )


# ---------------------------------------------------------------- cli


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Read recent posts from a public Telegram channel."
    )
    parser.add_argument("channel", help="channel username, with or without @")
    parser.add_argument(
        "--limit", type=int, default=20,
        help="how many of the most recent posts to show (default 20)",
    )
    parser.add_argument(
        "--before", type=int, default=None,
        help="load posts older than this message id, for paging back",
    )
    parser.add_argument(
        "--json", action="store_true",
        help="print json instead of readable text",
    )
    parser.add_argument(
        "--raw", metavar="FILE", default=None,
        help="also save the downloaded html, useful when parsing looks wrong",
    )
    args = parser.parse_args()

    try:
        html = fetch_html(args.channel, before=args.before)
    except requests.HTTPError as exc:
        status = exc.response.status_code if exc.response is not None else "?"
        print(f"Telegram returned HTTP {status} for @{args.channel}.", file=sys.stderr)
        if status == 404:
            explain_empty_result(args.channel.lstrip("@"))
        return 1
    except requests.RequestException as exc:
        print(f"Could not reach Telegram: {exc}", file=sys.stderr)
        return 1

    if args.raw:
        with open(args.raw, "w", encoding="utf-8") as handle:
            handle.write(html)
        print(f"Saved html to {args.raw}\n", file=sys.stderr)

    posts = parse_posts(html, args.channel)

    if not posts:
        explain_empty_result(args.channel.lstrip("@"))
        return 1

    # Keep the newest N, but still show them oldest first.
    if args.limit > 0:
        posts = posts[-args.limit:]

    if args.json:
        print(json.dumps([asdict(p) for p in posts], ensure_ascii=False, indent=2))
    else:
        print_posts(posts)
        print_summary(posts, args.channel.lstrip("@"))

    return 0


if __name__ == "__main__":
    sys.exit(main())

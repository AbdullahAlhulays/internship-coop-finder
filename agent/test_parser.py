#!/usr/bin/env python3
"""Offline test for the parser.

Runs against a saved copy of Telegram-shaped HTML, so it needs no
internet. This checks the parsing logic itself. It does not prove your
channel works, only that the code does the right thing with the HTML
Telegram sends.

Run it with:
    python test_parser.py
"""

from fetch_posts import parse_posts

# A cut-down copy of the structure t.me/s/<channel> returns.
# Covers the cases that actually matter: an Arabic post with a shortened
# link, an English post, and a media post with no text at all.
FIXTURE = """
<html><body>
<div class="tgme_widget_message_wrap">
  <div class="tgme_widget_message" data-post="test_channel/4199">
    <div class="tgme_widget_message_text js-message_text">
      فرصة تدريب صيفي<br/>
      شركة أرامكو<br/>
      الظهران<br/>
      آخر موعد: ١٥ سبتمبر<br/>
      <a href="https://careers.aramco.com/job/12345?utm_source=telegram">careers.aramco.com/job/1234…</a>
    </div>
    <div class="tgme_widget_message_footer">
      <a class="tgme_widget_message_date" href="https://t.me/test_channel/4199">
        <time datetime="2026-08-05T09:12:00+00:00">09:12</time>
      </a>
    </div>
  </div>
</div>

<div class="tgme_widget_message_wrap">
  <div class="tgme_widget_message" data-post="test_channel/4201">
    <div class="tgme_widget_message_photo"></div>
    <div class="tgme_widget_message_footer">
      <a class="tgme_widget_message_date" href="https://t.me/test_channel/4201">
        <time datetime="2026-08-05T11:00:00+00:00">11:00</time>
      </a>
    </div>
  </div>
</div>

<div class="tgme_widget_message_wrap">
  <div class="tgme_widget_message" data-post="test_channel/4202">
    <div class="tgme_widget_message_text js-message_text">
      Co-op opportunity at Saudi Aramco, Dhahran.<br/>
      Apply before Sept 15. Details: www.example.com/apply
    </div>
    <div class="tgme_widget_message_footer">
      <a class="tgme_widget_message_date" href="https://t.me/test_channel/4202">
        <time datetime="2026-08-06T08:30:00+00:00">08:30</time>
      </a>
    </div>
  </div>
</div>
</body></html>
"""


def check(label: str, actual, expected) -> bool:
    ok = actual == expected
    mark = "pass" if ok else "FAIL"
    print(f"  [{mark}] {label}")
    if not ok:
        print(f"         expected: {expected!r}")
        print(f"         actual:   {actual!r}")
    return ok


def main() -> int:
    posts = parse_posts(FIXTURE, "test_channel")
    results = []

    print("parsing")
    results.append(check("found 3 posts", len(posts), 3))
    results.append(check("sorted oldest first",
                         [p.message_id for p in posts], [4199, 4201, 4202]))

    first, media, english = posts

    print("\narabic post with a shortened link")
    results.append(check("message id", first.message_id, 4199))
    results.append(check("permalink", first.permalink,
                         "https://t.me/test_channel/4199"))
    results.append(check("timestamp", first.posted_at,
                         "2026-08-05T09:12:00+00:00"))
    results.append(check("line breaks kept", first.text.count("\n"), 4))
    results.append(check(
        "full url recovered, not the shortened display text",
        first.links,
        ["https://careers.aramco.com/job/12345?utm_source=telegram"],
    ))
    results.append(check("arabic-indic digits survive",
                         "١٥" in first.text, True))

    print("\nmedia post with no text")
    results.append(check("text is empty", media.text, ""))
    results.append(check("flagged as media", media.has_media, True))
    results.append(check("counted as empty", media.is_empty, True))

    print("\nenglish post with a bare url")
    results.append(check("bare url found and given a scheme",
                         english.links, ["https://www.example.com/apply"]))
    results.append(check("not flagged as media", english.has_media, False))

    passed = sum(results)
    total = len(results)
    print(f"\n{passed}/{total} checks passed")
    return 0 if passed == total else 1


if __name__ == "__main__":
    raise SystemExit(main())

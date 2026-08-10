#!/usr/bin/env python3
"""Make printing Arabic safe on Windows.

Windows consoles still default to a legacy single-byte encoding
(cp1252 in most Western installs), so `print()` of any Arabic
character raises UnicodeEncodeError and kills the script. Since
essentially every post this agent handles is in Arabic, that would
crash on Abood's machine while passing on Linux/CI -- which is
exactly what happened on 2026-08-09.

Call use_utf8_stdout() at the top of anything that prints. It's a
no-op on systems that are already UTF-8.

errors="replace" rather than "strict": if some console truly can't
render a character, printing a replacement glyph is fine. Crashing a
publishing pipeline over a display detail is not.
"""

from __future__ import annotations

import sys


def use_utf8_stdout() -> None:
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure is None:
            continue  # redirected to something that isn't a text stream
        try:
            reconfigure(encoding="utf-8", errors="replace")
        except (ValueError, OSError):
            # Already detached, or a stream that refuses reconfiguration.
            # Not worth failing a run over.
            pass

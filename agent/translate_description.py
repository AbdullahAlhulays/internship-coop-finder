#!/usr/bin/env python3
"""Translate the final, human-reviewed description at approval time.

Extraction deliberately keeps only source text. Abood can correct that
text in Telegram, then this module fills the missing English or Arabic
version immediately before the card is written to the website.
"""

from __future__ import annotations

import re
import time
from dataclasses import replace
from typing import Callable

from extract import Extracted


class DescriptionTranslationError(RuntimeError):
    """The final description could not be translated safely."""


TranslatorFn = Callable[[str, str, str], str]

GOOGLE_ATTEMPTS = 2
GOOGLE_RETRY_DELAY_SECONDS = 1
MYMEMORY_CHUNK_LIMIT = 450


def _google_translate(text: str, source: str, target: str) -> str:
    try:
        from deep_translator import GoogleTranslator
    except ImportError as exc:  # pragma: no cover - exercised in the Actions environment
        raise DescriptionTranslationError(
            "deep-translator is not installed; run pip install -r agent/requirements.txt"
        ) from exc

    return GoogleTranslator(source=source, target=target).translate(text=text)


def _split_translation_chunks(text: str, limit: int = MYMEMORY_CHUNK_LIMIT) -> list[str]:
    """Split text below a service limit, preferring line/word boundaries."""
    if limit < 1:
        raise ValueError("translation chunk limit must be positive")

    chunks: list[str] = []
    remaining = text.strip()
    while len(remaining) > limit:
        newline = remaining.rfind("\n", 0, limit + 1)
        space = remaining.rfind(" ", 0, limit + 1)
        split_at = max(newline, space)
        # A very early separator would create a tiny request. Hard-split
        # instead; this is only a last resort for an unusually long token.
        if split_at < limit // 2:
            split_at = limit
            consume_separator = False
        else:
            consume_separator = True

        chunk = remaining[:split_at].strip()
        if chunk:
            chunks.append(chunk)
        remaining = remaining[split_at + (1 if consume_separator else 0):].strip()

    if remaining:
        chunks.append(remaining)
    return chunks


def _mymemory_translate(text: str, source: str, target: str) -> str:
    """Use deep-translator's free secondary backend in bounded chunks."""
    try:
        from deep_translator import MyMemoryTranslator
    except ImportError as exc:  # pragma: no cover - exercised in the Actions environment
        raise DescriptionTranslationError(
            "deep-translator is not installed; run pip install -r agent/requirements.txt"
        ) from exc

    locale_codes = {"ar": "ar-SA", "en": "en-GB"}
    try:
        translator = MyMemoryTranslator(
            source=locale_codes[source],
            target=locale_codes[target],
        )
    except KeyError as exc:
        raise DescriptionTranslationError(
            f"unsupported description translation direction: {source} to {target}"
        ) from exc

    # Preserve blank-line paragraph boundaries. Each paragraph may still
    # need several requests because MyMemory accepts fewer than 500 chars.
    translated_paragraphs: list[str] = []
    for paragraph in re.split(r"\n\s*\n+", text.strip()):
        translated_chunks = [
            translator.translate(text=chunk)
            for chunk in _split_translation_chunks(paragraph)
        ]
        translated_paragraphs.append("\n".join(translated_chunks))
    return "\n\n".join(translated_paragraphs)


def _valid_translation(value: object, provider: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise DescriptionTranslationError(f"{provider} returned an empty translation")
    return value.strip()


def _translate_with_fallbacks(
    text: str,
    source: str,
    target: str,
    google_fn: TranslatorFn = _google_translate,
    mymemory_fn: TranslatorFn = _mymemory_translate,
    sleep_fn: Callable[[float], None] = time.sleep,
) -> str:
    """Try Google twice, then MyMemory, without involving the LLM."""
    failures: list[str] = []
    for attempt in range(1, GOOGLE_ATTEMPTS + 1):
        try:
            return _valid_translation(
                google_fn(text, source, target),
                "Google Translate",
            )
        except Exception as exc:
            # Some deep-translator exceptions include the full source text.
            # Record only the class name so Telegram failures stay concise.
            failures.append(f"Google attempt {attempt}: {type(exc).__name__}")
            if attempt < GOOGLE_ATTEMPTS:
                sleep_fn(GOOGLE_RETRY_DELAY_SECONDS)

    try:
        return _valid_translation(
            mymemory_fn(text, source, target),
            "MyMemory",
        )
    except Exception as exc:
        failures.append(f"MyMemory: {type(exc).__name__}")

    raise DescriptionTranslationError(
        f"couldn't translate the final description from {source} to {target}; "
        f"Google and MyMemory both failed ({'; '.join(failures)})"
    )


def translate_missing_description(
    extracted: Extracted,
    translator_fn: TranslatorFn = _translate_with_fallbacks,
) -> Extracted:
    """Return ``extracted`` with a missing en/ar description filled.

    No description means there is nothing to translate. Two existing
    languages means Abood already supplied both, so neither is touched.
    Only the missing counterpart of exactly one final source version is
    generated. Any translator failure aborts approval rather than
    publishing a misleading or half-localized card.
    """
    descriptions = {
        language: text.strip()
        for language, text in (extracted.description or {}).items()
        if language in {"en", "ar"} and isinstance(text, str) and text.strip()
    }

    if len(descriptions) != 1:
        return extracted

    source = next(iter(descriptions))
    target = "ar" if source == "en" else "en"
    source_text = descriptions[source]

    try:
        translated = translator_fn(source_text, source, target)
    except DescriptionTranslationError:
        raise
    except Exception as exc:
        raise DescriptionTranslationError(
            f"couldn't translate the final description from {source} to {target}: {exc}"
        ) from exc

    if not isinstance(translated, str) or not translated.strip():
        raise DescriptionTranslationError(
            f"translator returned an empty {target} description"
        )

    return replace(
        extracted,
        description={source: source_text, target: translated.strip()},
    )

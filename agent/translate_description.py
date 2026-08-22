#!/usr/bin/env python3
"""Translate the final, human-reviewed description at approval time.

Extraction deliberately keeps only source text. Abood can correct that
text in Telegram, then this module fills the missing English or Arabic
version immediately before the card is written to the website.
"""

from __future__ import annotations

from dataclasses import replace
from typing import Callable

from extract import Extracted


class DescriptionTranslationError(RuntimeError):
    """The final description could not be translated safely."""


TranslatorFn = Callable[[str, str, str], str]


def _google_translate(text: str, source: str, target: str) -> str:
    try:
        from deep_translator import GoogleTranslator
    except ImportError as exc:  # pragma: no cover - exercised in the Actions environment
        raise DescriptionTranslationError(
            "deep-translator is not installed; run pip install -r agent/requirements.txt"
        ) from exc

    return GoogleTranslator(source=source, target=target).translate(text=text)


def translate_missing_description(
    extracted: Extracted,
    translator_fn: TranslatorFn = _google_translate,
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

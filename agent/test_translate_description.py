#!/usr/bin/env python3
"""Offline checks for approval-time description translation."""

from dataclasses import replace

from extract import Extracted
from translate_description import (
    DescriptionTranslationError,
    _split_translation_chunks,
    _translate_with_fallbacks,
    translate_missing_description,
)

from _console import use_utf8_stdout

use_utf8_stdout()

results: list[bool] = []


def check(label: str, condition: bool) -> None:
    mark = "pass" if condition else "FAIL"
    print(f"  [{mark}] {label}")
    results.append(condition)


BASE = Extracted(
    is_opportunity=True,
    reason_excluded=None,
    type="coop",
    company="Example",
    title=None,
    url="https://example.com/apply",
    contact=None,
    requires_letter=False,
    deadline=None,
    deadline_raw=None,
    location="Riyadh, Saudi Arabia",
    confidence=0.95,
    evidence={},
)


print("English source: translate only the missing Arabic version")
calls = []


def translate_en(text: str, source: str, target: str) -> str:
    calls.append((text, source, target))
    return "النص العربي النهائي"


english = replace(BASE, description={"en": " Final edited English text. "})
translated = translate_missing_description(english, translator_fn=translate_en)
check("translator receives the final edited text", calls == [("Final edited English text.", "en", "ar")])
check(
    "source and translated text are both returned",
    translated.description == {"en": "Final edited English text.", "ar": "النص العربي النهائي"},
)
check("the original pending object is not mutated", english.description == {"en": " Final edited English text. "})


print("\nArabic source: translate only the missing English version")
arabic = replace(BASE, description={"ar": "الوصف النهائي بعد التعديل"})
translated = translate_missing_description(
    arabic,
    translator_fn=lambda text, source, target: "Final translated description",
)
check(
    "Arabic maps to English",
    translated.description == {
        "ar": "الوصف النهائي بعد التعديل",
        "en": "Final translated description",
    },
)


print("\nNo source or two manual languages: skip the translator")


def must_not_translate(*_args):
    raise AssertionError("translator should not be called")


check(
    "missing description stays missing",
    translate_missing_description(BASE, translator_fn=must_not_translate) is BASE,
)
bilingual = replace(BASE, description={"en": "English", "ar": "العربية"})
check(
    "two manually supplied languages are preserved",
    translate_missing_description(bilingual, translator_fn=must_not_translate) is bilingual,
)


print("\nFailure handling: never publish a blank or failed translation")
try:
    translate_missing_description(english, translator_fn=lambda *_args: "   ")
    check("blank translation raises", False)
except DescriptionTranslationError:
    check("blank translation raises", True)

try:
    translate_missing_description(
        english,
        translator_fn=lambda *_args: (_ for _ in ()).throw(RuntimeError("service unavailable")),
    )
    check("service failure is wrapped clearly", False)
except DescriptionTranslationError as exc:
    check("service failure is wrapped clearly", "service unavailable" in str(exc) and "en to ar" in str(exc))


print("\nDefault translator: retry Google, then use a non-LLM fallback")
fallback_calls = []
sleeps = []


def failing_google(text: str, source: str, target: str) -> str:
    fallback_calls.append(("google", text, source, target))
    raise RuntimeError("temporary Google failure containing private source text")


def working_mymemory(text: str, source: str, target: str) -> str:
    fallback_calls.append(("mymemory", text, source, target))
    return "Fallback translation"


fallback_result = _translate_with_fallbacks(
    "Final reviewed source",
    "ar",
    "en",
    google_fn=failing_google,
    mymemory_fn=working_mymemory,
    sleep_fn=sleeps.append,
)
check(
    "Google is retried before fallback",
    [call[0] for call in fallback_calls] == ["google", "google", "mymemory"],
)
check("retry uses one short bounded delay", sleeps == [1])
check("MyMemory result is returned without an LLM call", fallback_result == "Fallback translation")

try:
    _translate_with_fallbacks(
        "SECRET SOURCE MUST NOT APPEAR",
        "ar",
        "en",
        google_fn=failing_google,
        mymemory_fn=lambda *_args: (_ for _ in ()).throw(RuntimeError("also failed")),
        sleep_fn=lambda _seconds: None,
    )
    check("two-backend failure is concise and source-safe", False)
except DescriptionTranslationError as exc:
    detail = str(exc)
    check(
        "two-backend failure is concise and source-safe",
        "Google and MyMemory both failed" in detail
        and "SECRET SOURCE" not in detail
        and "private source text" not in detail,
    )

chunks = _split_translation_chunks("word " * 250)
check(
    "fallback chunks stay below the service limit",
    bool(chunks) and all(len(chunk) <= 450 for chunk in chunks),
)
check(
    "fallback chunking preserves all words",
    " ".join(chunks).split() == ("word " * 250).split(),
)


passed = sum(results)
total = len(results)
print(f"\n{passed}/{total} checks passed")
if passed != total:
    raise SystemExit(1)

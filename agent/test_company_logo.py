#!/usr/bin/env python3
"""Offline tests for the approval-time company logo resolver."""

import json
import tempfile
from pathlib import Path

from company_logo import resolve_company_logo


PNG = b"\x89PNG\r\n\x1a\n" + (b"safe-png-data" * 8)
WEBP = b"RIFF" + (120).to_bytes(4, "little") + b"WEBP" + (b"safe-webp-data" * 8)


class FakeResponse:
    def __init__(self, url, content, content_type):
        self.url = url
        self.content = content if isinstance(content, bytes) else content.encode("utf-8")
        self.text = content if isinstance(content, str) else content.decode("utf-8", errors="replace")
        self.status_code = 200
        self.headers = {"Content-Type": content_type}


def fake_get_from(routes):
    def fake_get(url, **_kwargs):
        if url not in routes:
            raise RuntimeError(f"unexpected URL {url}")
        content, content_type = routes[url]
        return FakeResponse(url, content, content_type)

    return fake_get


results = []


def check(label, condition):
    mark = "pass" if condition else "FAIL"
    print(f"  [{mark}] {label}")
    results.append(bool(condition))


print("official application domain is preferred without an LLM call")
with tempfile.TemporaryDirectory() as directory:
    application_url = "https://careers.examplebrand.com/jobs/42"
    page = '<html><title>Example Brand Careers</title><header><img alt="Example Brand logo" src="/brand.png"></header></html>'
    model_called = []

    def model_must_not_run(*_args, **_kwargs):
        model_called.append(True)
        raise AssertionError("the model should not run for a verified official application domain")

    result = resolve_company_logo(
        "Example Brand",
        application_url,
        output_dir=directory,
        model_fn=model_must_not_run,
        get_fn=fake_get_from({
            application_url: (page, "text/html"),
            "https://careers.examplebrand.com/brand.png": (PNG, "image/png"),
        }),
    )
    check("logo metadata is returned", result == {"domain": "careers.examplebrand.com", "file": "example-brand.png"})
    check("official image is stored locally", (Path(directory) / "example-brand.png").read_bytes() == PNG)
    check("LLM was not called", model_called == [])


print("\ngeneric form link uses a model suggestion only after live verification")
with tempfile.TemporaryDirectory() as directory:
    model_calls = []

    def model_fn(prompt, **kwargs):
        model_calls.append((json.loads(prompt), kwargs.get("system_prompt")))
        return json.dumps({"domain": "acme.sa", "confidence": 0.93})

    page = '<html><title>Acme Saudi</title><nav><img class="site-logo" src="/assets/acme.webp"></nav></html>'
    result = resolve_company_logo(
        "Acme Saudi",
        "https://forms.gle/example",
        output_dir=directory,
        model_fn=model_fn,
        get_fn=fake_get_from({
            "https://acme.sa/": (page, "text/html"),
            "https://acme.sa/assets/acme.webp": (WEBP, "image/webp"),
        }),
    )
    check("verified suggestion is accepted", result == {"domain": "acme.sa", "file": "acme-saudi.webp"})
    check("model received the reviewed company and URL", model_calls[0][0]["company"] == "Acme Saudi")
    check("downloaded file stays in the repository format", (Path(directory) / "acme-saudi.webp").is_file())


print("\nwrong or ambiguous suggestions fail closed")
with tempfile.TemporaryDirectory() as directory:
    result = resolve_company_logo(
        "Real Company",
        "https://linkedin.com/jobs/view/1",
        output_dir=directory,
        model_fn=lambda *_args, **_kwargs: json.dumps({"domain": "unrelated.example", "confidence": 0.99}),
        get_fn=fake_get_from({
            "https://unrelated.example/": ("<html><title>Different Organization</title></html>", "text/html"),
        }),
    )
    check("unmatched domain returns no logo", result is None)
    check("no unverified asset is written", not list(Path(directory).iterdir()))


print("\nHTML or unsafe content can never be saved as an image")
with tempfile.TemporaryDirectory() as directory:
    page_url = "https://unsafe-logo.example/jobs"
    page = '<html><title>Unsafe Logo Co</title><img alt="logo" src="/logo.png"></html>'
    result = resolve_company_logo(
        "Unsafe Logo Co",
        page_url,
        output_dir=directory,
        model_fn=lambda *_args, **_kwargs: json.dumps({"domain": None, "confidence": 0}),
        get_fn=fake_get_from({
            page_url: (page, "text/html"),
            "https://unsafe-logo.example/logo.png": ("<script>alert(1)</script>", "text/html"),
        }),
    )
    check("unsafe response falls back to initials", result is None)
    check("unsafe response is not written", not list(Path(directory).iterdir()))


passed = sum(results)
total = len(results)
print(f"\n{passed}/{total} checks passed")
if passed != total:
    raise SystemExit(1)

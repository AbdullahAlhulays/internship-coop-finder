#!/usr/bin/env python3
"""Resolve and safely store a logo for an approved opportunity.

The application URL is trusted first when it belongs to the organization.
Generic form, social, and recruiting hosts are never treated as the brand.
For those links, the existing Groq model may suggest an official domain, but
the suggestion is accepted only when the live page contains a distinctive
token from the reviewed company name. Images must come from that verified
page, use a browser-safe raster format, and stay below the size limit.

Logo lookup is best effort. A missing or unverifiable logo returns ``None`` so
the website keeps its initials fallback and an opportunity is never blocked.
"""

from __future__ import annotations

import hashlib
import ipaddress
import json
import os
import re
import tempfile
import unicodedata
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

from extract import call_model, strip_code_fences


LOGOS_DIR = "public/company-logos"
REQUEST_TIMEOUT = 20
MAX_PAGE_BYTES = 3_000_000
MAX_IMAGE_BYTES = 2_000_000
USER_AGENT = (
    "Mozilla/5.0 (compatible; FursatiLogoBot/1.0; "
    "+https://internship-coop-finder.vercel.app/)"
)

GENERIC_HOST_SUFFIXES = (
    "airtable.com",
    "bit.ly",
    "docs.google.com",
    "fillout.com",
    "forms.gle",
    "forms.office.com",
    "greenhouse.io",
    "indeed.com",
    "lever.co",
    "linkedin.com",
    "lnkd.in",
    "myworkdayjobs.com",
    "oraclecloud.com",
    "smartrecruiters.com",
    "successfactors.com",
    "t.me",
    "talentera.com",
    "tally.so",
    "telegram.me",
    "typeform.com",
    "wdeftksa.com",
    "x.com",
)

COMPANY_STOPWORDS = {
    "academy", "agency", "and", "company", "co", "corporation", "for",
    "group", "holding", "industries", "international", "limited", "ltd",
    "ministry", "of", "saudi", "services", "the",
    "أكاديمية", "الهيئة", "السعودية", "شركة", "شركات", "مجموعة", "مؤسسة",
    "وزارة",
}

LOGO_SYSTEM_PROMPT = """You identify official company websites for a logo
lookup. Return only JSON in this exact shape:
{"domain": "example.com" or null, "confidence": number}

Use the reviewed company name and application URL. Return a domain only when
you know the organization's official website with high confidence. Never
return a social network, job board, form provider, search engine, directory,
or guessed domain. If the organization is unnamed, generic, ambiguous, or you
are unsure, return null. Do not generate or describe a logo."""


class LogoLookupError(RuntimeError):
    """A candidate logo or domain failed a safety/validation check."""


def _host_from(value: str | None) -> str | None:
    if not value or not isinstance(value, str):
        return None
    candidate = value.strip()
    if "://" not in candidate:
        candidate = f"https://{candidate}"
    try:
        host = (urlparse(candidate).hostname or "").lower().rstrip(".")
    except ValueError:
        return None
    if host.startswith("www."):
        host = host[4:]
    if not host or len(host) > 253:
        return None
    try:
        parsed_ip = ipaddress.ip_address(host)
    except ValueError:
        parsed_ip = None
    # Official brand sites should use a domain name. Reject every direct IP,
    # not only private ranges, so reviewed links cannot turn this downloader
    # into a probe for arbitrary hosts.
    if parsed_ip is not None:
        return None
    if not re.fullmatch(
        r"(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}",
        host,
    ):
        return None
    return host


def _is_generic_host(host: str) -> bool:
    return any(host == suffix or host.endswith(f".{suffix}") for suffix in GENERIC_HOST_SUFFIXES)


def _company_terms(company_name: str) -> list[str]:
    terms: list[str] = []
    for token in re.findall(r"[A-Za-z0-9\u0600-\u06ff]+", company_name):
        normalized = token.casefold()
        if normalized in COMPANY_STOPWORDS:
            continue
        if len(normalized) >= 3 or (token.isupper() and len(token) >= 2):
            terms.append(normalized)
    return list(dict.fromkeys(terms))


def _slug(value: str) -> str:
    ascii_value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", ascii_value.lower()).strip("-")


def _logo_slug(company_name: str, domain: str) -> str:
    english_parts = [
        part.strip()
        for part in company_name.split("|")
        if re.search(r"[A-Za-z]", part)
    ]
    basis = english_parts[0] if english_parts else domain.split(".")[0]
    slug = _slug(basis)
    return slug or f"company-{hashlib.sha256(company_name.encode('utf-8')).hexdigest()[:10]}"


def _request(get_fn, url: str):
    response = get_fn(
        url,
        headers={"User-Agent": USER_AGENT, "Accept": "text/html,image/*;q=0.9,*/*;q=0.1"},
        timeout=REQUEST_TIMEOUT,
        allow_redirects=True,
    )
    status = getattr(response, "status_code", 0)
    if status < 200 or status >= 300:
        raise LogoLookupError(f"HTTP {status} for {url}")
    return response


def _fetch_html(get_fn, url: str) -> tuple[str, str]:
    response = _request(get_fn, url)
    content = getattr(response, "content", b"")
    if len(content) > MAX_PAGE_BYTES:
        raise LogoLookupError(f"page is larger than {MAX_PAGE_BYTES} bytes")
    content_type = (getattr(response, "headers", {}) or {}).get("Content-Type", "").lower()
    if content_type and "html" not in content_type and "xhtml" not in content_type:
        raise LogoLookupError(f"expected HTML, received {content_type}")
    text = getattr(response, "text", None)
    if not isinstance(text, str):
        text = content.decode("utf-8", errors="replace")
    return text, getattr(response, "url", url)


def _page_matches_company(html: str, final_url: str, company_name: str) -> bool:
    terms = _company_terms(company_name)
    if not terms:
        return False
    soup = BeautifulSoup(html, "html.parser")
    visible = soup.get_text(" ", strip=True).casefold()
    title = soup.title.get_text(" ", strip=True).casefold() if soup.title else ""
    metadata = " ".join(
        tag.get("content", "")
        for tag in soup.find_all("meta")
        if str(tag.get("property", "")).lower() in {"og:site_name", "og:title"}
        or str(tag.get("name", "")).lower() in {"application-name", "twitter:title"}
    ).casefold()
    host = (_host_from(final_url) or "").replace("-", "").replace(".", "")
    haystack = f"{title} {metadata} {visible[:300000]}"
    for term in terms:
        compact_term = term.replace("-", "")
        if len(term) <= 2:
            if re.search(rf"(?<![\w]){re.escape(term)}(?![\w])", haystack):
                return True
            if host.startswith(compact_term):
                return True
            continue
        if term in haystack or compact_term in host:
            return True
    return False


def _walk_logo_values(value):
    if isinstance(value, dict):
        for key, nested in value.items():
            if str(key).casefold() == "logo":
                if isinstance(nested, str):
                    yield nested
                elif isinstance(nested, dict):
                    for url_key in ("url", "contentUrl"):
                        if isinstance(nested.get(url_key), str):
                            yield nested[url_key]
            yield from _walk_logo_values(nested)
    elif isinstance(value, list):
        for nested in value:
            yield from _walk_logo_values(nested)


def _logo_candidates(html: str, page_url: str) -> list[str]:
    soup = BeautifulSoup(html, "html.parser")
    scored: list[tuple[int, str]] = []

    for script in soup.find_all("script", attrs={"type": re.compile("ld\\+json", re.I)}):
        try:
            payload = json.loads(script.string or script.get_text())
        except (TypeError, json.JSONDecodeError):
            continue
        for value in _walk_logo_values(payload):
            scored.append((130, urljoin(page_url, value)))

    for tag in soup.find_all(attrs={"itemprop": re.compile("logo", re.I)}):
        value = tag.get("content") or tag.get("src") or tag.get("href")
        if value:
            scored.append((120, urljoin(page_url, value)))

    for image in soup.find_all("img"):
        src = image.get("src") or image.get("data-src") or image.get("data-lazy-src")
        if not src or str(src).startswith("data:"):
            continue
        descriptor = " ".join(
            [
                str(image.get("alt", "")),
                str(image.get("id", "")),
                " ".join(image.get("class", [])),
                str(src),
            ]
        ).casefold()
        score = 0
        if "logo" in descriptor:
            score += 100
        if "brand" in descriptor:
            score += 45
        if image.find_parent(["header", "nav"]):
            score += 30
        if score:
            scored.append((score, urljoin(page_url, src)))

    for link in soup.find_all("link", href=True):
        rel = " ".join(link.get("rel", [])).casefold()
        if "icon" in rel:
            score = 65 if "apple" in rel else 50
            scored.append((score, urljoin(page_url, link["href"])))

    for meta in soup.find_all("meta", content=True):
        key = str(meta.get("property") or meta.get("name") or "").casefold()
        content = str(meta["content"])
        if key in {"og:image", "twitter:image"} and "logo" in content.casefold():
            scored.append((55, urljoin(page_url, content)))

    scored.append((5, urljoin(page_url, "/favicon.ico")))
    unique: list[str] = []
    for _, url in sorted(scored, key=lambda item: item[0], reverse=True):
        if url.startswith(("http://", "https://")) and url not in unique:
            unique.append(url)
    return unique


def _image_extension(content: bytes) -> str | None:
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if content.startswith(b"\xff\xd8\xff"):
        return "jpg"
    if content.startswith((b"GIF87a", b"GIF89a")):
        return "gif"
    if len(content) >= 12 and content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        return "webp"
    if content.startswith(b"\x00\x00\x01\x00"):
        return "ico"
    return None


def _existing_logo(output_dir: Path, slug: str) -> Path | None:
    for extension in ("png", "jpg", "jpeg", "webp", "ico"):
        path = output_dir / f"{slug}.{extension}"
        if path.is_file() and path.stat().st_size > 0:
            return path
    return None


def _download_logo(get_fn, url: str, output_dir: Path, slug: str, domain: str) -> Path:
    response = _request(get_fn, url)
    content = getattr(response, "content", b"")
    if not isinstance(content, bytes) or len(content) < 32:
        raise LogoLookupError("logo response is empty or too small")
    if len(content) > MAX_IMAGE_BYTES:
        raise LogoLookupError(f"logo is larger than {MAX_IMAGE_BYTES} bytes")
    extension = _image_extension(content)
    if extension == "gif":
        raise LogoLookupError("animated GIF logos are not accepted")
    if extension is None:
        raise LogoLookupError("logo is not a validated PNG, JPEG, WebP, or ICO image")

    output_dir.mkdir(parents=True, exist_ok=True)
    target = output_dir / f"{slug}.{extension}"
    if target.exists() and target.read_bytes() != content:
        digest = hashlib.sha256(f"{domain}|{url}".encode()).hexdigest()[:8]
        target = output_dir / f"{slug}-{digest}.{extension}"
    if target.exists() and target.read_bytes() == content:
        return target

    fd, temporary_name = tempfile.mkstemp(dir=output_dir, prefix=f".{slug}-", suffix=".tmp")
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(content)
        os.replace(temporary_name, target)
    except BaseException:
        Path(temporary_name).unlink(missing_ok=True)
        raise
    return target


def _suggest_domain(company_name: str, application_url: str, model_fn) -> str | None:
    prompt = json.dumps(
        {"company": company_name, "application_url": application_url},
        ensure_ascii=False,
    )
    try:
        raw = model_fn(prompt, system_prompt=LOGO_SYSTEM_PROMPT)
        payload = json.loads(strip_code_fences(raw))
    except Exception as exc:
        print(f"Logo lookup: model domain suggestion unavailable: {exc}")
        return None
    confidence = payload.get("confidence")
    if isinstance(confidence, bool) or not isinstance(confidence, (int, float)) or confidence < 0.75:
        return None
    host = _host_from(payload.get("domain"))
    if not host or _is_generic_host(host):
        return None
    return host


def resolve_company_logo(
    company_name: str,
    application_url: str,
    *,
    output_dir: str | Path = LOGOS_DIR,
    model_fn=call_model,
    get_fn=requests.get,
) -> dict[str, str] | None:
    """Return ``{"domain": ..., "file": ...}`` or ``None``.

    The function never invents an image and never returns a remote image URL.
    Every accepted asset is copied into the repository so the live website has
    no runtime dependency on a third-party logo service.
    """
    if not company_name or not application_url:
        return None

    candidates: list[tuple[str, str]] = []
    application_host = _host_from(application_url)
    if application_host and not _is_generic_host(application_host):
        candidates.append((application_host, application_url))

    destination = Path(output_dir)

    def try_candidate(domain: str, first_url: str) -> dict[str, str] | None:
        page_urls = list(dict.fromkeys([first_url, f"https://{domain}/"]))
        for page_url in page_urls:
            try:
                html, final_url = _fetch_html(get_fn, page_url)
                if not _page_matches_company(html, final_url, company_name):
                    raise LogoLookupError("official page could not be matched to the reviewed company name")
                slug = _logo_slug(company_name, domain)
                existing = _existing_logo(destination, slug)
                if existing:
                    return {"domain": domain, "file": existing.name}
                for logo_url in _logo_candidates(html, final_url):
                    try:
                        saved = _download_logo(get_fn, logo_url, destination, slug, domain)
                        return {"domain": domain, "file": saved.name}
                    except Exception:
                        continue
            except Exception as exc:
                print(f"Logo lookup: skipped {page_url}: {exc}")
        return None

    # Fast, deterministic path first. The LLM is not called when the
    # reviewed application already lives on a verifiable official site.
    for domain, first_url in candidates:
        result = try_candidate(domain, first_url)
        if result:
            return result

    suggested_host = _suggest_domain(company_name, application_url, model_fn)
    if suggested_host and all(host != suggested_host for host, _ in candidates):
        result = try_candidate(suggested_host, f"https://{suggested_host}/")
        if result:
            return result
    return None


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Resolve and download an official company logo.")
    parser.add_argument("company")
    parser.add_argument("application_url")
    parser.add_argument("--output-dir", default=LOGOS_DIR)
    args = parser.parse_args()
    result = resolve_company_logo(args.company, args.application_url, output_dir=args.output_dir)
    print(json.dumps(result, ensure_ascii=False))

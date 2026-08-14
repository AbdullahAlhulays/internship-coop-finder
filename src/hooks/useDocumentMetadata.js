import { useEffect } from "react";

function ensureMeta(name) {
  let element = document.head.querySelector(`meta[name="${name}"]`);

  if (!element) {
    element = document.createElement("meta");
    element.name = name;
    document.head.append(element);
  }

  return element;
}

function ensureCanonicalLink() {
  let element = document.head.querySelector('link[rel="canonical"]');

  if (!element) {
    element = document.createElement("link");
    element.rel = "canonical";
    document.head.append(element);
  }

  return element;
}

function ensureAlternateLink(language) {
  let element = document.head.querySelector(
    `link[rel="alternate"][hreflang="${language}"]`,
  );

  if (!element) {
    element = document.createElement("link");
    element.rel = "alternate";
    element.hreflang = language;
    document.head.append(element);
  }

  return element;
}

export default function useDocumentMetadata({
  title,
  description,
  canonicalUrl,
  alternateUrls,
  noIndex = false,
}) {
  useEffect(() => {
    document.title = title;
    ensureMeta("description").content = description;
    ensureCanonicalLink().href = canonicalUrl;

    const robots = ensureMeta("robots");
    robots.content = noIndex ? "noindex, nofollow" : "index, follow";

    ["en", "ar", "x-default"].forEach((language) => {
      const url = alternateUrls?.[language];
      const existingLink = document.head.querySelector(
        `link[rel="alternate"][hreflang="${language}"]`,
      );

      if (url) {
        ensureAlternateLink(language).href = url;
      } else {
        existingLink?.remove();
      }
    });
  }, [alternateUrls, canonicalUrl, description, noIndex, title]);
}

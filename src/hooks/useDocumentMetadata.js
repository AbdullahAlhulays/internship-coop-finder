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

function ensureProperty(property) {
  let element = document.head.querySelector(`meta[property="${property}"]`);

  if (!element) {
    element = document.createElement("meta");
    element.setAttribute("property", property);
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
  websiteSchema = false,
  modifiedAt,
}) {
  useEffect(() => {
    document.title = title;
    ensureMeta("description").content = description;
    ensureCanonicalLink().href = canonicalUrl;
    ensureProperty("og:site_name").content = "Fursati";
    ensureProperty("og:type").content = "website";
    ensureProperty("og:title").content = title;
    ensureProperty("og:description").content = description;
    ensureProperty("og:url").content = canonicalUrl;
    ensureProperty("og:locale").content =
      new URL(canonicalUrl).pathname.startsWith("/ar") ? "ar_SA" : "en_US";
    ensureMeta("twitter:card").content = "summary_large_image";
    ensureMeta("twitter:title").content = title;
    ensureMeta("twitter:description").content = description;

    const schema = document.getElementById("website-schema");
    if (websiteSchema && !schema) {
      const element = document.createElement("script");
      element.id = "website-schema";
      element.type = "application/ld+json";
      element.textContent = JSON.stringify({
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: "Fursati",
        alternateName: ["فرصتي"],
        url: "https://internship-coop-finder.vercel.app/",
      });
      document.head.append(element);
    } else if (!websiteSchema) {
      schema?.remove();
    }

    let pageSchema = document.getElementById("page-schema");
    if (modifiedAt) {
      if (!pageSchema) {
        pageSchema = document.createElement("script");
        pageSchema.id = "page-schema";
        pageSchema.type = "application/ld+json";
        document.head.append(pageSchema);
      }
      pageSchema.textContent = JSON.stringify({
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: title,
        url: canonicalUrl,
        inLanguage: new URL(canonicalUrl).pathname.startsWith("/ar") ? "ar" : "en",
        dateModified: modifiedAt,
      });
    } else {
      pageSchema?.remove();
    }

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
  }, [alternateUrls, canonicalUrl, description, modifiedAt, noIndex, title, websiteSchema]);
}

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { companies } from "../src/data/companies.js";
import { getLocalizedSitePage, SITE_CONTENT_UPDATED } from "../src/data/siteContent.js";
import { getMessages } from "../src/locales/messages.js";
import { getEnglishCompanyName } from "../src/data/companyLogos.js";
import { getLocalizedCompanyDescription, getLocalizedLocation } from "../src/utils/locale.js";
import {
  getCanonicalUrl,
  getCompanyPageDescription,
  getCompanyPageTitle,
  getPublishableCompanyPageEntries,
  getCompanyPath,
  getHomePageDescription,
  getHomePageTitle,
  getRestoredArabicCompanyName,
  hasRestoredCompanyPage,
} from "../src/utils/companyRoutes.js";
import {
  getSitePageEntries,
  getSitePagePath,
} from "../src/utils/siteRoutes.js";

const distDirectory = fileURLToPath(new URL("../dist", import.meta.url));
const template = await readFile(path.join(distDirectory, "index.html"), "utf8");
const publishedCompanies = getPublishableCompanyPageEntries(companies);

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function replaceAlternateLink(document, language, url) {
  const pattern = new RegExp(
    `<link\\s+rel="alternate"\\s+hreflang="${language}"\\s+href="[^"]*"\\s*\\/>`,
    "s",
  );

  return document.replace(
    pattern,
    `<link rel="alternate" hreflang="${language}" href="${escapeHtml(url)}" />`,
  );
}

function replaceMeta(document, attribute, key, content) {
  const pattern = new RegExp(
    `<meta\\s+${attribute}="${key}"\\s+content="[^"]*"\\s*\\/>`,
    "s",
  );

  return document.replace(
    pattern,
    `<meta ${attribute}="${key}" content="${escapeHtml(content)}" />`,
  );
}

function renderHomeFallback(locale) {
  const messages = getMessages(locale);
  const links = publishedCompanies
    .map(({ company, slug }) =>
      `<li><a href="${escapeHtml(getCompanyPath(slug, locale))}">${escapeHtml(getEnglishCompanyName(company.name))}</a></li>`,
    )
    .join("");

  return `<main><h1>${escapeHtml(messages.seo.homeTitle)}</h1><p>${escapeHtml(messages.seo.homeDescription)}</p><nav aria-label="${escapeHtml(messages.companyPage.allOpportunities)}"><ul>${links}</ul></nav></main>`;
}

function renderInformationFallback(content, locale) {
  const sections = content.sections
    .map((section) => {
      const paragraphs = (section.paragraphs ?? [])
        .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
        .join("");
      const bullets = section.bullets?.length
        ? `<ul>${section.bullets.map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join("")}</ul>`
        : "";

      return `<section><h2>${escapeHtml(section.heading)}</h2>${paragraphs}${bullets}</section>`;
    })
    .join("");

  return `<main><a href="${locale === "ar" ? "/ar" : "/"}">${escapeHtml(getMessages(locale).companyPage.allOpportunities)}</a><article><h1>${escapeHtml(content.title)}</h1><p>${escapeHtml(content.intro)}</p>${sections}</article></main>`;
}

function renderCompanyFallback(company, slug, locale) {
  const messages = getMessages(locale);
  const description = getLocalizedCompanyDescription(company, locale);
  const sections = description
    .split(/\n{2,}/)
    .map((section) => section.split("\n").map((line) => line.trim()).filter(Boolean))
    .filter((section) => section.length)
    .map(([heading, ...lines]) => {
      const paragraphs = lines
        .filter((line) => !line.startsWith("• "))
        .map((line) => `<p>${escapeHtml(line)}</p>`)
        .join("");
      const bullets = lines.filter((line) => line.startsWith("• "));
      const list = bullets.length
        ? `<ul>${bullets.map((line) => `<li>${escapeHtml(line.slice(2))}</li>`).join("")}</ul>`
        : "";
      const headingHtml =
        heading.length < 70
          ? `<h2>${escapeHtml(heading)}</h2>`
          : `<p>${escapeHtml(heading)}</p>`;

      return `<section>${headingHtml}${paragraphs}${list}</section>`;
    })
    .join("");
  const location = company.location?.trim()
    ? `<p>${escapeHtml(getLocalizedLocation(company.location, locale))}</p>`
    : "";
  const deadline = company.deadline
    ? `<p>${locale === "ar" ? "آخر موعد للتقديم" : "Application deadline"}: <time datetime="${escapeHtml(company.deadline)}">${escapeHtml(company.deadline)}</time></p>`
    : "";
  const letter = company.requiresLetter
    ? `<p>${locale === "ar" ? "خطاب الجامعة مطلوب" : "University letter required"}</p>`
    : "";
  const verified = company.lastVerifiedAt
    ? `<p>${locale === "ar" ? "آخر تحقق" : "Last verified"}: <time datetime="${escapeHtml(company.lastVerifiedAt)}">${escapeHtml(company.lastVerifiedAt.slice(0, 10))}</time></p>`
    : "";
  const closed = company.isClosed
    ? `<p>${locale === "ar" ? "التقديم مغلق" : "Applications closed"}</p>`
    : "";
  const application = /^https?:\/\//i.test(company.applicationLink)
    ? `<p><a href="${escapeHtml(company.applicationLink)}" rel="nofollow noopener noreferrer">${escapeHtml(hasRestoredCompanyPage(company) ? (locale === "ar" ? "مصدر التقديم" : "Application source") : messages.companyPage.applyOfficial)}</a></p>`
    : "";
  const related = publishedCompanies
    .filter(({ company: other, slug: otherSlug }) =>
      otherSlug !== slug &&
      other.location &&
      company.location &&
      other.location === company.location,
    )
    .slice(0, 3)
    .map(({ company: other, slug: otherSlug }) =>
      `<li><a href="${escapeHtml(getCompanyPath(otherSlug, locale))}">${escapeHtml(getEnglishCompanyName(other.name))}</a></li>`,
    )
    .join("");
  const relatedLinks = related
    ? `<nav aria-label="${locale === "ar" ? "فرص ذات صلة" : "Related opportunities"}"><h2>${locale === "ar" ? "فرص ذات صلة" : "Related opportunities"}</h2><ul>${related}</ul></nav>`
    : "";
  const name =
    locale === "ar" && hasRestoredCompanyPage(company)
      ? getRestoredArabicCompanyName(company)
      : getEnglishCompanyName(company.name);
  const type =
    locale === "ar" && hasRestoredCompanyPage(company)
      ? company.type.includes("CO-OP") && company.type.includes("Internship")
        ? "تدريب وتدريب تعاوني"
        : company.type.includes("CO-OP")
          ? "تدريب تعاوني"
          : "تدريب"
      : company.type || "";

  return `<main><a href="${locale === "ar" ? "/ar" : "/"}">${escapeHtml(messages.companyPage.allOpportunities)}</a><article><h1>${escapeHtml(messages.companyPage.heading(name))}</h1>${location}<p>${escapeHtml(type)}</p>${closed}${deadline}${letter}${verified}${sections}${application}${relatedLinks}</article></main>`;
}

function renderDocument({
  locale,
  title,
  description,
  canonicalPath,
  englishPath,
  arabicPath,
  bodyHtml = "",
  websiteSchema = false,
  modifiedAt,
}) {
  const canonicalUrl = getCanonicalUrl(canonicalPath);
  let document = template
    .replace(
      /<html\s+lang="en"\s+dir="ltr">/,
      `<html lang="${locale}" dir="${locale === "ar" ? "rtl" : "ltr"}">`,
    )
    .replace(/<title>.*?<\/title>/s, `<title>${escapeHtml(title)}</title>`)
    .replace(
      /<meta\s+name="description"\s+content="[^"]*"\s*\/>/s,
      `<meta name="description" content="${escapeHtml(description)}" />`,
    )
    .replace(
      /<link\s+rel="canonical"\s+href="[^"]*"\s*\/>/s,
      `<link rel="canonical" href="${escapeHtml(canonicalUrl)}" />`,
    )
    .replace(
      '<div id="root"></div>',
      `<div id="root"><div class="seo-fallback">${bodyHtml}</div></div>`,
    );

  for (const [property, value] of [
    ["og:title", title],
    ["og:description", description],
    ["og:url", canonicalUrl],
    ["og:locale", locale === "ar" ? "ar_SA" : "en_US"],
  ]) {
    document = replaceMeta(document, "property", property, value);
  }
  for (const [name, value] of [
    ["twitter:title", title],
    ["twitter:description", description],
  ]) {
    document = replaceMeta(document, "name", name, value);
  }
  if (!websiteSchema) {
    document = document.replace(/\s*<script type="application\/ld\+json" id="website-schema">.*?<\/script>/s, "");
  }
  if (modifiedAt) {
    const pageSchema = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: title,
      url: canonicalUrl,
      inLanguage: locale,
      dateModified: modifiedAt,
    }).replace(/</g, "\\u003c");
    document = document.replace(
      "</head>",
      `    <script type="application/ld+json" id="page-schema">${pageSchema}</script>\n  </head>`,
    );
  }

  document = replaceAlternateLink(
    document,
    "en",
    getCanonicalUrl(englishPath),
  );
  document = replaceAlternateLink(
    document,
    "ar",
    getCanonicalUrl(arabicPath),
  );

  return replaceAlternateLink(
    document,
    "x-default",
    getCanonicalUrl(englishPath),
  );
}

async function writeLocalizedPage(relativeFilePath, document) {
  const outputPath = path.join(distDirectory, relativeFilePath);

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, document);
}

await writeLocalizedPage(
  "index.html",
  renderDocument({
    locale: "en",
    title: getHomePageTitle("en"),
    description: getHomePageDescription("en"),
    canonicalPath: "/",
    englishPath: "/",
    arabicPath: "/ar",
    bodyHtml: renderHomeFallback("en"),
    websiteSchema: true,
  }),
);

await writeLocalizedPage(
  "ar.html",
  renderDocument({
    locale: "ar",
    title: getHomePageTitle("ar"),
    description: getHomePageDescription("ar"),
    canonicalPath: "/ar",
    englishPath: "/",
    arabicPath: "/ar",
    bodyHtml: renderHomeFallback("ar"),
    websiteSchema: true,
  }),
);

await Promise.all(
  getSitePageEntries().map(({ locale, page, path: pagePath }) => {
    const content = getLocalizedSitePage(page.slug, locale);
    const englishPath = getSitePagePath(page.slug, "en");
    const arabicPath = getSitePagePath(page.slug, "ar");
    const relativeFilePath =
      locale === "ar"
        ? path.join("ar", `${page.slug}.html`)
        : `${page.slug}.html`;

    return writeLocalizedPage(
      relativeFilePath,
      renderDocument({
        locale,
        title: `${content.title} | ${getMessages(locale).siteName}`,
        description: content.description,
        canonicalPath: pagePath,
        englishPath,
        arabicPath,
        bodyHtml: renderInformationFallback(content, locale),
        modifiedAt: SITE_CONTENT_UPDATED,
      }),
    );
  }),
);

await Promise.all(
  publishedCompanies.flatMap(({ company, slug }) => {
    const englishPath = getCompanyPath(slug, "en");
    const arabicPath = getCompanyPath(slug, "ar");

    return [
      writeLocalizedPage(
        path.join("companies", `${slug}.html`),
        renderDocument({
          locale: "en",
          title: getCompanyPageTitle(company, "en"),
          description: getCompanyPageDescription(company, "en"),
          canonicalPath: englishPath,
          englishPath,
          arabicPath,
          bodyHtml: renderCompanyFallback(company, slug, "en"),
          modifiedAt: company.contentUpdatedAt,
        }),
      ),
      writeLocalizedPage(
        path.join("ar", "companies", `${slug}.html`),
        renderDocument({
          locale: "ar",
          title: getCompanyPageTitle(company, "ar"),
          description: getCompanyPageDescription(company, "ar"),
          canonicalPath: arabicPath,
          englishPath,
          arabicPath,
          bodyHtml: renderCompanyFallback(company, slug, "ar"),
          modifiedAt: company.contentUpdatedAt,
        }),
      ),
    ];
  }),
);

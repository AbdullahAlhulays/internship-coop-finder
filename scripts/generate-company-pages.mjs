import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { companies } from "../src/data/companies.js";
import {
  getCanonicalUrl,
  getCompanyPageDescription,
  getCompanyPageEntries,
  getCompanyPageTitle,
  getCompanyPath,
  getHomePageDescription,
  getHomePageTitle,
} from "../src/utils/companyRoutes.js";

const distDirectory = fileURLToPath(new URL("../dist", import.meta.url));
const template = await readFile(path.join(distDirectory, "index.html"), "utf8");

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

function renderDocument({
  locale,
  title,
  description,
  canonicalPath,
  englishPath,
  arabicPath,
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
    );

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
  "ar.html",
  renderDocument({
    locale: "ar",
    title: getHomePageTitle("ar"),
    description: getHomePageDescription("ar"),
    canonicalPath: "/ar",
    englishPath: "/",
    arabicPath: "/ar",
  }),
);

await Promise.all(
  getCompanyPageEntries(companies).flatMap(({ company, slug }) => {
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
        }),
      ),
    ];
  }),
);

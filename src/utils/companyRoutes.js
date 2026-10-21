import { getEnglishCompanyName } from "../data/companyLogos.js";
import { getMessages } from "../locales/messages.js";
import {
  DEFAULT_LOCALE,
  getLocalizedCompanyDescription,
  getLocalizedLocation,
  localizePathname,
  normalizePathname,
  stripLocaleFromPathname,
} from "./locale.js";

export const SITE_ORIGIN = "https://internship-coop-finder.vercel.app";

// These existing listings had indexed detail URLs before the bilingual
// description requirement. Their recorded facts support a concise page.
const RESTORED_COMPANY_SLUGS = new Set([
  "tamara",
  "ministry-of-tourism",
  "petro-rabigh",
  "emdad",
  "sami",
  "alfalak",
  "saudi-railway-polytechnic",
  "roland-berger",
  "saudi-azm",
  "al-rajhi-takaful",
  "barakah",
  "saudi-power-procurement-company-sppc",
]);

export function createCompanySlug(name = "") {
  const englishName = getEnglishCompanyName(name);

  return (
    englishName
      .normalize("NFKD")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "company"
  );
}

export function getCompanyPageEntries(companies = []) {
  const slugCounts = new Map();
  const usedSlugs = new Set();

  return companies.map((company) => {
    const baseSlug = createCompanySlug(company.name);
    let slugCount = (slugCounts.get(baseSlug) ?? 0) + 1;
    let slug = slugCount === 1 ? baseSlug : `${baseSlug}-${slugCount}`;

    if (company.pageSlug) {
      slug = company.pageSlug;
    } else {
      while (usedSlugs.has(slug)) {
        slugCount += 1;
        slug = `${baseSlug}-${slugCount}`;
      }
    }

    if (usedSlugs.has(slug)) {
      throw new Error(`Duplicate company page slug: ${slug}`);
    }

    slugCounts.set(baseSlug, slugCount);
    usedSlugs.add(slug);

    return { company, slug };
  });
}

export function hasPublishableCompanyContent(company) {
  const hasBilingualDescription = ["en", "ar"].every((locale) =>
    Boolean(getLocalizedCompanyDescription(company, locale)),
  );

  return (
    hasBilingualDescription ||
    (RESTORED_COMPANY_SLUGS.has(createCompanySlug(company?.name)) &&
      Boolean(company?.type) &&
      Boolean(company?.applicationLink))
  );
}

export function hasRestoredCompanyPage(company) {
  return RESTORED_COMPANY_SLUGS.has(createCompanySlug(company?.name));
}

export function getRestoredArabicCompanyName(company) {
  return (
    company?.name
      ?.split("|")
      .map((part) => part.trim())
      .find((part) => /[\u0600-\u06ff]/.test(part)) ??
    getEnglishCompanyName(company?.name)
  );
}

export function getPublishableCompanyPageEntries(companies = []) {
  return getCompanyPageEntries(companies).filter(({ company }) =>
    hasPublishableCompanyContent(company),
  );
}

export function getCompanySlugFromPathname(pathname = "/") {
  const match = stripLocaleFromPathname(pathname).match(
    /^\/companies\/([^/]+)$/,
  );

  if (!match) {
    return null;
  }

  try {
    return decodeURIComponent(match[1]).toLowerCase();
  } catch {
    return null;
  }
}

export function isCompanyPath(pathname = "/") {
  return stripLocaleFromPathname(pathname).startsWith("/companies/");
}

export function getCompanyPath(slug, locale = DEFAULT_LOCALE) {
  return localizePathname(`/companies/${slug}`, locale);
}

export function getCompanyPageTitle(company, locale = DEFAULT_LOCALE) {
  const name = getEnglishCompanyName(company?.name);

  return getMessages(locale).seo.companyTitle(name);
}

function trimDescription(description, maxLength = 160) {
  const normalized = description.replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  const shortened = normalized.slice(0, maxLength - 1);
  const lastSpace = shortened.lastIndexOf(" ");
  const endIndex = lastSpace > maxLength - 24 ? lastSpace : shortened.length;

  return `${shortened.slice(0, endIndex)}\u2026`;
}

function getDescriptionDetail(description) {
  const lines = description
    .split(/\n+/)
    .map((line) => line.replace(/^[\s\u2022\-]+/, "").trim())
    .filter(Boolean);

  return (
    lines.find((line) => line.length >= 45 && /[.!?\u061f\u3002]$/.test(line)) ??
    lines.find((line) => line.length >= 45) ??
    lines.find((line) => line.length >= 20) ??
    ""
  );
}

export function getCompanyPageDescription(
  company,
  locale = DEFAULT_LOCALE,
) {
  const description = getLocalizedCompanyDescription(company, locale);

  if (description) {
    const englishDetail = getDescriptionDetail(
      getLocalizedCompanyDescription(company, "en"),
    );
    const sourceMentionsCoop = /\b(?:co-op|coop|cooperative training)\b/i.test(
      englishDetail,
    );
    const sourceMentionsInternship = /\binternship\b/i.test(englishDetail);
    const statedType =
      company.type === "Internship" && sourceMentionsCoop
        ? sourceMentionsInternship
          ? "Internship / CO-OP Training"
          : "CO-OP Training"
        : company.type;
    const name =
      locale === "ar"
        ? company.name
            .split("|")
            .map((part) => part.trim())
            .find((part) => /[\u0600-\u06ff]/.test(part)) ??
          getEnglishCompanyName(company.name)
        : getEnglishCompanyName(company.name);
    const type =
      locale === "ar"
        ? statedType?.toLowerCase().includes("internship")
          ? statedType?.toLowerCase().includes("co-op")
            ? "تدريب وتدريب تعاوني"
            : "تدريب"
          : "تدريب تعاوني"
        : statedType || "training";
    const location =
      locale === "en" && company.location?.trim()
        ? ` in ${company.location.trim()}`
        : "";
    const detail = getDescriptionDetail(description).replace(/[.!?\u061f\u3002]+$/, "");
    const intro =
      locale === "ar"
        ? `${type} لدى ${name}. `
        : `${name} ${type}${location}. `;

    return trimDescription(`${intro}${detail}.`);
  }

  if (hasRestoredCompanyPage(company)) {
    const name =
      locale === "ar"
        ? getRestoredArabicCompanyName(company)
        : getEnglishCompanyName(company.name);
    const type =
      locale === "ar"
        ? company.type.includes("CO-OP") && company.type.includes("Internship")
          ? "تدريب وتدريب تعاوني"
          : company.type.includes("CO-OP")
            ? "تدريب تعاوني"
            : "تدريب"
        : company.type;
    const location = company.location?.trim()
      ? locale === "ar"
        ? ` في ${getLocalizedLocation(company.location, locale)}`
        : ` in ${company.location.trim()}`
      : "";
    const status = company.isClosed
      ? locale === "ar"
        ? "التقديم مغلق. "
        : "Applications are marked closed. "
      : "";

    return trimDescription(
      locale === "ar"
        ? `${type} لدى ${name}${location}. ${status}اطلع على التفاصيل المتاحة ومصدر التقديم في فرصتي.`
        : `${name}: ${type}${location}. ${status}View recorded details and the application source on Fursati.`,
    );
  }

  const name = getEnglishCompanyName(company?.name);

  return getMessages(locale).seo.companyDescription(name);
}

export function getHomePageTitle(locale = DEFAULT_LOCALE) {
  return getMessages(locale).seo.homeTitle;
}

export function getHomePageDescription(locale = DEFAULT_LOCALE) {
  return getMessages(locale).seo.homeDescription;
}

export function getCanonicalUrl(pathname = "/") {
  return new URL(normalizePathname(pathname), SITE_ORIGIN).href;
}

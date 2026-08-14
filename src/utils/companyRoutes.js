import { getEnglishCompanyName } from "../data/companyLogos.js";
import { getMessages } from "../locales/messages.js";
import {
  DEFAULT_LOCALE,
  getLocalizedCompanyDescription,
  localizePathname,
  normalizePathname,
  stripLocaleFromPathname,
} from "./locale.js";

export const SITE_ORIGIN = "https://internship-coop-finder.vercel.app";

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

  return companies.map((company) => {
    const baseSlug = createCompanySlug(company.name);
    const slugCount = (slugCounts.get(baseSlug) ?? 0) + 1;
    const slug = slugCount === 1 ? baseSlug : `${baseSlug}-${slugCount}`;

    slugCounts.set(baseSlug, slugCount);

    return { company, slug };
  });
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

function trimDescription(description, maxLength = 158) {
  const normalized = description.replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  const shortened = normalized.slice(0, maxLength - 1);
  const lastSpace = shortened.lastIndexOf(" ");
  const endIndex = lastSpace > maxLength - 24 ? lastSpace : shortened.length;

  return `${shortened.slice(0, endIndex)}\u2026`;
}

export function getCompanyPageDescription(
  company,
  locale = DEFAULT_LOCALE,
) {
  const description = getLocalizedCompanyDescription(company, locale);

  if (description) {
    return trimDescription(description);
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

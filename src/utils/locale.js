import { getMessages } from "../locales/messages.js";

export const DEFAULT_LOCALE = "en";
export const ARABIC_LOCALE = "ar";

export function normalizePathname(pathname = "/") {
  const normalized = pathname.replace(/\/{2,}/g, "/").replace(/\/$/, "");

  return normalized || "/";
}

export function getLocaleFromPathname(pathname = "/") {
  const normalized = normalizePathname(pathname);

  return normalized === "/ar" || normalized.startsWith("/ar/")
    ? ARABIC_LOCALE
    : DEFAULT_LOCALE;
}

export function stripLocaleFromPathname(pathname = "/") {
  const normalized = normalizePathname(pathname);

  if (normalized === "/ar") {
    return "/";
  }

  if (normalized.startsWith("/ar/")) {
    return normalized.slice(3) || "/";
  }

  return normalized;
}

export function localizePathname(pathname = "/", locale = DEFAULT_LOCALE) {
  const basePath = stripLocaleFromPathname(pathname);

  if (locale === ARABIC_LOCALE) {
    return basePath === "/" ? "/ar" : `/ar${basePath}`;
  }

  return basePath;
}

export function getLanguageSwitchPath(pathname = "/") {
  const locale = getLocaleFromPathname(pathname);

  return localizePathname(
    pathname,
    locale === ARABIC_LOCALE ? DEFAULT_LOCALE : ARABIC_LOCALE,
  );
}

export function getHomePath(locale = DEFAULT_LOCALE) {
  return locale === ARABIC_LOCALE ? "/ar" : "/";
}

export function getLocalizedLocation(location = "", locale = DEFAULT_LOCALE) {
  if (!location || locale === DEFAULT_LOCALE) {
    return location;
  }

  return getMessages(locale).locations[location] ?? location;
}

export function getLocalizedCity(city = "", locale = DEFAULT_LOCALE) {
  if (!city || locale === DEFAULT_LOCALE) {
    return city;
  }

  return getMessages(locale).cities[city] ?? city;
}

export function formatNumber(value, locale = DEFAULT_LOCALE) {
  const numberLocale =
    locale === ARABIC_LOCALE ? "ar-SA-u-nu-arab" : "en-US";

  return new Intl.NumberFormat(numberLocale).format(value);
}

export function getLocalizedCompanyDescription(
  company,
  locale = DEFAULT_LOCALE,
) {
  const description = company?.description;

  if (typeof description === "string") {
    return locale === DEFAULT_LOCALE ? description.trim() : "";
  }

  if (!description || typeof description !== "object") {
    return "";
  }

  const localizedDescription = description[locale];

  return typeof localizedDescription === "string"
    ? localizedDescription.trim()
    : "";
}

import { sitePages } from "../data/siteContent.js";
import {
  DEFAULT_LOCALE,
  localizePathname,
  stripLocaleFromPathname,
} from "./locale.js";

export function getSitePagePath(slug, locale = DEFAULT_LOCALE) {
  return localizePathname(`/${slug}`, locale);
}

export function getSitePageSlugFromPathname(pathname = "/") {
  const path = stripLocaleFromPathname(pathname);
  const slug = path.match(/^\/([^/]+)$/)?.[1] ?? null;

  return sitePages.some((page) => page.slug === slug) ? slug : null;
}

export function getSitePageEntries() {
  return sitePages.flatMap((page) =>
    ["en", "ar"].map((locale) => ({
      locale,
      page,
      path: getSitePagePath(page.slug, locale),
    })),
  );
}

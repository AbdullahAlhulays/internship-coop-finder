import overviews from "./companyOverviews.json" with { type: "json" };

// Kept separate from announcement text so company background never becomes
// an application requirement or makes an otherwise empty detail page eligible.
export function getCompanyOverview(slug, locale = "en") {
  const overview = overviews[slug];
  if (!overview?.[locale]?.trim()) return null;
  return { text: overview[locale], sourceUrl: overview.sourceUrl };
}

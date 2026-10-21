import { writeFile } from "node:fs/promises";
import { companies } from "../src/data/companies.js";
import { SITE_CONTENT_UPDATED } from "../src/data/siteContent.js";
import {
  getPublishableCompanyPageEntries,
  getCompanyPath,
  SITE_ORIGIN,
} from "../src/utils/companyRoutes.js";
import { getSitePageEntries } from "../src/utils/siteRoutes.js";

// All company routes come from the same source as the UI. Add future standalone
// public routes to this array; company pages need no manual sitemap maintenance.
// Change this only after a meaningful update to generated page content or metadata.
const PAGE_TEMPLATE_UPDATED = "2026-10-21";
const latestListingDate = companies
  .flatMap((company) => [company.contentUpdatedAt, company.addedAt])
  .filter(Boolean)
  .map((date) => date.slice(0, 10))
  .sort()
  .at(-1);
const homeLastmod = [PAGE_TEMPLATE_UPDATED, latestListingDate]
  .filter(Boolean)
  .sort()
  .at(-1);
const routes = [
  { path: "/", lastmod: homeLastmod },
  { path: "/ar", lastmod: homeLastmod },
  ...getSitePageEntries().map(({ path }) => ({
    path,
    lastmod: [PAGE_TEMPLATE_UPDATED, SITE_CONTENT_UPDATED].sort().at(-1),
  })),
  ...getPublishableCompanyPageEntries(companies).flatMap(({ company, slug }) => {
    const lastmod = [
      PAGE_TEMPLATE_UPDATED,
      company.contentUpdatedAt?.slice(0, 10),
      company.addedAt?.slice(0, 10),
    ]
      .filter(Boolean)
      .sort()
      .at(-1);

    return ["en", "ar"].map((locale) => ({
      path: getCompanyPath(slug, locale),
      lastmod,
    }));
  }),
];

const urlEntries = routes
  .map(({ path, lastmod }) => {
    const location = new URL(path, SITE_ORIGIN).href;

    return [
      "  <url>",
      `    <loc>${location}</loc>`,
      `    <lastmod>${lastmod}</lastmod>`,
      "  </url>",
    ].join("\n");
  })
  .join("\n");

const sitemap = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  urlEntries,
  "</urlset>",
  "",
].join("\n");

await writeFile(new URL("../public/sitemap.xml", import.meta.url), sitemap);

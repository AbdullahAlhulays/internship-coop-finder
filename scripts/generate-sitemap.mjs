import { writeFile } from "node:fs/promises";
import { companies } from "../src/data/companies.js";
import {
  getPublishableCompanyPageEntries,
  getCompanyPath,
  SITE_ORIGIN,
} from "../src/utils/companyRoutes.js";
import { getSitePageEntries } from "../src/utils/siteRoutes.js";

// All company routes come from the same source as the UI. Add future standalone
// public routes to this array; company pages need no manual sitemap maintenance.
const routes = [
  "/",
  "/ar",
  ...getSitePageEntries().map(({ path }) => path),
  ...getPublishableCompanyPageEntries(companies).flatMap(({ slug }) => [
    getCompanyPath(slug, "en"),
    getCompanyPath(slug, "ar"),
  ]),
];

const lastModified = new Date().toISOString().slice(0, 10);
const urlEntries = routes
  .map((route) => {
    const location = new URL(route, SITE_ORIGIN).href;

    return [
      "  <url>",
      `    <loc>${location}</loc>`,
      `    <lastmod>${lastModified}</lastmod>`,
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

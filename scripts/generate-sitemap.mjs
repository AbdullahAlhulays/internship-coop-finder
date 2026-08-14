import { writeFile } from "node:fs/promises";

const SITE_ORIGIN = "https://internship-coop-finder.vercel.app";

// Add future public routes here. The sitemap is regenerated before every build.
const routes = ["/"];

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

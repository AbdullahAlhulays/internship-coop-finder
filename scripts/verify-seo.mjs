import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { companies } from "../src/data/companies.js";
import {
  getCanonicalUrl,
  getCompanyPath,
  getPublishableCompanyPageEntries,
  hasRestoredCompanyPage,
} from "../src/utils/companyRoutes.js";
import { getSitePageEntries } from "../src/utils/siteRoutes.js";

const dist = fileURLToPath(new URL("../dist", import.meta.url));
const published = getPublishableCompanyPageEntries(companies);
const paths = [
  "/",
  "/ar",
  ...getSitePageEntries().map(({ path: pagePath }) => pagePath),
  ...published.flatMap(({ slug }) => [
    getCompanyPath(slug, "en"),
    getCompanyPath(slug, "ar"),
  ]),
];
const sitemap = await readFile(path.join(dist, "sitemap.xml"), "utf8");
const robots = await readFile(path.join(dist, "robots.txt"), "utf8");
assert.match(robots, /Sitemap: https:\/\/internship-coop-finder\.vercel\.app\/sitemap\.xml/);
const listedUrls = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1]);
assert.equal(listedUrls.length, paths.length, "Sitemap URL count");
assert.deepEqual(new Set(listedUrls), new Set(paths.map(getCanonicalUrl)));

function htmlFile(pagePath) {
  return pagePath === "/"
    ? "index.html"
    : `${pagePath.slice(1)}.html`;
}

const descriptions = { en: new Set(), ar: new Set() };
const publishedBySlug = new Map(published.map((entry) => [entry.slug, entry.company]));
for (const pagePath of paths) {
  const html = await readFile(path.join(dist, htmlFile(pagePath)), "utf8");
  const canonical = getCanonicalUrl(pagePath);
  const locale = pagePath === "/ar" || pagePath.startsWith("/ar/") ? "ar" : "en";
  assert.match(html, new RegExp(`<html lang="${locale}"`), pagePath);
  assert.ok(html.includes(`<link rel="canonical" href="${canonical}" />`), pagePath);
  assert.ok(html.includes(`<meta property="og:url" content="${canonical}" />`), pagePath);
  assert.ok(html.includes('<meta property="og:site_name" content="Fursati" />'), pagePath);
  assert.equal((html.match(/<h1\b/g) ?? []).length, 1, `${pagePath}: one H1`);
  assert.ok(html.includes('hreflang="en"') && html.includes('hreflang="ar"'), pagePath);
  assert.ok(html.includes('content="summary_large_image"'), pagePath);
  assert.ok(html.includes('/fursati-preview.png'), pagePath);
  if (pagePath.includes("/companies/")) {
    const slug = pagePath.split("/").at(-1);
    const company = publishedBySlug.get(slug);
    const description = html.match(/<meta name="description" content="([^"]+)"/s)?.[1];
    assert.ok(description && description.length > 50, `${pagePath}: description`);
    assert.ok(!descriptions[locale].has(description), `${pagePath}: unique description`);
    descriptions[locale].add(description);
    assert.ok(!html.includes('id="website-schema"'), `${pagePath}: homepage schema only`);
    assert.ok(
      hasRestoredCompanyPage(company)
        ? html.includes(company.applicationLink)
        : html.includes("<section>"),
      `${pagePath}: crawlable details`,
    );
  }
}

const restoredPaths = [
  "/companies/tamara",
  "/companies/ministry-of-tourism",
  "/companies/petro-rabigh",
  "/companies/emdad",
  "/companies/sami",
  "/companies/alfalak",
  "/companies/saudi-railway-polytechnic",
  "/ar/companies/roland-berger",
  "/companies/saudi-azm",
  "/companies/al-rajhi-takaful",
  "/ar/companies/barakah",
  "/ar/companies/saudi-power-procurement-company-sppc",
];
for (const pagePath of restoredPaths) {
  assert.ok(paths.includes(pagePath), `${pagePath}: restored route`);
  assert.ok(listedUrls.includes(getCanonicalUrl(pagePath)), `${pagePath}: sitemap`);
}

for (const homepage of ["index.html", "ar.html"]) {
  const html = await readFile(path.join(dist, homepage), "utf8");
  const schema = JSON.parse(html.match(/<script type="application\/ld\+json" id="website-schema">(.*?)<\/script>/s)?.[1] ?? "null");
  assert.equal(schema["@type"], "WebSite");
  assert.equal(schema.name, "Fursati");
  assert.equal(schema.url, getCanonicalUrl("/"));
}

const preview = await readFile(path.join(dist, "fursati-preview.png"));
assert.equal(preview.readUInt32BE(16), 1200);
assert.equal(preview.readUInt32BE(20), 630);
const favicon = await readFile(path.join(dist, "favicon-48.png"));
assert.equal(favicon.readUInt32BE(16), 48);
assert.equal(favicon.readUInt32BE(20), 48);
const largeIcon = await readFile(path.join(dist, "fursati-icon-512.png"));
assert.equal(largeIcon.readUInt32BE(16), 512);
assert.equal(largeIcon.readUInt32BE(20), 512);
const ico = await readFile(path.join(dist, "favicon.ico"));
assert.equal(ico.readUInt16LE(2), 1);

console.log(`Verified ${paths.length} crawlable URLs, ${published.length} bilingual company pages, sitemap, schema, and images.`);

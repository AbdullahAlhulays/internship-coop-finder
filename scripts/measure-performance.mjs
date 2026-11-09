import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

const base = process.env.PERF_TEST_URL || "http://127.0.0.1:4173";
const label = process.argv[2] || "current";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const samples = [];
try {
  for (let run = 0; run < 3; run++) {
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const page = await context.newPage(), cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await cdp.send("Network.enable");
    await cdp.send("Network.setBlockedURLs", { urls: ["*googlesyndication.com/*", "*vercel-scripts.com/*", "*/_vercel/*"] });
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 40, downloadThroughput: 200_000, uploadThroughput: 100_000 });
    const measure = async (url, ready) => {
      const start = performance.now();
      await page.goto(base + url, { waitUntil: "domcontentloaded" });
      await page.locator(ready).first().waitFor();
      return { ms: Math.round(performance.now() - start), scriptBytes: await page.evaluate(() => performance.getEntriesByType("resource").filter((r) => r.name.includes("/assets/") && r.name.endsWith(".js")).reduce((sum, r) => sum + r.decodedBodySize, 0)) };
    };
    const coldCv = await measure("/build-cv", ".cv-dashboard-heading");
    const move = async (name, ready) => {
      const link = page.locator(".primary-nav").getByRole("link", { name, exact: true });
      await link.hover();
      await page.waitForTimeout(200); // Same short pointer dwell in before/after runs.
      const start = performance.now();
      await link.click(); await page.locator(ready).first().waitFor();
      return Math.round(performance.now() - start);
    };
    const toOpportunities = await move("CO-OP Training Opportunities", ".company-card");
    const toCv = await move("Build CV", ".cv-dashboard-heading");
    samples.push({ coldCv, toOpportunities, toCv });
    await context.close();
  }
} finally { await browser.close(); }
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const report = { label, profile: "Local production preview, 4x CPU slowdown, 40ms latency, 1.6Mbps download, 200ms pointer dwell", samples, median: { coldCvMs: median(samples.map((s) => s.coldCv.ms)), coldCvScriptBytes: median(samples.map((s) => s.coldCv.scriptBytes)), toOpportunitiesMs: median(samples.map((s) => s.toOpportunities)), toCvMs: median(samples.map((s) => s.toCv)) } };
await mkdir("tmp/performance", { recursive: true });
await writeFile(`tmp/performance/${label}.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

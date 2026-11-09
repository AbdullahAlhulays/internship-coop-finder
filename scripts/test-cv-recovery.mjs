import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const base = process.env.CV_TEST_URL || "http://127.0.0.1:5173";
await mkdir("tmp/cv", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    const get = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key) { if (key === "fursati-resumes-v1") throw new DOMException("Disabled", "SecurityError"); return get.call(this, key); };
  });
  const p = await context.newPage(); await p.goto(base + "/build-cv");
  await expect(p.getByRole("alert")).toContainText("Browser storage is unavailable");
  await p.getByRole("button", { name: /^New resume/ }).click(); await p.getByRole("button", { name: /^Use this template/ }).click();
  await p.getByLabel("Full name", { exact: true }).fill("Memory Only Name");
  await p.getByRole("link", { name: /All resumes/ }).click();
  await expect(p.locator(".cv-resume-card")).toHaveCount(1);
  await expect(p.locator(".cv-resume-card .cv-doc-name")).toContainText("Memory Only Name");
  const backup = p.waitForEvent("download"); await p.getByRole("button", { name: "Export backup", exact: true }).last().click(); await (await backup).saveAs("tmp/cv/memory-only-backup.json");
  assert.match(await readFile("tmp/cv/memory-only-backup.json", "utf8"), /Memory Only Name/);
  p.once("dialog", (dialog) => dialog.dismiss()); await p.getByRole("link", { name: "CO-OP Training Opportunities", exact: true }).click();
  assert.ok(p.url().includes("build-cv"));
  await context.close();
  console.log("PASS: blocked storage stays editable, preserves session data, exports a backup and guards navigation");

  const c2 = await browser.newContext();
  await c2.addInitScript(() => { if (!sessionStorage.getItem("corrupt-fixture")) { localStorage.setItem("fursati-resumes-v1", "{damaged-data"); sessionStorage.setItem("corrupt-fixture", "1"); } });
  const p2 = await c2.newPage(); await p2.goto(base + "/build-cv");
  await expect(p2.getByRole("alert")).toContainText("could not be read");
  await p2.getByRole("button", { name: /^New resume/ }).click(); await p2.getByRole("button", { name: /^Use this template/ }).click();
  await p2.getByLabel("Full name", { exact: true }).fill("Recoverable Name");
  assert.equal(await p2.evaluate(() => localStorage.getItem("fursati-resumes-v1")), "{damaged-data");
  await c2.close();
  console.log("PASS: corrupt persisted data is preserved while session editing remains available");

  const c3 = await browser.newContext({ viewport: { width: 1366, height: 1000 } });
  const p3 = await c3.newPage(); const errors = []; p3.on("pageerror", (e) => errors.push(e.message));
  await p3.goto(base + "/build-cv"); await p3.getByRole("heading", { name: "My Resumes" }).waitFor();
  const record = await p3.evaluate(async () => {
    const { sampleResume } = await import("/src/cv/sample.js"); const r = sampleResume("corporate");
    r.data.summary = Array.from({ length: 650 }, () => "Experienced developer building reliable accessible software.").join(" ");
    r.data.projects = [{ id: "long-link", name: "Long project link", role: "", description: "", technologies: "", link: "https://example.com/" + "project".repeat(35) }];
    localStorage.setItem("fursati-resumes-v1", JSON.stringify({ schemaVersion: 1, resumes: [r] })); return r;
  });
  await p3.goto(base + `/build-cv/resume/${record.id}`);
  await expect(p3.locator(".cv-page-slot")).not.toHaveCount(1);
  await p3.getByRole("button", { name: "Dark mode", exact: true }).click();
  await p3.screenshot({ path: "tmp/cv/editor-dark-long.png" });
  const download = p3.waitForEvent("download", { timeout: 90_000 }); await p3.getByRole("button", { name: /^Download PDF/ }).click(); await (await download).saveAs("tmp/cv/oversized-paragraph.pdf");
  const doc = await getDocument({ data: new Uint8Array(await readFile("tmp/cv/oversized-paragraph.pdf")) }).promise;
  assert.ok(doc.numPages >= 3);
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n); const content = await page.getTextContent();
    for (const item of content.items) if (item.str?.trim()) assert.ok(item.transform[4] + item.width <= page.view[2] - 20, `No overflowing text on page ${n}: ${item.str.slice(0,35)}`);
  }
  await doc.cleanup(); assert.deepEqual(errors, []); await c3.close();
  console.log("PASS: oversized paragraphs paginate in HTML and PDF, long links fit, dark editor has no runtime errors");
} finally { await browser.close(); }

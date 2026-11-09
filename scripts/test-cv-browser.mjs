import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const base = process.env.CV_TEST_URL || "http://127.0.0.1:5173";
await mkdir("tmp/cv", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, acceptDownloads: true });
const page = await context.newPage();
const errors = [];
const leakedRequests = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("request", (request) => { if (page.url().includes("/build-cv") && !request.url().startsWith(base) && !/^(data|blob):/.test(request.url())) leakedRequests.push(request.url()); });
const openSection = async (name) => {
  const section = page.locator("details.cv-form-section").filter({ has: page.locator("summary").getByText(name, { exact: true }) });
  if (!(await section.evaluate((e) => e.open))) await section.locator("summary").click();
  return section;
};
const saved = () => page.getByText("✓ Saved in this browser", { exact: true }).waitFor();
const library = () => page.evaluate(() => JSON.parse(localStorage.getItem("fursati-resumes-v1"))?.resumes ?? []);
const menu = async (title, action) => { await page.getByRole("button", { name: `Resume options: ${title}`, exact: true }).click(); await page.getByRole("menuitem", { name: action, exact: true }).click(); };
try {
  await page.goto(base + "/");
  await expect(page.locator(".company-card").first()).toBeVisible();
  await page.getByRole("link", { name: "Build CV", exact: true }).click();
  await expect(page.getByRole("heading", { name: "My Resumes", exact: true })).toBeVisible();
  await expect(page.locator(".cv-resume-card")).toHaveCount(0);
  await expect(page.locator(".arabic-quote")).toBeVisible();
  await expect(page.locator(".arabic-quote")).toHaveAttribute("dir", "rtl");
  await expect(page.locator(".cv-privacy-note, .cv-backup-actions, .cv-welcome")).toHaveCount(0);
  for (const id of ["classic", "editorial", "corporate"]) {
    await page.getByRole("button", { name: /^New resume/ }).click();
    await expect(page.getByRole("heading", { name: "Choose your resume template", exact: true })).toBeVisible();
    await expect(page.locator(".cv-template-paper img")).toHaveCount(3);
    await expect(page.locator(`img[src="/cv/templates/${id}.png"]`)).toBeVisible();
    await expect.poll(() => page.locator(`img[src="/cv/templates/${id}.png"]`).evaluate((img) => img.naturalWidth)).toBe(1191);
    await page.locator(`input[value="${id}"]`).dblclick();
    await expect(page.getByLabel("Full name", { exact: true })).toHaveValue("");
    await saved();
    const records = await library(); assert.equal(records.length, 1); assert.equal(records[0].templateId, id); assert.equal(records[0].data.summary, "");
    await page.getByRole("link", { name: /All resumes/ }).click();
    await menu("Untitled resume", "Delete");
    await page.getByRole("dialog").getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.locator(".cv-resume-card")).toHaveCount(0);
  }
  console.log("PASS: all three sharp previews, double-click creates exactly one empty resume per template, removed copy and dashboard backup controls");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: "tmp/cv/dashboard-empty.png", fullPage: true });
  await page.getByRole("button", { name: /^New resume/ }).click();
  await expect(page.getByRole("radio")).toHaveCount(3);
  for (const id of ["editorial", "corporate", "classic"]) { await page.locator(`input[value="${id}"]`).check(); await expect(page.locator(`input[value="${id}"]`)).toBeChecked(); }
  await page.screenshot({ path: "tmp/cv/template-gallery.png", fullPage: true });
  await page.getByRole("button", { name: /^Use this template/ }).click();
  await page.getByRole("button", { name: /^Download PDF/ }).click();
  await expect(page.getByText("Enter your full name before downloading your resume.", { exact: true })).toBeVisible();
  for (const [label, value] of [["Full name", "Jordan Taylor"], ["Professional title", "Software Engineer"], ["Email", "jordan.taylor@example.com"], ["Phone", "+1 555 011 2020"], ["City / location", "Riyadh, Saudi Arabia"], ["LinkedIn URL", "linkedin.com/in/jordan-example"], ["Portfolio / website", "jordan.example.com"]]) await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByLabel("Resume title", { exact: true }).fill("Software Engineering Resume");
  await openSection("Professional summary");
  await page.getByLabel("Professional summary", { exact: true }).fill("Software engineer who builds accessible applications and reliable systems.");
  let section = await openSection("Education");
  await section.getByRole("button", { name: /^\+ Add entry/ }).click();
  for (const [label, value] of [["Institution", "Test University"], ["Degree / qualification", "Bachelor of Science"], ["Field of study", "Computer Science"], ["GPA (optional)", "3.8 / 4.0"], ["Start date", "2020-09"], ["End / expected graduation", "2024-06"], ["Description", "Graduated with honors."]]) await section.getByLabel(label, { exact: true }).fill(value);
  section = await openSection("Work experience");
  await section.getByRole("button", { name: /^\+ Add entry/ }).click();
  for (const [label, value] of [["Job title", "Software Developer"], ["Company / organization", "Example Company"], ["City / location", "Riyadh"], ["Start date", "2024-07"]]) await section.getByLabel(label, { exact: true }).fill(value);
  await section.getByLabel("I currently work here", { exact: true }).check();
  await section.getByLabel("Achievements 1", { exact: true }).fill("Improved load times by 30%.");
  await section.getByRole("button", { name: /^\+ Add achievement/ }).click();
  await section.getByLabel("Achievements 2", { exact: true }).fill("Built an accessible dashboard.");
  await section.getByRole("button", { name: /^\+ Add entry/ }).click();
  const second = section.locator("fieldset").nth(1);
  await second.getByLabel("Job title", { exact: true }).fill("Intern");
  await second.getByLabel("Company / organization", { exact: true }).fill("Earlier Company");
  await second.getByLabel("Start date", { exact: true }).fill("2023-01");
  await second.getByLabel("End / expected graduation", { exact: true }).fill("2023-05");
  await section.getByRole("button", { name: "Move up: Work experience 2", exact: true }).click();
  await expect(section.locator("fieldset").first().getByLabel("Job title", { exact: true })).toHaveValue("Intern");
  await section.getByRole("button", { name: "Sort by date", exact: true }).click();
  section = await openSection("Projects"); await section.getByRole("button", { name: /^\+ Add entry/ }).click();
  for (const [label, value] of [["Project name", "Community Portal"], ["Your role", "Lead Developer"], ["Description", "Developed a community volunteering application."], ["Technologies / tools", "React, SQL"], ["Project link (optional)", "https://example.com/project"]]) await section.getByLabel(label, { exact: true }).fill(value);
  section = await openSection("Skills"); await section.getByRole("textbox").fill("React, SQL, Teamwork"); await section.getByRole("button", { name: "Add", exact: true }).click();
  await section.getByRole("button", { name: "Remove skill: Teamwork", exact: true }).click();
  section = await openSection("Certifications"); await section.getByRole("button", { name: /^\+ Add entry/ }).click();
  for (const [label, value] of [["Certification name", "Cloud Fundamentals"], ["Issuing organization", "Example Academy"], ["Issue date", "2025-04"]]) await section.getByLabel(label, { exact: true }).fill(value);
  section = await openSection("Languages"); await section.getByRole("button", { name: /^\+ Add entry/ }).click();
  await section.getByLabel("Language", { exact: true }).fill("English"); await section.getByLabel("Proficiency (optional)", { exact: true }).fill("Fluent");
  section = await openSection("Additional information"); await section.getByRole("button", { name: /^\+ Add entry/ }).click();
  await section.getByLabel("Title / activity", { exact: true }).fill("Volunteer mentor"); await section.getByLabel("Description", { exact: true }).fill("Mentored six university students.");
  await saved();
  for (const text of ["Jordan Taylor", "Computer Science", "Software Developer", "Improved load times by 30%.", "Community Portal", "React, SQL", "Cloud Fundamentals", "English", "Mentored six university students."]) await expect(page.locator(".cv-page-slot")).toContainText(text);
  const before = (await library())[0];
  await page.getByRole("button", { name: "Change template", exact: true }).click();
  await page.getByRole("dialog").locator('input[value="editorial"]').check();
  await page.getByRole("button", { name: /^Use this template/ }).click();
  await page.getByLabel("Paper size", { exact: true }).selectOption("LETTER"); await saved();
  assert.deepEqual((await library())[0].data, before.data);
  await page.reload(); await saved(); await expect(page.getByLabel("Full name", { exact: true })).toHaveValue("Jordan Taylor");
  assert.equal((await library())[0].paperSize, "LETTER");
  await page.screenshot({ path: "tmp/cv/editor-desktop.png", fullPage: true });
  await page.getByRole("link", { name: /All resumes/, exact: false }).click();
  await expect(page.locator(".cv-resume-card")).toHaveCount(1);
  await expect(page.locator(".cv-resume-card .cv-doc-name")).toContainText("Jordan Taylor");
  await menu("Software Engineering Resume", "Rename"); await page.getByLabel("Resume title", { exact: true }).fill("Engineering CV"); await page.getByRole("button", { name: "Save", exact: true }).click();
  await menu("Engineering CV", "Duplicate"); await expect(page.locator(".cv-resume-card")).toHaveCount(2);
  await menu("Engineering CV (copy)", "Delete"); await page.getByRole("button", { name: "Cancel", exact: true }).click(); await expect(page.locator(".cv-resume-card")).toHaveCount(2);
  await menu("Engineering CV (copy)", "Delete"); await page.getByRole("dialog").getByRole("button", { name: "Delete", exact: true }).click(); await expect(page.locator(".cv-resume-card")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Export backup", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Import backup", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Resume options: Engineering CV", exact: true }).first().click(); await page.keyboard.press("ArrowDown"); await page.keyboard.press("Escape"); await expect(page.getByRole("menu")).toHaveCount(0);
  console.log("PASS: complete form, preview, ordering, persistence, template switching, dashboard management and keyboard menu");

  // A separate context carries realistic fictional fixtures for export validation.
  const pdfPage = await context.newPage(); const pdfErrors = [];
  pdfPage.on("pageerror", (error) => pdfErrors.push(error.message));
  await pdfPage.goto(base + "/build-cv"); await pdfPage.getByRole("heading", { name: "My Resumes", exact: true }).waitFor();
  const fixtures = await pdfPage.evaluate(async () => {
    const { sampleResume } = await import("/src/cv/sample.js");
    const short = ["classic", "editorial", "corporate"].map((id) => { const r = sampleResume(id); r.title = id; return r; });
    const long = sampleResume("editorial"); long.title = "Long resume";
    long.data.experience = Array.from({ length: 20 }, (_, i) => ({ id: `long-${i}`, title: `Engineering Role ${i + 1}`, company: `Company ${i + 1}`, location: "Riyadh", startDate: "2020-01", endDate: "2025-01", current: false, bullets: Array.from({ length: 5 }, (_, j) => `Achievement ${i + 1}.${j + 1}: Delivered reliable software with thorough documentation and automated tests. Collaborated with cross-functional teams to improve accessibility, performance, and customer outcomes.`) }));
    long.data.additional = [{ id: "final", title: "Final section", description: "FINAL_SENTINEL: This final paragraph must remain visible and selectable." }];
    const arabic = sampleResume("classic"); arabic.title = "Arabic resume"; arabic.language = "ar";
    arabic.data.personal.fullName = "أحمد محمد"; arabic.data.personal.title = "مهندس برمجيات"; arabic.data.summary = "مهندس برمجيات يعمل على تطوير تطبيقات الويب وتحسين تجربة المستخدم."; arabic.data.skills = ["البرمجة", "إدارة المشاريع", "React"];
    return [...short, long, arabic];
  });
  for (const r of fixtures) {
    await pdfPage.evaluate((resume) => { localStorage.setItem("fursati-resumes-v1", JSON.stringify({ schemaVersion: 1, resumes: [resume] })); }, r);
    await pdfPage.goto(base + `/build-cv/resume/${r.id}`); await pdfPage.getByRole("button", { name: /^Download PDF/ }).waitFor();
    const download = pdfPage.waitForEvent("download", { timeout: 90_000 }); await pdfPage.getByRole("button", { name: /^Download PDF/ }).click();
    const file = await download; assert.match(file.suggestedFilename(), /_Resume\.pdf$/);
    const path = `tmp/cv/${r.templateId}-${r.title === "Long resume" ? "long" : r.language === "ar" ? "arabic" : "short"}.pdf`; await file.saveAs(path);
    const doc = await getDocument({ data: new Uint8Array(await readFile(path)) }).promise;
    let allText = "", pageTexts = [];
    for (let index = 1; index <= doc.numPages; index++) {
      const pdfPage = await doc.getPage(index); const content = await pdfPage.getTextContent();
      const text = content.items.map((item) => item.str).join(" "); allText += text + "\n"; pageTexts.push(text);
      assert.ok(text.trim().length > 0, `${path}: no blank page`);
      for (const item of content.items) if (item.str?.trim()) { const [, , , , x, y] = item.transform; assert.ok(y >= 15 && y <= pdfPage.view[3] - 15, `${path}: text within vertical bounds`); assert.ok(x >= 15 && x < pdfPage.view[2] - 15, `${path}: text within horizontal bounds`); }
      if (index === 1) { const canvas = (await import("@napi-rs/canvas")).createCanvas(1, 1); const viewport = pdfPage.getViewport({ scale: 1.4 }); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height); await pdfPage.render({ canvasContext: canvas.getContext("2d"), viewport }).promise; await writeFile(path.replace(".pdf", ".png"), canvas.toBuffer("image/png")); }
    }
    if (r.title === "Long resume") { assert.ok(doc.numPages >= 3); assert.match(allText, /FINAL_SENTINEL/); assert.match(allText, /Achievement 20\.5/); }
    else if (r.language === "en") { assert.equal(doc.numPages, 1); for (const word of [r.data.personal.fullName, "Education", r.data.education[0].institution, r.data.experience[0].company]) assert.ok(allText.toUpperCase().includes(word.toUpperCase()), `${path}: ${word}`); assert.ok(allText.toUpperCase().indexOf("PROFESSIONAL EXPERIENCE") < allText.toUpperCase().indexOf("EDUCATION")); }
    else { assert.match(allText, /أحمد/); await writeFile("tmp/cv/arabic-extracted.txt", allText); }
    const links = await (await doc.getPage(1)).getAnnotations(); assert.ok(links.some((link) => link.url?.includes("example.com")), `${path}: clickable links`);
    console.log(`PASS: ${path}, ${doc.numPages} page(s), selectable text and in-bounds layout`); await doc.cleanup();
  }
  assert.deepEqual(pdfErrors, []);

  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 900 }); await page.goto(base + "/build-cv"); await page.getByRole("heading", { name: "My Resumes", exact: true }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `dashboard fits ${width}`);
    await page.locator(".cv-resume-preview-button").first().click(); await page.getByRole("tab", { name: "Preview", exact: true }).click();
    await expect(page.locator(".cv-live-preview")).toBeVisible();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `editor fits ${width}`);
    if (width === 390) await page.screenshot({ path: "tmp/cv/mobile-preview.png", fullPage: true });
    await page.getByRole("tab", { name: "Edit details", exact: true }).click(); await expect(page.getByLabel("Full name", { exact: true })).toBeVisible();
  }
  await page.goto(base + "/ar/build-cv"); await expect(page.getByRole("heading", { name: "سيري الذاتية", exact: true })).toBeVisible(); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.goto(base + "/"); await expect(page.locator(".company-card").first()).toBeVisible();
  assert.deepEqual(errors, []); assert.deepEqual(leakedRequests, []);
  console.log("PASS: mobile/tablet/Arabic layouts, Opportunities regression, no runtime errors");
} finally { await browser.close(); }

import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { createCanvas } from "@napi-rs/canvas";

// Run against the local Vite server. These images come from the exact PDF
// implementation visitors download, without screenshot UI or sample captions.
const base = process.env.CV_TEST_URL || "http://127.0.0.1:5173";
await mkdir("public/cv/templates", { recursive: true });
await mkdir("tmp/cv", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage();
  await page.goto(`${base}/build-cv`);
  for (const id of ["classic", "editorial", "corporate"]) {
    const bytes = await page.evaluate(async (id) => {
      const { sampleResume } = await import("/src/cv/sample.js");
      const { createResumeBlob } = await import("/src/cv/pdf/export.jsx");
      return Array.from(new Uint8Array(await (await createResumeBlob(sampleResume(id))).arrayBuffer()));
    }, id);
    await writeFile(`tmp/cv/${id}-gallery.pdf`, new Uint8Array(bytes));
    const doc = await getDocument({ data: new Uint8Array(bytes) }).promise;
    if (doc.numPages !== 1) throw new Error(`${id} gallery fixture must fit one page, got ${doc.numPages}`);
    const pdfPage = await doc.getPage(1), viewport = pdfPage.getViewport({ scale: 2 });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    await pdfPage.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
    await writeFile(`public/cv/templates/${id}.png`, canvas.toBuffer("image/png"));
    await writeFile(`public/cv/templates/${id}.webp`, canvas.toBuffer("image/webp", 92));
    console.log(`Generated ${id}: ${canvas.width} x ${canvas.height}, real selectable PDF source`);
    await doc.cleanup();
  }
} finally { await browser.close(); }

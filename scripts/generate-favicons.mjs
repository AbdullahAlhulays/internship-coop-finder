import { readFile, writeFile } from "node:fs/promises";
import { createCanvas, loadImage } from "@napi-rs/canvas";

// Render the original vector onto a transparent canvas. Opaque browser
// screenshots add white corners around the rounded mark at favicon sizes.
const publicRoot = new URL("../public/", import.meta.url);
const svg = await readFile(new URL("fursati-logo.svg", publicRoot), "utf8");
async function renderPng(size) {
  const logo = await loadImage(Buffer.from(svg.replace("<svg ", `<svg width="${size}" height="${size}" `)));
  const canvas = createCanvas(size, size);
  canvas.getContext("2d").drawImage(logo, 0, 0, size, size);
  return canvas.toBuffer("image/png");
}

for (const [filename, size] of [["fursati-icon-512.png", 512], ["favicon-48.png", 48], ["apple-touch-icon.png", 180]]) {
  await writeFile(new URL(filename, publicRoot), await renderPng(size));
}

const sizes = [16, 32, 48], images = await Promise.all(sizes.map(renderPng));
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
sizes.forEach((size, index) => {
  const entry = 6 + index * 16;
  header.writeUInt8(size, entry);
  header.writeUInt8(size, entry + 1);
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(images[index].length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += images[index].length;
});
await writeFile(new URL("favicon.ico", publicRoot), Buffer.concat([header, ...images]));
console.log("Generated transparent PNG favicons and 16/32/48px ICO from fursati-logo.svg.");

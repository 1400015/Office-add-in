import sharp from "sharp";
import { mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const assetsDir = resolve(root, "public", "icons");
mkdirSync(assetsDir, { recursive: true });

const svg = (size) => `
<svg width="${size}" height="${size}" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0F6CBD"/>
      <stop offset="100%" stop-color="#115EA3"/>
    </linearGradient>
  </defs>
  <rect width="128" height="128" rx="24" fill="url(#g)"/>
  <text x="64" y="82" font-family="Segoe UI, Arial, sans-serif" font-size="56"
        font-weight="700" fill="#ffffff" text-anchor="middle">AI</text>
</svg>`;

const sizes = [16, 32, 64, 80, 128];

for (const size of sizes) {
  const out = resolve(assetsDir, `icon-${size}.png`);
  await sharp(Buffer.from(svg(size))).png().toFile(out);
  console.log(`generated ${out}`);
}

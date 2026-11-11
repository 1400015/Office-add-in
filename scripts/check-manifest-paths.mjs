#!/usr/bin/env node
// Validates that every local path referenced by manifest.xml exists in dist/
// after a production build. The schema validator (npm run validate) checks
// the XML structure but not whether the referenced files were actually emitted.
//
// Usage: node scripts/check-manifest-paths.mjs [manifest.xml] [distDir]
// Exit code: 0 = all paths exist, 1 = at least one missing (or unreadable).

import { readFile, stat } from "node:fs/promises";
import { join, normalize } from "node:path";

const manifestPath = process.argv[2] ?? "manifest.xml";
const distDir = process.argv[3] ?? "dist";

// Matches absolute URLs that point at the add-in's own origin (any host),
// e.g. https://localhost:3000/icons/icon-32.png -> /icons/icon-32.png
const URL_RE = /(?:DefaultValue|SourceLocation|resid)="(https?:\/\/[^"]+)"/g;

function pathFromUrl(rawUrl) {
  try {
    const { pathname } = new URL(rawUrl);
    return decodeURIComponent(pathname);
  } catch {
    return null;
  }
}

async function existsInDist(distPath) {
  // "/" maps to index.html in a SPA served from dist/.
  const rel = distPath === "/" ? "index.html" : distPath.replace(/^\/+/, "");
  const abs = normalize(join(distDir, rel));
  if (!abs.startsWith(normalize(distDir))) return false; // path traversal guard
  try {
    const s = await stat(abs);
    return s.isFile();
  } catch {
    return false;
  }
}

async function main() {
  let xml;
  try {
    xml = await readFile(manifestPath, "utf8");
  } catch (error) {
    console.error(`Cannot read ${manifestPath}: ${error.message}`);
    process.exit(1);
  }

  const paths = new Set();
  for (const match of xml.matchAll(URL_RE)) {
    const p = pathFromUrl(match[1]);
    if (p) paths.add(p);
  }

  if (paths.size === 0) {
    console.error(`No local URLs found in ${manifestPath}`);
    process.exit(1);
  }

  const missing = [];
  for (const p of [...paths].sort()) {
    // Query strings (e.g. ?view=settings) are not files on disk.
    const filePath = p.split("?")[0];
    if (!(await existsInDist(filePath))) missing.push(p);
  }

  if (missing.length > 0) {
    console.error(
      `Manifest references ${missing.length} path(s) missing from ${distDir}/:`
    );
    for (const p of missing) console.error(`  - ${p}`);
    process.exit(1);
  }

  console.log(
    `manifest paths OK: ${paths.size} referenced path(s) all present in ${distDir}/`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

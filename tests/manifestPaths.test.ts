import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const SCRIPT = join(process.cwd(), "scripts", "check-manifest-paths.mjs");

function run(manifest: string, dist: string): ReturnType<typeof spawnSync> {
  return spawnSync(process.execPath, [SCRIPT, manifest, dist], {
    encoding: "utf8",
    timeout: 5000,
  });
}

const MANIFEST = `<OfficeApp>
  <IconUrl DefaultValue="https://localhost:3000/icons/icon-32.png"/>
  <SourceLocation DefaultValue="https://localhost:3000/"/>
  <bt:Url id="settings" DefaultValue="https://localhost:3000/?view=settings"/>
  <AppDomain>https://localhost:3000</AppDomain>
</OfficeApp>`;

let tmp: string;
async function setup(
  files: Record<string, string>
): Promise<{ manifest: string; dist: string }> {
  tmp = await mkdtemp(join(tmpdir(), "ouai-paths-"));
  const dist = join(tmp, "dist");
  await mkdir(join(dist, "icons"), { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    await writeFile(join(dist, name), content);
  }
  const manifest = join(tmp, "manifest.xml");
  await writeFile(manifest, MANIFEST);
  return { manifest, dist };
}

afterEach(async () => {
  if (tmp) await rm(tmp, { recursive: true, force: true });
});

describe("check-manifest-paths script", () => {
  it("passes when every referenced path exists in dist/", async () => {
    const { manifest, dist } = await setup({
      "index.html": "<html></html>",
      "icons/icon-32.png": "png",
    });
    const result = run(manifest, dist);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("manifest paths OK");
  });

  it("fails and lists the missing icon when dist lacks it", async () => {
    const { manifest, dist } = await setup({ "index.html": "<html></html>" });
    const result = run(manifest, dist);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("/icons/icon-32.png");
  });

  it("fails when index.html is missing (root SourceLocation)", async () => {
    const { manifest, dist } = await setup({ "icons/icon-32.png": "png" });
    const result = run(manifest, dist);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("missing");
  });

  it("ignores query strings (?view=settings maps to index.html)", async () => {
    const { manifest, dist } = await setup({
      "index.html": "<html></html>",
      "icons/icon-32.png": "png",
    });
    const result = run(manifest, dist);
    expect(result.status).toBe(0);
  });

  it("fails when the manifest file is unreadable", () => {
    const result = run(join(tmpdir(), "does-not-exist.xml"), "dist");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Cannot read");
  });
});

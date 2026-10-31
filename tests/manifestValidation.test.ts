import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

// Exercise the actual process exit code while replacing only network transport.
function run(fetchSource: string, options = ""): ReturnType<typeof spawnSync> {
  const script = `
    import { runValidation } from './scripts/validate-manifest.mjs';
    const fetchImpl = ${fetchSource};
    process.exitCode = await runValidation({ fetchImpl, ${options} });
  `;
  return spawnSync(process.execPath, ["--input-type=module", "-e", script], {
    encoding: "utf8",
    cwd: process.cwd(),
    timeout: 5000,
  });
}

describe("manifest validator process", () => {
  it("accepts only an explicit accepted report with no errors and reports warnings", () => {
    const result = run(`async () => ({ ok: true, json: async () => ({
      status: 'Accepted', errors: [], warnings: [{ title: 'Review icon' }]
    }) })`);
    expect(result.status).toBe(0);
    expect(String(result.stdout)).toContain("Review icon");
    expect(String(result.stdout)).toContain("Manifest accepted");
  });

  it.each([
    ["rejected", "{ status: 'Rejected', errors: [], warnings: [] }"],
    [
      "accepted with errors",
      "{ status: 'Accepted', errors: [{title:'Bad XML'}], warnings: [] }",
    ],
    ["missing status", "{ errors: [], warnings: [] }"],
    ["missing errors", "{ status: 'Accepted', warnings: [] }"],
  ])("fails for %s", (_label, report) => {
    const result = run(
      `async () => ({ ok: true, json: async () => (${report}) })`
    );
    expect(result.status).toBe(1);
    expect(String(result.stdout)).not.toContain("Manifest accepted");
  });

  it("fails on a non-success HTTP response or invalid JSON", () => {
    expect(run("async () => ({ ok: false, status: 503 })").status).toBe(1);
    expect(
      run(
        "async () => ({ ok: true, json: async () => { throw new Error('bad JSON'); } })"
      ).status
    ).toBe(1);
  });

  it("fails on network errors without printing sensitive transport details", () => {
    const result = run("async () => { throw new Error('proxy-secret'); }");
    expect(result.status).toBe(1);
    expect(String(result.stderr)).toContain("Unable to contact");
    expect(String(result.stderr)).not.toContain("proxy-secret");
  });

  it("fails on timeout and a missing manifest", () => {
    const timedOut = run(
      "async (_, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))))",
      "timeoutMs: 10"
    );
    expect(timedOut.status).toBe(1);
    expect(String(timedOut.stderr)).toContain("timed out");
    const missing = run(
      "async () => { throw new Error('unexpected fetch'); }",
      "manifestPath: 'missing-manifest.xml'"
    );
    expect(missing.status).toBe(1);
    expect(String(missing.stderr)).toContain("Cannot read manifest");
  });

  it.each([
    ["uses HTTPS_PROXY", "", true],
    ["honours NO_PROXY", "validationgateway.omex.office.net", false],
  ])("%s", (_name, noProxy, expectAgent) => {
    const fetchSource = `(() => {
      delete process.env.https_proxy;
      delete process.env.http_proxy;
      delete process.env.no_proxy;
      process.env.HTTPS_PROXY = 'http://127.0.0.1:12345';
      process.env.NO_PROXY = ${JSON.stringify(noProxy)};
      return async (_, options) => ({ ok: true, json: async () => ({
        status: Boolean(options.agent) === ${expectAgent} ? 'Accepted' : 'Rejected',
        errors: [], warnings: []
      }) });
    })()`;
    expect(run(fetchSource).status).toBe(0);
  });
});

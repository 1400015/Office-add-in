import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import fetch from "node-fetch";
import { HttpsProxyAgent } from "https-proxy-agent";
import { getProxyForUrl } from "proxy-from-env";

const SERVICE_URL =
  "https://validationgateway.omex.office.net/package/api/check?clientId=devx";
const TIMEOUT_MS = 30_000;

function safeSummary(value) {
  return String(value ?? "")
    .replace(/[\x00-\x1f\x7f]/g, " ")
    .slice(0, 300);
}

/** Perform the same service validation as office-addin-manifest, with a reliable
 * process exit code and support for the inherited proxy configuration. */
export async function runValidation({
  manifestPath = "manifest.xml",
  fetchImpl = fetch,
  timeoutMs = TIMEOUT_MS,
  stdout = console.log,
  stderr = console.error,
} = {}) {
  let body;
  try {
    body = await readFile(manifestPath);
  } catch {
    stderr("Cannot read manifest file.");
    return 1;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const proxy = getProxyForUrl(SERVICE_URL);
    const response = await fetchImpl(SERVICE_URL, {
      method: "POST",
      body,
      headers: { "Content-Type": "application/xml" },
      signal: controller.signal,
      ...(proxy ? { agent: new HttpsProxyAgent(proxy) } : {}),
    });
    if (!response.ok) {
      stderr(`Manifest validation service returned HTTP ${response.status}.`);
      return 1;
    }
    let report;
    try {
      report = await response.json();
    } catch {
      stderr("Manifest validation service returned invalid JSON.");
      return 1;
    }
    if (
      !report ||
      typeof report !== "object" ||
      typeof report.status !== "string" ||
      !Array.isArray(report.errors) ||
      !Array.isArray(report.warnings)
    ) {
      stderr("Manifest validation service returned an incomplete report.");
      return 1;
    }
    for (const warning of report.warnings) {
      stdout(
        `Warning: ${safeSummary(warning?.title ?? warning?.content ?? warning)}`
      );
    }
    if (report.status.toLowerCase() !== "accepted" || report.errors.length) {
      stderr(`Manifest rejected: ${safeSummary(report.status)}.`);
      for (const error of report.errors) {
        stderr(
          `Error: ${safeSummary(error?.title ?? error?.content ?? error)}`
        );
      }
      return 1;
    }
    stdout("Manifest accepted by Microsoft validation service.");
    return 0;
  } catch {
    stderr(
      controller.signal.aborted
        ? "Manifest validation timed out."
        : "Unable to contact the manifest validation service."
    );
    return 1;
  } finally {
    clearTimeout(timeout);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exitCode = await runValidation({ manifestPath: process.argv[2] });
}

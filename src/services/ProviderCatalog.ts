import {
  ConfigurationError,
  ProviderError,
  type AIModel,
  type ProviderConfig,
} from "../types";
import { httpRequest } from "./HttpService";
import { abortError } from "./abort";
import {
  chatCompatibility,
  type CatalogModelMetadata,
} from "./modelCompatibility";

function requestDetails(
  config: ProviderConfig,
  path: string,
  signal?: AbortSignal
) {
  const key = config.apiKey.trim();
  if (!key && config.id !== "ollama") throw new ConfigurationError("noApiKey");
  if (config.useProxy && !config.proxyUrl.trim())
    throw new ConfigurationError("Proxy URL is required");
  const base = (config.useProxy ? config.proxyUrl : config.endpoint).replace(
    /\/$/,
    ""
  );
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (config.id === "claude") {
    headers["x-api-key"] = key;
    headers["anthropic-version"] = "2023-06-01";
  } else if (config.id === "gemini") {
    headers["x-goog-api-key"] = key;
  } else if (key) {
    headers.Authorization = `Bearer ${key}`;
  }
  if (config.useProxy)
    headers["X-OUAI-Upstream"] = config.endpoint.replace(/\/$/, "");
  return {
    url: `${base}${path}`,
    method: "GET" as const,
    headers,
    timeout: config.timeout,
    provider: config.id,
    signal,
  };
}

function invalid(config: ProviderConfig): never {
  throw new ProviderError(
    config.id,
    "INVALID_RESPONSE",
    "Invalid model listing response"
  );
}

type ModelRow = CatalogModelMetadata & {
  id?: unknown;
  name?: unknown;
  display_name?: unknown;
  displayName?: unknown;
};
type CatalogPage = {
  data?: unknown;
  models?: unknown;
  nextPageToken?: unknown;
  has_more?: unknown;
  last_id?: unknown;
  error?: unknown;
};

interface CatalogEntry {
  id: string;
  name: string;
  metadata: ModelRow;
}

async function readCatalog(
  config: ProviderConfig,
  signal?: AbortSignal
): Promise<CatalogEntry[]> {
  const entries: CatalogEntry[] = [];
  const seenModels = new Set<string>();
  const seenCursors = new Set<string>();
  let cursor = "";
  for (;;) {
    const path = config.id === "ollama" ? "/api/tags" : "/models";
    const param = config.id === "gemini" ? "pageToken" : "after_id";
    const suffix = cursor ? `?${param}=${encodeURIComponent(cursor)}` : "";
    const data = await httpRequest<CatalogPage>(
      requestDetails(config, `${path}${suffix}`, signal)
    );
    if (!data || typeof data !== "object" || data.error) invalid(config);
    const raw =
      config.id === "gemini" || config.id === "ollama"
        ? data.models
        : data.data;
    if (!Array.isArray(raw)) invalid(config);
    for (const item of raw as ModelRow[]) {
      if (!item || typeof item !== "object") invalid(config);
      const rawId =
        config.id === "gemini" || config.id === "ollama" ? item.name : item.id;
      if (typeof rawId !== "string" || !rawId.trim()) invalid(config);
      const id =
        config.id === "gemini" ? rawId.replace(/^models\//, "") : rawId;
      if (seenModels.has(id)) continue;
      const display =
        item.displayName ??
        item.display_name ??
        (config.id === "openrouter" ? item.name : undefined);
      entries.push({
        id,
        name: typeof display === "string" && display ? display : id,
        metadata: item,
      });
      seenModels.add(id);
    }
    const next =
      config.id === "gemini"
        ? data.nextPageToken
        : config.id === "claude" && data.has_more === true
          ? data.last_id
          : undefined;
    if (next === undefined || next === null || next === "") {
      if (config.id === "claude" && data.has_more === true) invalid(config);
      break;
    }
    if (typeof next !== "string" || seenCursors.has(next)) invalid(config);
    seenCursors.add(next);
    cursor = next;
  }
  return entries;
}

async function ollamaCapabilities(
  config: ProviderConfig,
  entry: CatalogEntry,
  signal?: AbortSignal
): Promise<CatalogModelMetadata> {
  if (Array.isArray(entry.metadata.capabilities)) return entry.metadata;
  try {
    // /api/tags includes embedding models too; /api/show describes whether a
    // model can complete text. This reads metadata and never loads/generates.
    const details = await httpRequest<CatalogModelMetadata>({
      ...requestDetails(config, "/api/show", signal),
      method: "POST",
      body: { model: entry.id },
    });
    return details && typeof details === "object" ? details : entry.metadata;
  } catch {
    if (signal?.aborted) throw abortError();
    // Older servers may not expose capabilities. Keep those entries marked
    // unknown rather than inventing installed/compatible models.
    return entry.metadata;
  }
}

export async function fetchProviderModels(
  config: ProviderConfig,
  signal?: AbortSignal
): Promise<AIModel[]> {
  const catalog = await readCatalog(config, signal);
  const models: AIModel[] = [];
  // Bound metadata concurrency for local servers with many installed models.
  for (let offset = 0; offset < catalog.length; offset += 4) {
    if (signal?.aborted) throw abortError();
    const batch = await Promise.all(
      catalog.slice(offset, offset + 4).map(async (entry) => {
        const metadata =
          config.id === "ollama"
            ? await ollamaCapabilities(config, entry, signal)
            : entry.metadata;
        const compatibility = chatCompatibility(config.id, entry.id, metadata);
        if (compatibility === "unsupported") return null;
        return {
          id: entry.id,
          name: entry.name,
          provider: config.id,
          chatCompatibility: compatibility,
        } satisfies AIModel;
      })
    );
    if (signal?.aborted) throw abortError();
    for (const model of batch) if (model) models.push(model);
  }
  return models;
}

export async function probeProviderConnection(
  config: ProviderConfig,
  signal?: AbortSignal
): Promise<{ modelCount?: number }> {
  if (config.id !== "openrouter")
    // Probe endpoint/authentication independently from chat compatibility. A
    // reachable Ollama server with only embedding models still passes a probe.
    return { modelCount: (await readCatalog(config, signal)).length };
  const response = await httpRequest<{ data?: unknown; error?: unknown }>(
    requestDetails(config, "/auth/key", signal)
  );
  if (
    !response ||
    typeof response !== "object" ||
    !response.data ||
    typeof response.data !== "object" ||
    response.error
  )
    invalid(config);
  return {};
}

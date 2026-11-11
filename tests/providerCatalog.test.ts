import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultProviderConfig } from "../src/config/providers";
import {
  fetchProviderModels,
  probeProviderConnection,
} from "../src/services/ProviderCatalog";
import { ModelService } from "../src/services/ModelService";
import { StorageService } from "../src/services/StorageService";
import type { ProviderId } from "../src/types";

function response(value: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => value,
    text: async () => JSON.stringify(value),
  };
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("provider catalog and strict connection probes", () => {
  it("allows reading model preferences after a transient write failure", async () => {
    vi.spyOn(StorageService, "getItem")
      .mockResolvedValueOnce({ openai: "existing" })
      .mockResolvedValue({ openai: "existing" });
    vi.spyOn(StorageService, "setItem").mockRejectedValueOnce(
      new Error("storage failed")
    );
    await expect(
      ModelService.setStoredActiveModel("openai", "new")
    ).rejects.toThrow("storage failed");
    await expect(ModelService.getStoredActiveModel("openai")).resolves.toBe(
      "existing"
    );
  });

  it.each([
    ["mistral", "/models", "Authorization", { data: [{ id: "a" }] }],
    ["openai", "/models", "Authorization", { data: [{ id: "a" }] }],
    ["claude", "/models", "x-api-key", { data: [{ id: "a" }] }],
    [
      "gemini",
      "/models",
      "x-goog-api-key",
      {
        models: [
          { name: "models/a", supportedGenerationMethods: ["generateContent"] },
        ],
      },
    ],
    ["openrouter", "/auth/key", "Authorization", { data: { label: "test" } }],
    ["ollama", "/api/tags", "none", { models: [{ name: "a" }] }],
  ] as const)(
    "probes %s using its authenticated endpoint",
    async (id, path, header, payload) => {
      const fetchMock = vi.fn(async () => response(payload));
      vi.stubGlobal("fetch", fetchMock);
      const config = {
        ...createDefaultProviderConfig(id),
        apiKey: id === "ollama" ? "" : "test-key",
      };
      await probeProviderConnection(config);
      const [url, request] = fetchMock.mock.calls[0] as unknown as [
        string,
        RequestInit,
      ];
      expect(url).toBe(config.endpoint + path);
      expect(url).not.toContain("test-key");
      const headers = request.headers as Record<string, string>;
      if (header !== "none") expect(headers[header]).toContain("test-key");
      else expect(headers.Authorization).toBeUndefined();
    }
  );

  it("does not claim success for an invalid OpenRouter key", async () => {
    const fetchMock = vi.fn(async () => response({ error: "invalid" }, 401));
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      probeProviderConnection({
        ...createDefaultProviderConfig("openrouter"),
        apiKey: "invalid",
      })
    ).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("paginates Gemini and filters by supported method, without duplicate IDs", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          models: [
            {
              name: "models/a",
              supportedGenerationMethods: ["generateContent"],
            },
            {
              name: "models/embed",
              supportedGenerationMethods: ["embedContent"],
            },
          ],
          nextPageToken: "next",
        })
      )
      .mockResolvedValueOnce(
        response({
          models: [
            {
              name: "models/a",
              supportedGenerationMethods: ["generateContent"],
            },
            {
              name: "models/b",
              supportedGenerationMethods: ["generateContent"],
            },
          ],
        })
      );
    vi.stubGlobal("fetch", fetchMock);
    const models = await fetchProviderModels({
      ...createDefaultProviderConfig("gemini"),
      apiKey: "test-key",
    });
    expect(models.map((m) => m.id)).toEqual(["a", "b"]);
    expect(fetchMock.mock.calls[1]![0]).toContain("pageToken=next");
  });

  it("reports an available Ollama with no models as a remote empty list", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response({ models: [] }))
    );
    ModelService.invalidate("ollama");
    expect(
      await ModelService.listModels(createDefaultProviderConfig("ollama"))
    ).toEqual({ models: [], source: "remote" });
  });

  it("uses the proxy upstream and does not put Gemini credentials in the URL", async () => {
    const fetchMock = vi.fn(async () => response({ models: [] }));
    vi.stubGlobal("fetch", fetchMock);
    const config = {
      ...createDefaultProviderConfig("gemini"),
      apiKey: "test-key",
      useProxy: true,
      proxyUrl: "https://proxy.example",
    };
    await fetchProviderModels(config);
    const [url, request] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://proxy.example/models");
    expect(request.headers).toMatchObject({
      "x-goog-api-key": "test-key",
      "X-OUAI-Upstream": config.endpoint,
    });
  });

  it("caches remote models for five minutes and refreshes after expiry", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(10);
    const fetchMock = vi.fn(async () => response({ data: [{ id: "a" }] }));
    vi.stubGlobal("fetch", fetchMock);
    const config = {
      ...createDefaultProviderConfig("openai"),
      apiKey: "test-key",
    };
    ModelService.invalidate("openai");
    expect((await ModelService.listModels(config)).source).toBe("remote");
    expect((await ModelService.listModels(config)).source).toBe("cache");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    now.mockReturnValue(300_010);
    expect((await ModelService.listModels(config)).source).toBe("remote");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects repeating pagination cursors instead of looping forever", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response({ data: [], has_more: true, last_id: "same" }))
    );
    await expect(
      fetchProviderModels({
        ...createDefaultProviderConfig("claude"),
        apiKey: "test-key",
      })
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("uses fallback for missing credentials and never claims a verified connection", async () => {
    const config = createDefaultProviderConfig("openai");
    ModelService.invalidate("openai");
    expect((await ModelService.listModels(config)).source).toBe("fallback");
    await expect(ModelService.probeConnection(config)).rejects.toThrow(
      "noApiKey"
    );
  });

  it("prevents a late response from refilling an invalidated cache", async () => {
    let resolveFirst!: (value: unknown) => void;
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          })
      )
      .mockResolvedValue(response({ data: [{ id: "new" }] }));
    vi.stubGlobal("fetch", fetchMock);
    const id: ProviderId = "openai";
    const first = { ...createDefaultProviderConfig(id), apiKey: "old" };
    const second = { ...first, apiKey: "new" };
    ModelService.invalidate(id);
    const pending = ModelService.listModels(first);
    expect((await ModelService.listModels(second)).models[0]?.id).toBe("new");
    resolveFirst(response({ data: [{ id: "old" }] }));
    await pending;
    expect((await ModelService.listModels(second)).models[0]?.id).toBe("new");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

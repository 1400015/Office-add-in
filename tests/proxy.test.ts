import { afterEach, describe, expect, it, vi } from "vitest";
import { handleProxy, resolveUpstream } from "../src/proxy/forward";

describe("resolveUpstream", () => {
  it("joins an allowlisted endpoint with the request path", () => {
    expect(
      resolveUpstream("https://api.openai.com/v1", "/chat/completions")
    ).toBe("https://api.openai.com/v1/chat/completions");
  });

  it("allows Azure OpenAI hosts and rejects everything else", () => {
    expect(
      resolveUpstream(
        "https://contoso.openai.azure.com/openai/deployments/gpt-4o",
        "/chat/completions"
      )
    ).toContain("contoso.openai.azure.com");
    expect(resolveUpstream("https://evil.example", "/chat/completions")).toBe(
      null
    );
    expect(resolveUpstream("http://api.openai.com/v1", "/chat")).toBeNull();
    expect(
      resolveUpstream("https://api.openai.com/v1", "/../secret")
    ).toBeNull();
  });
});

describe("handleProxy", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("refuses a missing upstream", async () => {
    const response = await handleProxy(
      new Request("https://proxy.example/chat/completions", { method: "POST" })
    );
    expect(response.status).toBe(400);
  });

  it("forwards the body and streams the upstream response", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => {
      return new Response("data: hello\n\n", {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const response = await handleProxy(
      new Request("https://proxy.example/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer sk-test",
          "X-OUAI-Upstream": "https://api.openai.com/v1",
        },
        body: JSON.stringify({ model: "gpt-4o" }),
      })
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    const headers = new Headers(init?.headers);
    expect(headers.get("authorization")).toBe("Bearer sk-test");
    expect(headers.get("x-ouai-upstream")).toBeNull();
  });

  it("rejects a browser origin that is not allowlisted", async () => {
    const response = await handleProxy(
      new Request("https://proxy.example/chat/completions", {
        method: "POST",
        headers: {
          Origin: "https://evil.example",
          "X-OUAI-Upstream": "https://api.openai.com/v1",
        },
      })
    );
    expect(response.status).toBe(403);
  });

  it("echoes an allowed origin on preflight", async () => {
    const response = await handleProxy(
      new Request("https://proxy.example/chat/completions", {
        method: "OPTIONS",
        headers: { Origin: "https://localhost:3000" },
      })
    );
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://localhost:3000"
    );
  });

  it("accepts extra origins from ALLOWED_ORIGINS", async () => {
    const response = await handleProxy(
      new Request("https://proxy.example/chat/completions", {
        method: "OPTIONS",
        headers: { Origin: "https://addin.example" },
      }),
      { ALLOWED_ORIGINS: "https://addin.example" }
    );
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://addin.example"
    );
  });
});

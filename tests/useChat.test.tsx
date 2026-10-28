// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { useChat } from "../src/hooks/useChat";
import { useAppStore } from "../src/store/useAppStore";

vi.mock("../src/providers/ProviderFactory", () => ({
  createProvider: vi.fn(),
}));

vi.mock("../src/services/HistoryService", () => ({
  HistoryService: {
    saveChat: vi.fn().mockResolvedValue(undefined),
    listChats: vi.fn().mockResolvedValue([]),
    getChat: vi.fn().mockResolvedValue(undefined),
    deleteChat: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
    prune: vi.fn().mockResolvedValue(undefined),
  },
}));

import { createProvider } from "../src/providers/ProviderFactory";

const mockStore = {
  providerConfigs: {
    mistral: {
      id: "mistral",
      name: "Mistral",
      apiKey: "test-key",
      endpoint: "https://api.mistral.ai/v1",
      useProxy: false,
      proxyUrl: "",
      timeout: 30000,
    },
  },
  activeProvider: "mistral" as const,
  activeModel: "mistral-large-latest",
  temperature: 0.7,
  maxTokens: 1024,
  reasoning: "off" as const,
  systemPrompt: "",
};

beforeEach(() => {
  vi.stubGlobal("OfficeRuntime", {
    storage: {
      getItem: vi.fn().mockResolvedValue(null),
      setItem: vi.fn().mockResolvedValue(undefined),
      removeItem: vi.fn().mockResolvedValue(undefined),
      getKeys: vi.fn().mockResolvedValue([]),
      removeItems: vi.fn().mockResolvedValue(undefined),
    },
  });
  vi.clearAllMocks();
  useAppStore.setState(mockStore);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("useChat", () => {
  it("throws noApiKey when provider has empty key (non-ollama)", async () => {
    useAppStore.setState({
      providerConfigs: {
        mistral: { ...mockStore.providerConfigs.mistral, apiKey: "" },
      },
    });
    const { result } = renderHook(() => useChat());
    await result.current.sendMessage("hello");
    await waitFor(() => {
      expect(useAppStore.getState().error).toBe("noApiKey");
    });
  });

  it("sends a message and stores the assistant reply", async () => {
    const chatStreamMock = vi
      .fn()
      .mockImplementation(
        async (
          _messages: unknown,
          _options: unknown,
          onToken: (token: string) => void
        ) => {
          onToken("mocked ");
          onToken("reply");
        }
      );
    vi.mocked(createProvider).mockReturnValue({
      chat: vi.fn(),
      chatStream: chatStreamMock,
      getModels: vi.fn().mockResolvedValue([]),
      id: "mistral",
    } as unknown as ReturnType<typeof createProvider>);

    const { result } = renderHook(() => useChat());
    await result.current.sendMessage("hello");
    await waitFor(() => {
      const state = useAppStore.getState();
      expect(state.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
      expect(state.messages[1]!.content).toBe("mocked reply");
      expect(state.error).toBeNull();
    });
  });
});

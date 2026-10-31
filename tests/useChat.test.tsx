// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { useChat } from "../src/hooks/useChat";
import { useAppStore } from "../src/store/useAppStore";
import {
  createDefaultProviderConfig,
  PROVIDER_ORDER,
} from "../src/config/providers";
import type { ProviderConfig, ProviderId } from "../src/types";

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

function createConfigs(): Record<ProviderId, ProviderConfig> {
  const configs = {} as Record<ProviderId, ProviderConfig>;
  for (const id of PROVIDER_ORDER)
    configs[id] = createDefaultProviderConfig(id);
  configs.mistral = { ...configs.mistral, apiKey: "test-key", timeout: 30000 };
  return configs;
}

const mockStore = {
  hydrated: true,
  providerConfigs: createConfigs(),
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
        ...mockStore.providerConfigs,
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
      expect(state.messages[0]!.content).toBe("hello");
      expect(state.messages[1]!.content).toBe("mocked reply");
      expect(state.error).toBeNull();
      expect(state.isStreaming).toBe(false);
    });
    const sent = chatStreamMock.mock.calls[0]?.[0] as { content: string }[];
    expect(sent.map((message) => message.content)).toContain("hello");
  });

  it("stops streaming and shows an error when the provider fails", async () => {
    vi.mocked(createProvider).mockReturnValue({
      chat: vi.fn(),
      chatStream: vi.fn().mockRejectedValue(new Error("HTTP_401 unauthorized")),
      getModels: vi.fn().mockResolvedValue([]),
      id: "mistral",
    } as unknown as ReturnType<typeof createProvider>);

    const { result } = renderHook(() => useChat());
    await result.current.sendMessage("hello");
    await waitFor(() => {
      const state = useAppStore.getState();
      expect(state.isStreaming).toBe(false);
      expect(state.error).toBe("errors.auth");
    });
  });

  it("drops the answer when the conversation changes mid-stream", async () => {
    const chatStreamMock = vi
      .fn()
      .mockImplementation(
        async (
          _messages: unknown,
          _options: unknown,
          onToken: (token: string) => void
        ) => {
          onToken("partial ");
          useAppStore.getState().startNewChat();
          onToken("answer");
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
      expect(useAppStore.getState().isStreaming).toBe(false);
    });
    expect(useAppStore.getState().messages).toHaveLength(0);
    expect(useAppStore.getState().streamingContent).toBe("");
  });
});

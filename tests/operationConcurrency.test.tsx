// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { useChat } from "../src/hooks/useChat";
import { useAppStore } from "../src/store/useAppStore";
import { OperationService } from "../src/services/OperationService";
import { createDefaultProviderConfig } from "../src/config/providers";
import { createProvider } from "../src/providers/ProviderFactory";
import { HistoryService } from "../src/services/HistoryService";
import { StorageService } from "../src/services/StorageService";

vi.mock("../src/providers/ProviderFactory", () => ({
  createProvider: vi.fn(),
}));
vi.mock("../src/services/HistoryService", () => ({
  HistoryService: {
    saveChat: vi.fn(async () => {}),
    listChats: vi.fn(async () => []),
    getChat: vi.fn(async () => undefined),
    deleteChat: vi.fn(async () => {}),
    clear: vi.fn(async () => {}),
    prune: vi.fn(async () => {}),
  },
}));

interface PendingStream {
  token: (value: string) => void;
  signal: AbortSignal;
  resolve: () => void;
}

function mockStreams(): PendingStream[] {
  const streams: PendingStream[] = [];
  const chatStream = vi.fn(
    (
      _messages,
      _options,
      token: (value: string) => void,
      _context,
      signal: AbortSignal
    ) =>
      new Promise<void>((resolve) => {
        streams.push({ token, signal, resolve });
      })
  );
  vi.mocked(createProvider).mockReturnValue({
    chatStream,
    chat: vi.fn(),
  } as unknown as ReturnType<typeof createProvider>);
  return streams;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("OfficeRuntime", {
    storage: {
      getItem: vi.fn(async () => null),
      setItem: vi.fn(async () => {}),
      getKeys: vi.fn(async () => []),
      removeItems: vi.fn(async () => {}),
    },
  });
  useAppStore.getState().startNewChat();
  const config = {
    ...createDefaultProviderConfig("mistral"),
    apiKey: "test-key",
  };
  useAppStore.setState((state) => ({
    providerConfigs: { ...state.providerConfigs, mistral: config },
    activeProvider: "mistral",
    activeModel: "test-model",
    hydrated: true,
    secretsLocked: false,
  }));
});
afterEach(() => {
  OperationService.cancel();
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("shared operation lifecycle", () => {
  it("does not start content operations before settings finish hydrating", async () => {
    useAppStore.setState({ hydrated: false });
    const sender = renderHook(() => useChat());
    await act(async () => {
      await sender.result.current.sendMessage("blocked");
    });
    expect(createProvider).not.toHaveBeenCalled();
    expect(OperationService.current()).toBeNull();
    expect(useAppStore.getState().messages).toEqual([]);
  });
  it("stops a stream from another hook and saves the partial answer once", async () => {
    const streams = mockStreams();
    const sender = renderHook(() => useChat());
    const stopper = renderHook(() => useChat());
    let pending!: Promise<void>;
    act(() => {
      pending = sender.result.current.sendMessage("first");
    });
    await waitFor(() => expect(streams).toHaveLength(1));
    act(() => {
      streams[0]!.token("partial");
    });
    act(() => {
      stopper.result.current.stopStreaming();
      stopper.result.current.stopStreaming();
    });
    expect(streams[0]!.signal.aborted).toBe(true);
    act(() => {
      streams[0]!.token("ignored");
      streams[0]!.resolve();
    });
    await act(async () => {
      await pending;
    });
    expect(useAppStore.getState().messages.map((m) => m.content)).toEqual([
      "first",
      "partial",
    ]);
    expect(useAppStore.getState().isStreaming).toBe(false);
  });

  it("drops callbacks and finalization from the old chat while a new stream runs", async () => {
    const streams = mockStreams();
    const sender = renderHook(() => useChat());
    const other = renderHook(() => useChat());
    let oldPending!: Promise<void>;
    act(() => {
      oldPending = sender.result.current.sendMessage("old");
    });
    await waitFor(() => expect(streams).toHaveLength(1));
    act(() => {
      useAppStore.getState().startNewChat();
    });
    expect(streams[0]!.signal.aborted).toBe(true);
    let newPending!: Promise<void>;
    act(() => {
      newPending = other.result.current.sendMessage("new");
    });
    await waitFor(() => expect(streams).toHaveLength(2));
    const current = OperationService.current();
    act(() => {
      streams[1]!.token("new answer");
      streams[0]!.token("stale");
      streams[0]!.resolve();
    });
    await act(async () => {
      await oldPending;
    });
    expect(OperationService.current()).toBe(current);
    expect(useAppStore.getState().isStreaming).toBe(true);
    expect(useAppStore.getState().streamingContent).toBe("new answer");
    act(() => {
      streams[1]!.resolve();
    });
    await act(async () => {
      await newPending;
    });
    expect(useAppStore.getState().messages.map((m) => m.content)).toEqual([
      "new",
      "new answer",
    ]);
  });

  it("rejects overlap and old finish cannot clear a newer operation", () => {
    const old = OperationService.begin("a", "mistral", "model");
    expect(old).not.toBeNull();
    expect(OperationService.begin("b", "mistral", "model")).toBeNull();
    OperationService.cancel();
    expect(() => old!.assertCurrent()).toThrow();
    const next = OperationService.begin("b", "mistral", "model");
    OperationService.finish(old!);
    expect(OperationService.current()).toBe(next);
    OperationService.finish(next!);
    expect(OperationService.current()).toBeNull();
  });

  it("does not run the Office write of a cancelled quick action after its provider resolves", async () => {
    let resolveChat!: (value: string) => void;
    let capturedSignal: AbortSignal | undefined;
    const chat = vi.fn((_messages, _options, _context, signal: AbortSignal) => {
      capturedSignal = signal;
      return new Promise<string>((resolve) => {
        resolveChat = resolve;
      });
    });
    vi.mocked(createProvider).mockReturnValue({ chat } as unknown as ReturnType<
      typeof createProvider
    >);
    const runner = renderHook(() => useChat());
    const stopper = renderHook(() => useChat());
    const write = vi.fn();
    let pending!: Promise<string | null>;
    act(() => {
      pending = runner.result.current.runQuickAction(
        async (prompt, context) => {
          const answer = await prompt("request");
          context.assertCurrent();
          write(answer);
          return answer;
        },
        "test"
      );
    });
    await waitFor(() => expect(chat).toHaveBeenCalledOnce());
    act(() => {
      stopper.result.current.stopStreaming();
    });
    expect(capturedSignal?.aborted).toBe(true);
    resolveChat("late result");
    await act(async () => {
      await pending;
    });
    expect(write).not.toHaveBeenCalled();
    expect(useAppStore.getState().messages).toEqual([]);
  });

  it("orders clear after an in-flight save and does not recreate the conversation when settings are saved", async () => {
    let finishSave!: () => void;
    vi.mocked(HistoryService.saveChat).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishSave = resolve;
        })
    );
    vi.spyOn(StorageService, "setItem").mockResolvedValue(undefined);
    vi.spyOn(StorageService, "getItem").mockResolvedValue(null);
    const state = useAppStore.getState();
    const id = state.ensureChatId();
    const message = {
      id: "u",
      role: "user" as const,
      content: "sensitive",
      timestamp: 1,
    };
    state.setMessages([message]);
    const save = state.saveConversation([message], "mistral", "model", id);
    await waitFor(() => expect(HistoryService.saveChat).toHaveBeenCalledOnce());
    const clear = useAppStore.getState().clearHistory();
    expect(useAppStore.getState().currentChatId).toBeNull();
    expect(HistoryService.clear).not.toHaveBeenCalled();
    finishSave();
    await Promise.all([save, clear]);
    await useAppStore.getState().persist();
    expect(HistoryService.clear).toHaveBeenCalledOnce();
    expect(HistoryService.saveChat).toHaveBeenCalledOnce();
    expect(
      vi.mocked(HistoryService.saveChat).mock.invocationCallOrder[0]
    ).toBeLessThan(
      vi.mocked(HistoryService.clear).mock.invocationCallOrder[0]!
    );
    expect(useAppStore.getState().messages).toEqual([]);
  });
});

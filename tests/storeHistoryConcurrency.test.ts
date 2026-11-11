import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatHistory, ChatMessage } from "../src/types";

const mocks = vi.hoisted(() => ({
  chats: new Map<string, ChatHistory>(),
  saveChat: vi.fn<(chat: ChatHistory) => Promise<void>>(),
  deleteChat: vi.fn<(id: string) => Promise<void>>(),
  clear: vi.fn<() => Promise<void>>(),
  listChats: vi.fn<() => Promise<ChatHistory[]>>(),
  setItem: vi.fn<() => Promise<void>>(),
  getItem: vi.fn<() => Promise<null>>(),
  setStoredActiveModel: vi.fn<() => Promise<void>>(),
}));

vi.mock("../src/services/HistoryService", () => ({
  HistoryService: {
    saveChat: mocks.saveChat,
    deleteChat: mocks.deleteChat,
    clear: mocks.clear,
    listChats: mocks.listChats,
  },
}));

vi.mock("../src/services/StorageService", () => ({
  StorageService: { setItem: mocks.setItem, getItem: mocks.getItem },
  StorageLockedError: class StorageLockedError extends Error {},
}));

vi.mock("../src/services/ModelService", () => ({
  ModelService: {
    invalidate: vi.fn(),
    setStoredActiveModel: mocks.setStoredActiveModel,
  },
}));

import { useAppStore } from "../src/store/useAppStore";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const message: ChatMessage = {
  id: "message-1",
  role: "user",
  content: "Pergunta",
  timestamp: 1,
};

function save(id: string): Promise<void> {
  return useAppStore
    .getState()
    .saveConversation([message], "mistral", "model", id);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.chats.clear();
  mocks.saveChat.mockImplementation(async (chat) => {
    mocks.chats.set(chat.id, chat);
  });
  mocks.deleteChat.mockImplementation(async (id) => {
    mocks.chats.delete(id);
  });
  mocks.clear.mockImplementation(async () => {
    mocks.chats.clear();
  });
  mocks.listChats.mockImplementation(async () => [...mocks.chats.values()]);
  mocks.setItem.mockResolvedValue(undefined);
  mocks.getItem.mockResolvedValue(null);
  mocks.setStoredActiveModel.mockResolvedValue(undefined);
  useAppStore.setState({
    currentChatId: null,
    messages: [],
    history: [],
    secretsLocked: false,
    isStreaming: false,
    streamingContent: "",
    pendingAction: null,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("history and settings concurrency", () => {
  it("saving settings does not create a history entry for the active conversation", async () => {
    useAppStore.setState({ currentChatId: "active", messages: [message] });
    await useAppStore.getState().persist();
    expect(mocks.setItem).toHaveBeenCalled();
    expect(mocks.saveChat).not.toHaveBeenCalled();
    expect(mocks.chats.size).toBe(0);
  });

  it.each(["clear", "delete"] as const)(
    "%s waits for an in-flight save and prevents queued saves from reviving it",
    async (action) => {
      const started = deferred();
      const release = deferred();
      mocks.saveChat.mockImplementation(async (chat) => {
        started.resolve();
        await release.promise;
        mocks.chats.set(chat.id, chat);
      });
      useAppStore.setState({ currentChatId: "old", messages: [message] });
      const first = save("old");
      await started.promise;
      const second = save("old");
      const removal =
        action === "clear"
          ? useAppStore.getState().clearHistory()
          : useAppStore.getState().deleteConversation("old");
      release.resolve();
      await Promise.all([first, second, removal]);
      expect(mocks.chats.has("old")).toBe(false);
      expect(mocks.saveChat).toHaveBeenCalledTimes(1);
      expect(useAppStore.getState().currentChatId).toBeNull();
      expect(useAppStore.getState().history).toEqual([]);
    }
  );

  it("a delayed save cannot restore the previous ID after starting a new chat", async () => {
    const started = deferred();
    const release = deferred();
    mocks.saveChat.mockImplementation(async (chat) => {
      started.resolve();
      await release.promise;
      mocks.chats.set(chat.id, chat);
    });
    const oldId = useAppStore.getState().ensureChatId();
    const pending = save(oldId);
    await started.promise;
    useAppStore.getState().startNewChat();
    const newId = useAppStore.getState().ensureChatId();
    expect(newId).not.toBe(oldId);
    release.resolve();
    await pending;
    expect(useAppStore.getState().currentChatId).toBe(newId);
    expect(useAppStore.getState().messages).toEqual([]);
  });

  it.each(["delete", "clear"] as const)(
    "cannot reopen a conversation while %s is pending",
    async (action) => {
      await save("old");
      useAppStore.setState({ currentChatId: "old", messages: [message] });
      const started = deferred();
      const release = deferred();
      const remove = async () => {
        started.resolve();
        await release.promise;
        mocks.chats.delete("old");
      };
      mocks.deleteChat.mockImplementation(remove);
      mocks.clear.mockImplementation(remove);
      const pending =
        action === "delete"
          ? useAppStore.getState().deleteConversation("old")
          : useAppStore.getState().clearHistory();
      await started.promise;
      useAppStore.getState().loadChat("old");
      release.resolve();
      await pending;
      expect(useAppStore.getState().currentChatId).toBeNull();
      expect(useAppStore.getState().messages).toEqual([]);
      expect(useAppStore.getState().history).toEqual([]);
      expect(mocks.chats.has("old")).toBe(false);
    }
  );

  it("does not republish a stale list resolved after deletion", async () => {
    const started = deferred();
    const release = deferred();
    mocks.listChats.mockImplementationOnce(async () => {
      const snapshot = [...mocks.chats.values()];
      started.resolve();
      await release.promise;
      return snapshot;
    });
    const saving = save("old");
    await started.promise;
    await useAppStore.getState().deleteConversation("old");
    release.resolve();
    await saving;
    expect(useAppStore.getState().history).toEqual([]);
    expect(mocks.chats.has("old")).toBe(false);
  });

  it("deleting another conversation keeps the active conversation open", async () => {
    await save("active");
    await save("other");
    useAppStore.setState({ currentChatId: "active", messages: [message] });
    await useAppStore.getState().deleteConversation("other");
    expect(useAppStore.getState().currentChatId).toBe("active");
    expect(useAppStore.getState().messages).toEqual([message]);
    expect(useAppStore.getState().history.map((chat) => chat.id)).toEqual([
      "active",
    ]);
  });

  it("does not restore a delayed plaintext history list after locking", async () => {
    const started = deferred();
    const release = deferred();
    mocks.listChats.mockImplementationOnce(async () => {
      const snapshot = [...mocks.chats.values()];
      started.resolve();
      await release.promise;
      return snapshot;
    });
    const saving = save("secret");
    await started.promise;
    useAppStore.getState().lockSecrets();
    release.resolve();
    await saving;
    expect(useAppStore.getState().secretsLocked).toBe(true);
    expect(useAppStore.getState().history).toEqual([]);
    expect(useAppStore.getState().messages).toEqual([]);
  });
});

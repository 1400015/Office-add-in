import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatHistory } from "../src/types";

vi.mock("idb", () => {
  interface StoredChat {
    id: string;
    timestamp: number;
  }
  const chats = new Map<string, StoredChat>();
  const txStore = {
    delete: vi.fn(async (id: string) => {
      chats.delete(id);
    }),
  };
  const db = {
    put: vi.fn(async (_store: string, chat: StoredChat) => {
      chats.set(chat.id, chat);
    }),
    get: vi.fn(async (_store: string, id: string) => chats.get(id)),
    getAllFromIndex: vi.fn(async () =>
      Array.from(chats.values()).sort((a, b) => a.timestamp - b.timestamp)
    ),
    getAll: vi.fn(async () => Array.from(chats.values())),
    getAllKeys: vi.fn(async () => Array.from(chats.keys())),
    delete: vi.fn(async (_store: string, id: string) => {
      chats.delete(id);
    }),
    clear: vi.fn(async () => {
      chats.clear();
    }),
    transaction: vi.fn(() => ({ store: txStore, done: Promise.resolve() })),
  };
  return {
    openDB: vi.fn(async () => db),
  };
});

import { HistoryService } from "../src/services/HistoryService";
import { CryptoService } from "../src/services/CryptoService";

const storageValues = new Map<string, string>();

function makeChat(id: string, timestamp: number): ChatHistory {
  return {
    id,
    title: `Chat ${id}`,
    messages: [],
    timestamp,
    provider: "mistral",
    model: "mistral-large-latest",
  };
}

beforeEach(async () => {
  storageValues.clear();
  CryptoService.lock();
  vi.stubGlobal("OfficeRuntime", {
    storage: {
      getItem: async (key: string) => storageValues.get(key),
      setItem: async (key: string, value: string) => {
        storageValues.set(key, value);
      },
    },
  });
  const { openDB } = await import("idb");
  const db = await openDB("test-db", 1);
  await db.clear("chats");
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("HistoryService", () => {
  it("refuses to store plaintext while a vault is locked", async () => {
    await CryptoService.createPassphrase("correct horse");
    CryptoService.lock();
    const { openDB } = await import("idb");
    const db = await openDB("test-db", 1);
    await expect(
      HistoryService.saveChat(makeChat("secret", 1))
    ).rejects.toThrow("locked");
    expect(db.put).not.toHaveBeenCalled();
  });

  it("does not write if the vault locks while encryption is pending", async () => {
    await CryptoService.createPassphrase("correct horse");
    const { openDB } = await import("idb");
    const db = await openDB("test-db", 1);
    vi.spyOn(CryptoService, "encrypt").mockImplementation(async () => {
      CryptoService.lock();
      return "enc:v2:fake:fake";
    });
    await expect(
      HistoryService.saveChat(makeChat("secret", 1))
    ).rejects.toThrow("locked");
    expect(db.put).not.toHaveBeenCalled();
  });

  it("hides legacy plaintext chats while a configured vault is locked", async () => {
    const chat = makeChat("old", 1);
    await HistoryService.saveChat(chat);
    await CryptoService.createPassphrase("correct horse");
    CryptoService.lock();
    expect((await HistoryService.listChats())[0]?.title).toBe("locked");
    expect(await CryptoService.unlock("correct horse")).toBe(true);
    expect(await HistoryService.getChat("old")).toEqual(chat);
  });

  it("fails closed if protection metadata cannot be trusted", async () => {
    storageValues.set("ouai.passphraseCheck", "invalid");
    const { openDB } = await import("idb");
    const db = await openDB("test-db", 1);
    await expect(
      HistoryService.saveChat(makeChat("secret", 1))
    ).rejects.toThrow("protection state");
    expect(db.put).not.toHaveBeenCalled();
  });
  it("saves and retrieves a chat by id", async () => {
    const chat = makeChat("c1", 1000);
    await HistoryService.saveChat(chat);
    expect(await HistoryService.getChat("c1")).toEqual(chat);
  });

  it("returns undefined for unknown id", async () => {
    expect(await HistoryService.getChat("nope")).toBeUndefined();
  });

  it("lists chats sorted by timestamp (newest first)", async () => {
    await HistoryService.saveChat(makeChat("old", 100));
    await HistoryService.saveChat(makeChat("new", 300));
    await HistoryService.saveChat(makeChat("mid", 200));
    const list = await HistoryService.listChats();
    expect(list.map((c) => c.id)).toEqual(["new", "mid", "old"]);
  });

  it("deletes a chat", async () => {
    await HistoryService.saveChat(makeChat("del", 100));
    await HistoryService.deleteChat("del");
    expect(await HistoryService.getChat("del")).toBeUndefined();
  });

  it("clears all chats", async () => {
    await HistoryService.saveChat(makeChat("a", 100));
    await HistoryService.saveChat(makeChat("b", 200));
    await HistoryService.clear();
    expect(await HistoryService.listChats()).toEqual([]);
  });

  it("overwrites a chat with the same id", async () => {
    await HistoryService.saveChat(makeChat("same", 100));
    const updated = { ...makeChat("same", 200), title: "Updated" };
    await HistoryService.saveChat(updated);
    const chat = await HistoryService.getChat("same");
    expect(chat?.title).toBe("Updated");
  });
});

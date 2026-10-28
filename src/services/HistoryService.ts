import { openDB, type IDBPDatabase } from "idb";
import type { ChatHistory } from "../types";
import {
  IDB_NAME,
  IDB_STORE_CHATS,
  IDB_VERSION,
  MAX_HISTORY_ENTRIES,
} from "../constants";
import { logger } from "./LoggerService";
import { CryptoService } from "./CryptoService";

export const LOCKED_HISTORY_TITLE = "locked";

interface StoredChat extends ChatHistory {
  sealed?: string;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(IDB_NAME, IDB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(IDB_STORE_CHATS)) {
          const store = db.createObjectStore(IDB_STORE_CHATS, {
            keyPath: "id",
          });
          store.createIndex("timestamp", "timestamp");
        }
      },
    });
  }
  return dbPromise;
}

async function materialize(raw: StoredChat): Promise<ChatHistory> {
  if (!raw.sealed) return raw;
  if (!CryptoService.isUnlocked()) {
    return {
      id: raw.id,
      timestamp: raw.timestamp,
      provider: raw.provider ?? "mistral",
      model: "",
      title: LOCKED_HISTORY_TITLE,
      messages: [],
    };
  }
  const json = await CryptoService.decrypt(raw.sealed);
  return JSON.parse(json) as ChatHistory;
}

export const HistoryService = {
  async saveChat(chat: ChatHistory): Promise<void> {
    const db = await getDb();
    if (CryptoService.isUnlocked()) {
      const sealed = await CryptoService.encrypt(JSON.stringify(chat));
      const stored: StoredChat = {
        id: chat.id,
        timestamp: chat.timestamp,
        provider: chat.provider,
        model: "",
        title: "",
        messages: [],
        sealed,
      };
      await db.put(IDB_STORE_CHATS, stored);
    } else {
      await db.put(IDB_STORE_CHATS, chat);
    }
    await this.prune();
  },

  async getChat(id: string): Promise<ChatHistory | undefined> {
    const db = await getDb();
    const raw = (await db.get(IDB_STORE_CHATS, id)) as StoredChat | undefined;
    if (!raw) return undefined;
    return materialize(raw);
  },

  async listChats(): Promise<ChatHistory[]> {
    const db = await getDb();
    const all = (await db.getAllFromIndex(
      IDB_STORE_CHATS,
      "timestamp"
    )) as StoredChat[];
    const chats = await Promise.all(all.map((raw) => materialize(raw)));
    return chats.sort((a, b) => b.timestamp - a.timestamp);
  },

  async deleteChat(id: string): Promise<void> {
    const db = await getDb();
    await db.delete(IDB_STORE_CHATS, id);
  },

  async clear(): Promise<void> {
    const db = await getDb();
    await db.clear(IDB_STORE_CHATS);
  },

  async prune(): Promise<void> {
    try {
      const db = await getDb();
      const keys = await db.getAllKeys(IDB_STORE_CHATS);
      if (keys.length <= MAX_HISTORY_ENTRIES) return;
      const all = (await db.getAll(IDB_STORE_CHATS)) as StoredChat[];
      all.sort((a, b) => b.timestamp - a.timestamp);
      const toDelete = all.slice(MAX_HISTORY_ENTRIES);
      const tx = db.transaction(IDB_STORE_CHATS, "readwrite");
      for (const chat of toDelete) {
        await tx.store.delete(chat.id);
      }
      await tx.done;
      logger.info("history", `Pruned ${toDelete.length} old chats`);
    } catch (error) {
      logger.warn("history", "Failed to prune history", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },

  async resealAll(): Promise<void> {
    if (!CryptoService.isUnlocked()) return;
    const chats = await this.listChats();
    for (const chat of chats) {
      if (chat.title === LOCKED_HISTORY_TITLE && chat.messages.length === 0) {
        continue;
      }
      await this.saveChat(chat);
    }
  },
};

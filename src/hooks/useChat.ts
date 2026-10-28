import { useCallback, useRef } from "react";
import { useAppStore } from "../store/useAppStore";
import { createProvider } from "../providers/ProviderFactory";
import { getContext, insertTextAtSelection } from "../services/OfficeService";
import { ModelService } from "../services/ModelService";
import { HistoryService } from "../services/HistoryService";
import type { ChatMessage } from "../types";
import { logger } from "../services/LoggerService";
import { friendlyError } from "../services/ErrorService";
import { getPlatform } from "../services/OfficeService";

function uid(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function useChat() {
  const store = useAppStore();
  const abortRef = useRef<AbortController | null>(null);

  const ensureConfigured = useCallback((): void => {
    const config = store.providerConfigs[store.activeProvider];
    if (!config.apiKey.trim() && config.id !== "ollama") {
      throw new Error("noApiKey");
    }
    if (!store.activeModel) {
      throw new Error("noModel");
    }
  }, [store.providerConfigs, store.activeProvider, store.activeModel]);

  const sendMessage = useCallback(
    async (content: string): Promise<void> => {
      try {
        ensureConfigured();
      } catch (error) {
        store.setError(
          friendlyError(error, { provider: store.activeProvider })
        );
        return;
      }

      const userMessage: ChatMessage = {
        id: uid(),
        role: "user",
        content,
        timestamp: Date.now(),
      };
      store.appendMessage(userMessage);
      store.setStreaming(true, "");
      store.setError(null);

      const config = store.providerConfigs[store.activeProvider];
      const provider = createProvider(config);
      const context = await getContext();
      const options = {
        model: store.activeModel,
        temperature: store.temperature,
        maxTokens: store.maxTokens,
        reasoning: store.reasoning,
        systemPrompt: store.systemPrompt || undefined,
      };

      const historyForProvider = [...store.messages];
      const controller = new AbortController();
      abortRef.current = controller;

      let full = "";
      try {
        await provider.chatStream(
          historyForProvider,
          options,
          (token) => {
            full += token;
            store.appendStreamToken(token);
          },
          context,
          controller.signal
        );
      } catch (error) {
        if (controller.signal.aborted) {
          full = store.streamingContent;
        } else {
          throw error;
        }
      } finally {
        abortRef.current = null;
      }

      try {
        const assistantMessage: ChatMessage = {
          id: uid(),
          role: "assistant",
          content: full || "(empty response)",
          timestamp: Date.now(),
        };
        const messages = [...useAppStore.getState().messages, assistantMessage];
        store.setMessages(messages);
        store.setStreaming(false);
        await store.persist();
        store.setHistory(await HistoryService.listChats());
      } catch (error) {
        logger.error("chat", "sendMessage failed", {
          error: error instanceof Error ? error.message : String(error),
        });
        store.setStreaming(false);
        store.setError(
          friendlyError(error, {
            provider: useAppStore.getState().activeProvider,
            onWeb: getPlatform() === "web",
          })
        );
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      store.providerConfigs,
      store.activeProvider,
      store.activeModel,
      store.temperature,
      store.maxTokens,
      store.reasoning,
      store.systemPrompt,
      store.messages,
    ]
  );

  const stopStreaming = useCallback((): void => {
    abortRef.current?.abort();
  }, []);

  const runQuickAction = useCallback(
    async (
      action: (promptFn: (text: string) => Promise<string>) => Promise<string>,
      label: string
    ): Promise<string | null> => {
      useAppStore
        .getState()
        .setPendingAction({ id: uid(), label, kind: "custom" });
      useAppStore.getState().setError(null);
      try {
        ensureConfigured();
        const config =
          useAppStore.getState().providerConfigs[
            useAppStore.getState().activeProvider
          ];
        const provider = createProvider(config);
        const options = {
          model: useAppStore.getState().activeModel,
          temperature: useAppStore.getState().temperature,
          maxTokens: useAppStore.getState().maxTokens,
          reasoning: useAppStore.getState().reasoning,
          systemPrompt: useAppStore.getState().systemPrompt || undefined,
        };
        const promptFn = (text: string) =>
          provider.chat(
            [{ id: uid(), role: "user", content: text, timestamp: Date.now() }],
            options
          );
        const result = await action(promptFn);
        const assistantMessage: ChatMessage = {
          id: uid(),
          role: "assistant",
          content: result,
          timestamp: Date.now(),
        };
        useAppStore.getState().appendMessage(assistantMessage);
        await useAppStore.getState().persist();
        useAppStore.getState().setHistory(await HistoryService.listChats());
        return result;
      } catch (error) {
        logger.error("chat", "quick action failed", {
          error: error instanceof Error ? error.message : String(error),
        });
        useAppStore.getState().setError(
          friendlyError(error, {
            provider: useAppStore.getState().activeProvider,
            onWeb: getPlatform() === "web",
          })
        );
        return null;
      } finally {
        useAppStore.getState().setPendingAction(null);
      }
    },
    [ensureConfigured]
  );

  const insertLastAnswer = useCallback(async (): Promise<boolean> => {
    const messages = useAppStore.getState().messages;
    const last = [...messages].reverse().find((m) => m.role === "assistant");
    if (!last) return false;
    try {
      await insertTextAtSelection(last.content);
      return true;
    } catch (error) {
      logger.error("chat", "insert into document failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }, []);

  const refreshModels = useCallback(async (): Promise<void> => {
    const state = useAppStore.getState();
    const config = state.providerConfigs[state.activeProvider];
    const models = await ModelService.listModels(config, true);
    const current = useAppStore.getState().activeModel;
    const stillValid = models.some((m) => m.id === current);
    if (!stillValid && models.length > 0) {
      useAppStore.getState().setActiveModel(models[0]!.id);
      await ModelService.setStoredActiveModel(
        state.activeProvider,
        models[0]!.id
      );
    }
  }, []);

  return {
    sendMessage,
    stopStreaming,
    runQuickAction,
    insertLastAnswer,
    refreshModels,
    isStreaming: store.isStreaming,
  };
}

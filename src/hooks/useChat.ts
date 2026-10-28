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

  const runStream = useCallback(
    async (history: ChatMessage[]): Promise<void> => {
      const state = useAppStore.getState();
      const config = state.providerConfigs[state.activeProvider];
      const provider = createProvider(config);
      const context = await getContext();
      const options = {
        model: state.activeModel,
        temperature: state.temperature,
        maxTokens: state.maxTokens,
        reasoning: state.reasoning,
        systemPrompt: state.systemPrompt || undefined,
      };
      const controller = new AbortController();
      abortRef.current = controller;
      let full = "";
      let failed = false;
      try {
        await provider.chatStream(
          history,
          options,
          (token) => {
            full += token;
            useAppStore.getState().appendStreamToken(token);
          },
          context,
          controller.signal
        );
      } catch (error) {
        if (controller.signal.aborted) {
          full = useAppStore.getState().streamingContent || full;
        } else {
          failed = true;
          logger.error("chat", "sendMessage failed", {
            error: error instanceof Error ? error.message : String(error),
          });
          useAppStore.getState().setStreaming(false);
          useAppStore.getState().setError(
            friendlyError(error, {
              provider: useAppStore.getState().activeProvider,
              onWeb: getPlatform() === "web",
            })
          );
        }
      } finally {
        abortRef.current = null;
      }
      if (failed) return;

      try {
        const assistantMessage: ChatMessage = {
          id: uid(),
          role: "assistant",
          content: full || "(empty response)",
          timestamp: Date.now(),
        };
        const messages = [...useAppStore.getState().messages, assistantMessage];
        useAppStore.getState().setMessages(messages);
        useAppStore.getState().setStreaming(false);
        await useAppStore.getState().persist();
        useAppStore.getState().setHistory(await HistoryService.listChats());
      } catch (error) {
        logger.error("chat", "sendMessage failed", {
          error: error instanceof Error ? error.message : String(error),
        });
        useAppStore.getState().setStreaming(false);
        useAppStore.getState().setError(
          friendlyError(error, {
            provider: useAppStore.getState().activeProvider,
            onWeb: getPlatform() === "web",
          })
        );
      }
    },
    []
  );

  const sendMessage = useCallback(
    async (content: string): Promise<void> => {
      const state = useAppStore.getState();
      try {
        const config = state.providerConfigs[state.activeProvider];
        if (!config.apiKey.trim() && config.id !== "ollama") {
          throw new Error("noApiKey");
        }
        if (!state.activeModel) throw new Error("noModel");
      } catch (error) {
        state.setError(
          friendlyError(error, {
            provider: useAppStore.getState().activeProvider,
          })
        );
        return;
      }

      const userMessage: ChatMessage = {
        id: uid(),
        role: "user",
        content,
        timestamp: Date.now(),
      };
      state.appendMessage(userMessage);
      state.setStreaming(true, "");
      state.setError(null);
      await runStream(useAppStore.getState().messages);
    },
    [runStream]
  );

  const regenerateLast = useCallback(async (): Promise<void> => {
    const state = useAppStore.getState();
    const messages = [...state.messages];
    if (messages[messages.length - 1]?.role === "assistant") {
      messages.pop();
    }
    if (!messages.some((message) => message.role === "user")) return;
    state.setMessages(messages);
    state.setStreaming(true, "");
    state.setError(null);
    await runStream(messages);
  }, [runStream]);

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
      useAppStore.getState().setError("errors.insertFailed");
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
    regenerateLast,
    runQuickAction,
    insertLastAnswer,
    refreshModels,
    isStreaming: store.isStreaming,
  };
}

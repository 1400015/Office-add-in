import { useCallback } from "react";
import { useAppStore } from "../store/useAppStore";
import { createProvider } from "../providers/ProviderFactory";
import {
  getContext,
  getPlatform,
  insertTextAtSelection,
} from "../services/OfficeService";
import { OperationService, type Operation } from "../services/OperationService";
import type { ChatMessage } from "../types";
import type { ActionContext } from "../services/ActionContext";
import { logger } from "../services/LoggerService";
import { friendlyError } from "../services/ErrorService";

function uid(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function configured(): void {
  const state = useAppStore.getState();
  if (!state.hydrated || state.vaultBusy) throw new Error("notReady");
  if (state.secretsLocked) throw new Error("locked");
  const config = state.providerConfigs[state.activeProvider];
  if (!config.apiKey.trim() && config.id !== "ollama")
    throw new Error("noApiKey");
  if (!state.activeModel) throw new Error("noModel");
}

function showError(error: unknown): void {
  const state = useAppStore.getState();
  logger.error("chat", "operation failed", {
    error: error instanceof Error ? error.message : String(error),
  });
  state.setError(
    friendlyError(error, {
      provider: state.activeProvider,
      onWeb: getPlatform() === "web",
    })
  );
}

function stillCurrent(operation: Operation): boolean {
  return OperationService.current() === operation && !operation.signal.aborted;
}

export function useChat() {
  const runStream = useCallback(
    async (history: ChatMessage[], operation: Operation): Promise<void> => {
      const state = useAppStore.getState();
      const providerId = state.activeProvider;
      const model = state.activeModel;
      const provider = createProvider(state.providerConfigs[providerId]);
      const options = {
        model,
        temperature: state.temperature,
        maxTokens: state.maxTokens,
        reasoning: state.reasoning,
        systemPrompt: state.systemPrompt || undefined,
      };
      let full = "";
      try {
        await state.saveConversation(
          history,
          providerId,
          model,
          operation.conversationId
        );
        operation.assertCurrent();
        const context = await getContext({
          signal: operation.signal,
          assertCurrent: () => operation.assertCurrent(),
          reportTruncation: () => {
            if (stillCurrent(operation))
              useAppStore.getState().setError("errors.contextTruncated");
          },
        });
        operation.assertCurrent();
        await provider.chatStream(
          history,
          options,
          (token) => {
            if (!stillCurrent(operation)) return;
            full += token;
            useAppStore.getState().appendStreamToken(token);
          },
          context,
          operation.signal
        );
        operation.assertCurrent();
        if (!full) throw new Error("empty-response");
        const answer: ChatMessage = {
          id: uid(),
          role: "assistant",
          content: full,
          timestamp: Date.now(),
        };
        const messages = [...useAppStore.getState().messages, answer];
        useAppStore.getState().setMessages(messages);
        // Keep the input disabled while the response is being saved, without
        // allowing Stop to append the completed response a second time.
        useAppStore.getState().setStreaming(true, "");
        await state.saveConversation(
          messages,
          providerId,
          model,
          operation.conversationId
        );
        operation.assertCurrent();
        useAppStore.getState().setStreaming(false);
      } catch (error) {
        if (stillCurrent(operation)) {
          useAppStore.getState().setStreaming(false);
          showError(error);
        }
      } finally {
        OperationService.finish(operation);
      }
    },
    []
  );

  const submitMessage = useCallback(
    (content: string): Promise<void> | null => {
      const state = useAppStore.getState();
      try {
        configured();
      } catch (error) {
        state.setError(
          friendlyError(error, { provider: state.activeProvider })
        );
        return null;
      }
      if (OperationService.current()) return null;
      const chatId = state.ensureChatId();
      const operation = OperationService.begin(
        chatId,
        state.activeProvider,
        state.activeModel
      );
      if (!operation) return null;
      const message: ChatMessage = {
        id: uid(),
        role: "user",
        content,
        timestamp: Date.now(),
      };
      state.appendMessage(message);
      state.setStreaming(true, "");
      state.setError(null);
      return runStream(useAppStore.getState().messages, operation);
    },
    [runStream]
  );

  const sendMessage = useCallback(
    async (content: string): Promise<void> => {
      await submitMessage(content);
    },
    [submitMessage]
  );

  const regenerateLast = useCallback(async (): Promise<void> => {
    const state = useAppStore.getState();
    try {
      configured();
    } catch (error) {
      showError(error);
      return;
    }
    if (OperationService.current()) return;
    const messages = [...state.messages];
    if (messages[messages.length - 1]?.role === "assistant") messages.pop();
    if (!messages.some((message) => message.role === "user")) return;
    const operation = OperationService.begin(
      state.ensureChatId(),
      state.activeProvider,
      state.activeModel
    );
    if (!operation) return;
    state.setMessages(messages);
    state.setStreaming(true, "");
    state.setError(null);
    await runStream(messages, operation);
  }, [runStream]);

  const stopStreaming = useCallback((): void => {
    const state = useAppStore.getState();
    const op = OperationService.current();
    if (!op) return;
    const partial = state.isStreaming ? state.streamingContent : "";
    OperationService.cancel();
    state.setStreaming(false);
    state.setPendingAction(null);
    if (
      partial &&
      state.currentChatId === op.conversationId &&
      !state.secretsLocked
    ) {
      const answer: ChatMessage = {
        id: uid(),
        role: "assistant",
        content: partial,
        timestamp: Date.now(),
      };
      const messages = [...state.messages, answer];
      state.setMessages(messages);
      void state
        .saveConversation(messages, op.provider, op.model, op.conversationId)
        .catch((error: unknown) => {
          const current = useAppStore.getState();
          if (
            current.currentChatId === op.conversationId &&
            current.messages === messages &&
            !current.secretsLocked &&
            !current.vaultBusy &&
            !OperationService.current()
          ) {
            showError(error);
          } else {
            logger.error("chat", "Failed to save stopped response", {
              error: error instanceof Error ? error.message : String(error),
            });
          }
        });
    }
  }, []);

  const runQuickAction = useCallback(
    async (
      action: (
        prompt: (text: string) => Promise<string>,
        context: ActionContext
      ) => Promise<string>,
      label: string
    ): Promise<string | null> => {
      const state = useAppStore.getState();
      try {
        configured();
      } catch (error) {
        showError(error);
        return null;
      }
      if (OperationService.current()) return null;
      const operation = OperationService.begin(
        state.ensureChatId(),
        state.activeProvider,
        state.activeModel
      );
      if (!operation) return null;
      const providerId = state.activeProvider;
      const model = state.activeModel;
      const provider = createProvider(state.providerConfigs[providerId]);
      const options = {
        model,
        temperature: state.temperature,
        maxTokens: state.maxTokens,
        reasoning: state.reasoning,
        systemPrompt: state.systemPrompt || undefined,
      };
      state.setPendingAction({ id: uid(), label, kind: "custom" });
      state.setError(null);
      try {
        const context: ActionContext = {
          signal: operation.signal,
          assertCurrent: () => operation.assertCurrent(),
          reportTruncation: () => {
            if (stillCurrent(operation))
              useAppStore.getState().setError("errors.contextTruncated");
          },
        };
        const result = await action(async (text) => {
          operation.assertCurrent();
          const response = await provider.chat(
            [{ id: uid(), role: "user", content: text, timestamp: Date.now() }],
            options,
            undefined,
            operation.signal
          );
          operation.assertCurrent();
          return response;
        }, context);
        operation.assertCurrent();
        const answer: ChatMessage = {
          id: uid(),
          role: "assistant",
          content: result,
          timestamp: Date.now(),
        };
        const messages = [...useAppStore.getState().messages, answer];
        useAppStore.getState().setMessages(messages);
        await state.saveConversation(
          messages,
          providerId,
          model,
          operation.conversationId
        );
        return result;
      } catch (error) {
        if (stillCurrent(operation)) {
          if (
            error instanceof Error &&
            error.name === "ActionConflictError" &&
            "result" in error &&
            typeof error.result === "string"
          ) {
            const answer: ChatMessage = {
              id: uid(),
              role: "assistant",
              content: error.result,
              timestamp: Date.now(),
            };
            const messages = [...useAppStore.getState().messages, answer];
            useAppStore.getState().setMessages(messages);
            useAppStore.getState().setError("errors.editConflict");
            try {
              await state.saveConversation(
                messages,
                providerId,
                model,
                operation.conversationId
              );
            } catch (saveError) {
              if (stillCurrent(operation)) {
                logger.error("chat", "Failed to save conflicting response", {
                  error:
                    saveError instanceof Error
                      ? saveError.message
                      : String(saveError),
                });
                useAppStore.getState().setError("errors.conflictSaveFailed");
              }
            }
          } else showError(error);
        }
        return null;
      } finally {
        if (stillCurrent(operation))
          useAppStore.getState().setPendingAction(null);
        OperationService.finish(operation);
      }
    },
    []
  );

  const insertLastAnswer = useCallback(async (): Promise<boolean> => {
    const last = [...useAppStore.getState().messages]
      .reverse()
      .find((m) => m.role === "assistant");
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

  return {
    sendMessage,
    submitMessage,
    stopStreaming,
    regenerateLast,
    runQuickAction,
    insertLastAnswer,
  };
}

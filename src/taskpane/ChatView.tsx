import type { JSX } from "react";
import { useEffect, useRef, useState } from "react";
import {
  Button,
  Textarea,
  MessageBar,
  MessageBarBody,
  MessageBarActions,
  Spinner,
} from "@fluentui/react-components";
import {
  Send20Regular,
  Stop20Regular,
  Dismiss20Regular,
} from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { useAppStore } from "../store/useAppStore";
import { useChat } from "../hooks/useChat";
import { ProviderSelectors } from "./components/ProviderSelectors";
import { QuickActions } from "./components/QuickActions";
import { MessageBubble } from "./components/MessageBubble";

export function ChatView(): JSX.Element {
  const { t } = useTranslation();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const messages = useAppStore((s) => s.messages);
  const isStreaming = useAppStore((s) => s.isStreaming);
  const pendingAction = useAppStore((s) => s.pendingAction);
  const secretsLocked = useAppStore((s) => s.secretsLocked);
  const hydrated = useAppStore((s) => s.hydrated);
  const vaultBusy = useAppStore((s) => s.vaultBusy);
  const activeModel = useAppStore((s) => s.activeModel);
  const busy = isStreaming || pendingAction !== null;
  const streamingContent = useAppStore((s) => s.streamingContent);
  const error = useAppStore((s) => s.error);
  const setError = useAppStore((s) => s.setError);
  const { submitMessage, stopStreaming, insertLastAnswer, regenerateLast } =
    useChat();

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, streamingContent]);

  const onSend = (): void => {
    const content = input.trim();
    if (
      !content ||
      busy ||
      secretsLocked ||
      !hydrated ||
      vaultBusy ||
      !activeModel
    )
      return;
    const request = submitMessage(content);
    if (request) {
      setInput("");
      void request;
    }
  };

  const lastAssistantIndex = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]!.role === "assistant") return i;
    }
    return -1;
  })();

  return (
    <>
      <div className="app-header">
        <ProviderSelectors />
      </div>

      <QuickActions />

      <div className="chat-scroll" ref={scrollRef}>
        {messages.length === 0 && !isStreaming && (
          <div className="empty-state">
            <div style={{ fontSize: 15, fontWeight: 600 }}>
              {t("chat.emptyTitle")}
            </div>
            <div style={{ fontSize: 12 }}>{t("chat.emptySubtitle")}</div>
          </div>
        )}

        {messages.map((message, index) => (
          <MessageBubble
            key={message.id}
            message={message}
            isLastAssistant={index === lastAssistantIndex}
            onInsert={() => void insertLastAnswer()}
            onRegenerate={
              index === lastAssistantIndex &&
              !busy &&
              !secretsLocked &&
              hydrated &&
              !vaultBusy
                ? () => void regenerateLast()
                : undefined
            }
          />
        ))}

        {isStreaming &&
          (streamingContent ||
            messages[messages.length - 1]?.role !== "assistant") && (
            <div className="message message-assistant">
              <div>{streamingContent || t("chat.thinking")}</div>
              {!streamingContent && <Spinner size="tiny" />}
            </div>
          )}

        {error && (
          <MessageBar intent="error">
            <MessageBarBody>
              {error === "noApiKey"
                ? t("errors.noApiKey")
                : error === "noModel"
                  ? t("errors.noModel")
                  : error.startsWith("errors.")
                    ? t(error)
                    : error}
            </MessageBarBody>
            <MessageBarActions>
              <Button
                appearance="transparent"
                size="small"
                icon={<Dismiss20Regular />}
                onClick={() => setError(null)}
              />
            </MessageBarActions>
          </MessageBar>
        )}
      </div>

      <div className="chat-input-area">
        <Textarea
          size="small"
          placeholder={t("chat.placeholder")}
          value={input}
          onChange={(_, data) => setInput(data.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          disabled={busy || secretsLocked || !hydrated || vaultBusy}
          rows={2}
        />
        {busy ? (
          <Button
            appearance="primary"
            icon={<Stop20Regular />}
            onClick={stopStreaming}
          >
            {t("chat.stop")}
          </Button>
        ) : (
          <Button
            appearance="primary"
            icon={<Send20Regular />}
            onClick={onSend}
            disabled={
              !input.trim() ||
              secretsLocked ||
              !hydrated ||
              vaultBusy ||
              !activeModel
            }
          >
            {t("chat.send")}
          </Button>
        )}
      </div>
    </>
  );
}

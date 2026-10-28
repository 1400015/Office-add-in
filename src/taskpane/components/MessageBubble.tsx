import { useState } from "react";
import { Button, Tooltip } from "@fluentui/react-components";
import {
  ArrowClockwise20Regular,
  ArrowDownload20Regular,
  Checkmark20Regular,
  Copy20Regular,
} from "@fluentui/react-icons";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useTranslation } from "react-i18next";
import { useAppStore } from "../../store/useAppStore";
import type { ChatMessage } from "../../types";

interface Props {
  message: ChatMessage;
  isLastAssistant: boolean;
  onInsert: () => void;
  onRegenerate?: () => void;
}

export function MessageBubble({
  message,
  isLastAssistant,
  onInsert,
  onRegenerate,
}: Props): JSX.Element {
  const { t } = useTranslation();
  const host = useAppStore((s) => s.host);
  const [copied, setCopied] = useState(false);
  const insertLabel =
    host === "powerpoint"
      ? t("chat.insertIntoSlide")
      : host === "excel"
        ? t("chat.insertIntoCell")
        : t("chat.insertIntoDocument");

  const onCopy = async (): Promise<void> => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className={`message message-${message.role}`}>
      {message.role === "assistant" ? (
        <div className="message-markdown">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {message.content}
          </ReactMarkdown>
        </div>
      ) : (
        <div>{message.content}</div>
      )}
      {message.role === "assistant" && (
        <div className="message-actions">
          <Tooltip
            content={copied ? t("chat.copied") : t("chat.copy")}
            relationship="label"
          >
            <Button
              size="small"
              appearance="transparent"
              icon={copied ? <Checkmark20Regular /> : <Copy20Regular />}
              onClick={() => void onCopy()}
            />
          </Tooltip>
          {isLastAssistant && onRegenerate && (
            <Tooltip content={t("chat.regenerate")} relationship="label">
              <Button
                size="small"
                appearance="transparent"
                icon={<ArrowClockwise20Regular />}
                aria-label={t("chat.regenerate")}
                onClick={onRegenerate}
              />
            </Tooltip>
          )}
          {isLastAssistant && (
            <Tooltip content={insertLabel} relationship="label">
              <Button
                size="small"
                appearance="transparent"
                icon={<ArrowDownload20Regular />}
                onClick={onInsert}
              />
            </Tooltip>
          )}
        </div>
      )}
    </div>
  );
}

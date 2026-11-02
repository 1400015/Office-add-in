import type { JSX } from "react";
import { Suspense, lazy, useState } from "react";
import { Button, Tooltip } from "@fluentui/react-components";
import {
  ArrowClockwise20Regular,
  ArrowDownload20Regular,
  Checkmark20Regular,
  Copy20Regular,
} from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { useAppStore } from "../../store/useAppStore";
import type { ChatMessage } from "../../types";

// react-markdown + remark-gfm are heavy (~60-80 kB min). Load them lazily so
// the initial taskpane chunk stays small; the markdown chunk only downloads
// when the first assistant message is rendered.
const ReactMarkdown = lazy(async () => {
  const [{ default: Markdown }, { default: remarkGfm }] = await Promise.all([
    import("react-markdown"),
    import("remark-gfm"),
  ]);
  const MarkdownWithGfm = (props: { children: string }): JSX.Element => (
    <Markdown remarkPlugins={[remarkGfm]}>{props.children}</Markdown>
  );
  return { default: MarkdownWithGfm };
});

interface Props {
  message: ChatMessage;
  isLastAssistant: boolean;
  onInsert: () => void;
  insertDisabled?: boolean;
  onRegenerate?: () => void;
}

export function MessageBubble({
  message,
  isLastAssistant,
  onInsert,
  insertDisabled = false,
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
    try {
      await navigator.clipboard?.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard permission can be denied inside the Office WebView.
    }
  };

  return (
    <div className={`message message-${message.role}`}>
      {message.role === "assistant" ? (
        <div className="message-markdown">
          <Suspense
            fallback={
              <div className="message-markdown-plain">{message.content}</div>
            }
          >
            <ReactMarkdown>{message.content}</ReactMarkdown>
          </Suspense>
        </div>
      ) : (
        <div>{message.content}</div>
      )}
      {message.incomplete && (
        <div className="warning-banner" role="status">
          {t("chat.incomplete")}
        </div>
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
                disabled={insertDisabled}
                aria-label={insertLabel}
                onClick={onInsert}
              />
            </Tooltip>
          )}
        </div>
      )}
    </div>
  );
}

import { useState } from "react";
import { Button, Tooltip } from "@fluentui/react-components";
import {
  Copy20Regular,
  Checkmark20Regular,
  ArrowDownload20Regular,
} from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import type { ChatMessage } from "../../types";

interface Props {
  message: ChatMessage;
  isLastAssistant: boolean;
  onInsert: () => void;
}

export function MessageBubble({
  message,
  isLastAssistant,
  onInsert,
}: Props): JSX.Element {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const onCopy = async (): Promise<void> => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className={`message message-${message.role}`}>
      <div>{message.content}</div>
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
          {isLastAssistant && (
            <Tooltip
              content={t("chat.insertIntoDocument")}
              relationship="label"
            >
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

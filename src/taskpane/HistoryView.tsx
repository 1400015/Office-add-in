import { Button, Text } from "@fluentui/react-components";
import { Delete20Regular, DocumentText20Regular } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { useAppStore } from "../store/useAppStore";
import { HistoryService } from "../services/HistoryService";
import { PROVIDER_DEFINITIONS } from "../config/providers";

export function HistoryView(): JSX.Element {
  const { t } = useTranslation();
  const history = useAppStore((s) => s.history);
  const setHistory = useAppStore((s) => s.setHistory);
  const loadChat = useAppStore((s) => s.loadChat);
  const currentChatId = useAppStore((s) => s.currentChatId);

  const onDelete = async (id: string): Promise<void> => {
    await HistoryService.deleteChat(id);
    setHistory(await HistoryService.listChats());
  };

  const onClearAll = async (): Promise<void> => {
    await HistoryService.clear();
    setHistory([]);
  };

  if (history.length === 0) {
    return (
      <div className="history-list">
        <div className="warning-banner">{t("history.privacy")}</div>
        <div className="empty-state">
          <Text>{t("history.empty")}</Text>
        </div>
      </div>
    );
  }

  return (
    <div className="history-list">
      <div className="warning-banner">{t("history.privacy")}</div>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Button
          size="small"
          appearance="subtle"
          onClick={() => void onClearAll()}
        >
          {t("history.clearAll")}
        </Button>
      </div>
      {history.map((chat) => (
        <div
          key={chat.id}
          className="history-item"
          style={
            chat.id === currentChatId
              ? { borderColor: "var(--colorBrandStroke1, #0f6cbd)" }
              : undefined
          }
        >
          <div
            style={{ flex: 1, minWidth: 0, cursor: "pointer" }}
            onClick={() => loadChat(chat.id)}
          >
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <DocumentText20Regular />
              <Text truncate style={{ fontWeight: 600 }}>
                {chat.title}
              </Text>
            </div>
            <Text size={200}>
              {new Date(chat.timestamp).toLocaleString()} ·{" "}
              {PROVIDER_DEFINITIONS[chat.provider].name} · {chat.model} ·{" "}
              {chat.messages.length} msgs
            </Text>
          </div>
          <Button
            size="small"
            appearance="transparent"
            icon={<Delete20Regular />}
            onClick={() => void onDelete(chat.id)}
          />
        </div>
      ))}
    </div>
  );
}

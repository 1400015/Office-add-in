import type { JSX } from "react";
import { useState } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  MessageBar,
  MessageBarBody,
  Spinner,
  Text,
} from "@fluentui/react-components";
import { Delete20Regular, DocumentText20Regular } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { useAppStore } from "../store/useAppStore";
import { LOCKED_HISTORY_TITLE } from "../services/HistoryService";
import { PROVIDER_DEFINITIONS } from "../config/providers";

export function HistoryView(): JSX.Element {
  const { t } = useTranslation();
  const history = useAppStore((s) => s.history);
  const deleteConversation = useAppStore((s) => s.deleteConversation);
  const clearHistory = useAppStore((s) => s.clearHistory);
  const loadChat = useAppStore((s) => s.loadChat);
  const currentChatId = useAppStore((s) => s.currentChatId);
  const historyBusy = useAppStore((s) => s.historyBusy);
  const vaultBusy = useAppStore((s) => s.vaultBusy);
  const hydrated = useAppStore((s) => s.hydrated);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const disabled = historyBusy || vaultBusy || !hydrated;

  const onDelete = async (id: string): Promise<void> => {
    const state = useAppStore.getState();
    if (state.historyBusy || state.vaultBusy || !state.hydrated) return;
    setError(null);
    try {
      await deleteConversation(id);
    } catch {
      setError("errors.historyDeleteFailed");
    }
  };

  const onClearAll = async (): Promise<void> => {
    const state = useAppStore.getState();
    if (state.historyBusy || state.vaultBusy || !state.hydrated) return;
    setError(null);
    try {
      await clearHistory();
      setConfirmOpen(false);
    } catch {
      setError("errors.historyClearFailed");
      setConfirmOpen(false);
    }
  };

  return (
    <div className="history-list">
      <div className="warning-banner">{t("history.privacy")}</div>
      {error && (
        <MessageBar intent="error">
          <MessageBarBody>{t(error)}</MessageBarBody>
        </MessageBar>
      )}
      {historyBusy && <Spinner size="tiny" label={t("common.loading")} />}
      {history.length === 0 ? (
        <div className="empty-state">
          <Text>{t("history.empty")}</Text>
        </div>
      ) : (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <Button
            size="small"
            appearance="subtle"
            disabled={disabled}
            onClick={() => setConfirmOpen(true)}
          >
            {t("history.clearAll")}
          </Button>
        </div>
      )}
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
            onClick={() => {
              if (!disabled && chat.title !== LOCKED_HISTORY_TITLE)
                loadChat(chat.id);
            }}
          >
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <DocumentText20Regular />
              <Text truncate style={{ fontWeight: 600 }}>
                {chat.title === LOCKED_HISTORY_TITLE
                  ? t("history.locked")
                  : chat.title}
              </Text>
            </div>
            <Text size={200}>
              {new Date(chat.timestamp).toLocaleString()} ·{" "}
              {PROVIDER_DEFINITIONS[chat.provider].name} · {chat.model} ·{" "}
              {t("history.messageCount", { count: chat.messages.length })}
            </Text>
          </div>
          <Button
            size="small"
            appearance="transparent"
            icon={<Delete20Regular />}
            aria-label={t("history.delete")}
            disabled={disabled}
            onClick={() => void onDelete(chat.id)}
          />
        </div>
      ))}

      <Dialog
        open={confirmOpen}
        onOpenChange={(_, data) => {
          if (!data.open && !historyBusy) setConfirmOpen(false);
        }}
      >
        <DialogSurface>
          <DialogBody>
            <DialogTitle>{t("history.clearConfirmTitle")}</DialogTitle>
            <DialogContent>{t("history.clearConfirmBody")}</DialogContent>
            <DialogActions>
              <Button
                appearance="secondary"
                disabled={disabled}
                onClick={() => setConfirmOpen(false)}
              >
                {t("common.cancel")}
              </Button>
              <Button
                appearance="primary"
                disabled={disabled}
                onClick={() => void onClearAll()}
              >
                {t("history.clearConfirm")}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}

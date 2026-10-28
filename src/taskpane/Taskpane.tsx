import { Suspense, lazy, useEffect } from "react";
import { Tab, TabList, Button, Spinner } from "@fluentui/react-components";
import {
  Chat20Regular,
  Settings20Regular,
  History20Regular,
  Library20Regular,
  Add20Regular,
} from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { ChatView } from "./ChatView";

const SettingsView = lazy(() =>
  import("./SettingsView").then((m) => ({ default: m.SettingsView }))
);
const HistoryView = lazy(() =>
  import("./HistoryView").then((m) => ({ default: m.HistoryView }))
);
const TemplatesView = lazy(() =>
  import("./TemplatesView").then((m) => ({ default: m.TemplatesView }))
);
import { useAppStore } from "../store/useAppStore";
import { useChat } from "../hooks/useChat";
import { useOfficeInit } from "../hooks/useOfficeInit";
import { useRibbonCommands } from "../hooks/useRibbonCommands";
import type { AppView } from "../types";

export function Taskpane(): JSX.Element {
  const { t, i18n } = useTranslation();
  const view = useAppStore((s) => s.view);
  const setView = useAppStore((s) => s.setView);
  const startNewChat = useAppStore((s) => s.startNewChat);
  const { stopStreaming } = useChat();
  const language = useAppStore((s) => s.language);

  useOfficeInit();
  useRibbonCommands();

  useEffect(() => {
    if (language && i18n.language !== language) {
      void i18n.changeLanguage(language);
    }
  }, [language, i18n]);

  const onNewChat = (): void => {
    // Abort first: a streaming answer must not land in the new conversation.
    stopStreaming();
    startNewChat();
    setView("chat");
  };

  return (
    <div className="app">
      <div
        className="app-header"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <TabList
          size="small"
          selectedValue={view}
          onTabSelect={(_, data) => setView(data.value as AppView)}
        >
          <Tab value="chat" icon={<Chat20Regular />}>
            {t("app.chat")}
          </Tab>
          <Tab value="templates" icon={<Library20Regular />}>
            {t("app.templates")}
          </Tab>
          <Tab value="history" icon={<History20Regular />}>
            {t("app.history")}
          </Tab>
          <Tab value="settings" icon={<Settings20Regular />}>
            {t("app.settings")}
          </Tab>
        </TabList>
        {view === "chat" && (
          <Button
            size="small"
            appearance="subtle"
            icon={<Add20Regular />}
            onClick={onNewChat}
          >
            {t("chat.newChat")}
          </Button>
        )}
      </div>

      <div className="app-body">
        {view === "chat" && <ChatView />}
        {view === "templates" && (
          <Suspense fallback={<Spinner />}>
            <TemplatesView />
          </Suspense>
        )}
        {view === "history" && (
          <Suspense fallback={<Spinner />}>
            <HistoryView />
          </Suspense>
        )}
        {view === "settings" && (
          <Suspense fallback={<Spinner />}>
            <SettingsView />
          </Suspense>
        )}
      </div>
    </div>
  );
}

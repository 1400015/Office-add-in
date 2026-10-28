import { useEffect, useState } from "react";
import { Tab, TabList, Button } from "@fluentui/react-components";
import {
  Chat20Regular,
  Settings20Regular,
  History20Regular,
  Library20Regular,
  Add20Regular,
} from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { ChatView } from "./ChatView";
import { SettingsView } from "./SettingsView";
import { HistoryView } from "./HistoryView";
import { TemplatesView } from "./TemplatesView";
import { useAppStore } from "../store/useAppStore";
import { useOfficeInit } from "../hooks/useOfficeInit";

type View = "chat" | "settings" | "history" | "templates";

export function Taskpane(): JSX.Element {
  const { t, i18n } = useTranslation();
  const [view, setView] = useState<View>("chat");
  const startNewChat = useAppStore((s) => s.startNewChat);
  const language = useAppStore((s) => s.language);

  useOfficeInit();

  useEffect(() => {
    if (language && i18n.language !== language) {
      void i18n.changeLanguage(language);
    }
  }, [language, i18n]);

  const onNewChat = (): void => {
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
          onTabSelect={(_, data) => setView(data.value as View)}
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
        {view === "templates" && <TemplatesView />}
        {view === "history" && <HistoryView />}
        {view === "settings" && <SettingsView />}
      </div>
    </div>
  );
}

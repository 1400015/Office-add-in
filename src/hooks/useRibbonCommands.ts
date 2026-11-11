import { useEffect } from "react";
import { useAppStore } from "../store/useAppStore";
import { useChat } from "./useChat";
import {
  contentLanguageName,
  defaultTranslateLanguageCode,
} from "../powerpoint/slidePlan";
import * as wordActions from "../word/wordActions";
import * as excelActions from "../excel/excelActions";
import * as powerpointActions from "../powerpoint/powerpointActions";
import type { ActionContext } from "../services/ActionContext";
import type { OfficeHost } from "../types";

type PromptFn = (text: string) => Promise<string>;

function actionFor(
  command: string,
  host: OfficeHost,
  language: string
): ((prompt: PromptFn, action: ActionContext) => Promise<string>) | null {
  if (command === "Summarize") {
    if (host === "word")
      return (p, action) => wordActions.summarizeDocument(p, action);
    if (host === "excel")
      return (p, action) => excelActions.analyseTable(p, action);
    if (host === "powerpoint") {
      return (p, action) => powerpointActions.summarizePresentation(p, action);
    }
  }
  if (command === "Translate") {
    if (host === "word") {
      return (p, action) => wordActions.translateSelection(language, p, action);
    }
    if (host === "excel")
      return (p, action) => excelActions.translateRange(language, p, action);
    if (host === "powerpoint") {
      return (p, action) =>
        powerpointActions.translateSlide(language, p, action);
    }
  }
  if (command === "Analyse") {
    if (host === "word")
      return (p, action) => wordActions.explainSelection(p, action);
    if (host === "excel")
      return (p, action) => excelActions.analyseTable(p, action);
    if (host === "powerpoint") return (p) => powerpointActions.explainSlide(p);
  }
  return null;
}

export function useRibbonCommands(): void {
  const host = useAppStore((s) => s.host);
  const language = useAppStore((s) => s.language);
  const { runQuickAction } = useChat();

  useEffect(() => {
    if (host === "unknown") return;

    const run = (command: string): void => {
      window.__ouaiCommand = undefined;
      const target = contentLanguageName(
        defaultTranslateLanguageCode(language || "en")
      );
      const action = actionFor(command, host, target);
      if (!action) return;
      void runQuickAction(action, command);
    };

    const onCommand = (event: Event): void => {
      const detail = (event as CustomEvent<string>).detail;
      if (detail) run(detail);
    };

    window.addEventListener("ouai:command", onCommand);
    if (window.__ouaiCommand) run(window.__ouaiCommand);
    return () => window.removeEventListener("ouai:command", onCommand);
  }, [host, language, runQuickAction]);
}

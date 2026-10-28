import { useEffect } from "react";
import { useAppStore } from "../store/useAppStore";
import { useChat } from "./useChat";
import { contentLanguageName } from "../powerpoint/slidePlan";
import * as wordActions from "../word/wordActions";
import * as excelActions from "../excel/excelActions";
import * as powerpointActions from "../powerpoint/powerpointActions";
import type { OfficeHost } from "../types";

type PromptFn = (text: string) => Promise<string>;

function actionFor(
  command: string,
  host: OfficeHost,
  language: string
): ((prompt: PromptFn) => Promise<string>) | null {
  if (command === "Summarize") {
    if (host === "word") return (p) => wordActions.summarizeDocument(p);
    if (host === "excel") return (p) => excelActions.analyseTable(p);
    if (host === "powerpoint") {
      return (p) => powerpointActions.summarizePresentation(p);
    }
  }
  if (command === "Translate") {
    if (host === "word") {
      return (p) => wordActions.translateSelection(language, p);
    }
    if (host === "excel")
      return (p) => excelActions.translateRange(language, p);
    if (host === "powerpoint") {
      return (p) => powerpointActions.translateSlide(language, p);
    }
  }
  if (command === "Analyse") {
    if (host === "word") return (p) => wordActions.explainSelection(p);
    if (host === "excel") return (p) => excelActions.analyseTable(p);
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
      const target = contentLanguageName(language || "en");
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

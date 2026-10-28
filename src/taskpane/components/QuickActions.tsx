import { Button, Spinner } from "@fluentui/react-components";
import { useTranslation } from "react-i18next";
import { useAppStore } from "../../store/useAppStore";
import { useChat } from "../../hooks/useChat";
import * as wordActions from "../../word/wordActions";
import * as excelActions from "../../excel/excelActions";
import * as powerpointActions from "../../powerpoint/powerpointActions";

type PromptFn = (text: string) => Promise<string>;

interface ActionDef {
  key: string;
  label: string;
  run: (prompt: PromptFn) => Promise<string>;
}

export function QuickActions(): JSX.Element {
  const { t } = useTranslation();
  const host = useAppStore((s) => s.host);
  const pendingAction = useAppStore((s) => s.pendingAction);
  const { runQuickAction } = useChat();

  const actions: ActionDef[] = (() => {
    switch (host) {
      case "word":
        return [
          {
            key: "summarize",
            label: t("quickActions.word.summarize"),
            run: (p) => wordActions.summarizeDocument(p),
          },
          {
            key: "explain",
            label: t("quickActions.word.explain"),
            run: (p) => wordActions.explainSelection(p),
          },
          {
            key: "rewrite",
            label: t("quickActions.word.rewrite"),
            run: (p) => wordActions.rewriteSelection(p),
          },
          {
            key: "fixGrammar",
            label: t("quickActions.word.fixGrammar"),
            run: (p) => wordActions.fixGrammar(p),
          },
        ];
      case "excel":
        return [
          {
            key: "explainFormula",
            label: t("quickActions.excel.explainFormula"),
            run: (p) => excelActions.explainFormula(p),
          },
          {
            key: "analyseTable",
            label: t("quickActions.excel.analyseTable"),
            run: (p) => excelActions.analyseTable(p),
          },
        ];
      case "powerpoint":
        return [
          {
            key: "improveSlide",
            label: t("quickActions.powerpoint.improveSlide"),
            run: (p) => powerpointActions.improveSlide(p),
          },
          {
            key: "speakerNotes",
            label: t("quickActions.powerpoint.speakerNotes"),
            run: (p) => powerpointActions.generateSpeakerNotes(p),
          },
          {
            key: "summarizePresentation",
            label: t("quickActions.powerpoint.summarizePresentation"),
            run: (p) => powerpointActions.summarizePresentation(p),
          },
        ];
      default:
        return [];
    }
  })();

  if (actions.length === 0) return <></>;

  return (
    <div className="quick-actions">
      {actions.map((action) => {
        const busy =
          pendingAction !== null && pendingAction.label === action.label;
        return (
          <Button
            key={action.key}
            size="small"
            appearance="outline"
            disabled={pendingAction !== null}
            onClick={() => void runQuickAction(action.run, action.label)}
          >
            {busy ? <Spinner size="tiny" /> : action.label}
          </Button>
        );
      })}
    </div>
  );
}

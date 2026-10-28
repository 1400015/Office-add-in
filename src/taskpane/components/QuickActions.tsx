import { useState } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Dropdown,
  Field,
  Input,
  Option,
  Spinner,
} from "@fluentui/react-components";
import { useTranslation } from "react-i18next";
import { useAppStore } from "../../store/useAppStore";
import { useChat } from "../../hooks/useChat";
import * as wordActions from "../../word/wordActions";
import * as excelActions from "../../excel/excelActions";
import * as powerpointActions from "../../powerpoint/powerpointActions";
import {
  clampSlideCount,
  contentLanguageName,
} from "../../powerpoint/slidePlan";

type PromptFn = (text: string) => Promise<string>;

interface ActionDef {
  key: string;
  label: string;
  run: (prompt: PromptFn) => Promise<string>;
}

const TARGET_LANGUAGES = ["pt", "en", "es", "fr", "de"] as const;

export function QuickActions(): JSX.Element {
  const { t, i18n } = useTranslation();
  const host = useAppStore((s) => s.host);
  const pendingAction = useAppStore((s) => s.pendingAction);
  const { runQuickAction } = useChat();
  const [dialog, setDialog] = useState<"create" | "translate" | null>(null);
  const [topic, setTopic] = useState("");
  const [slideCount, setSlideCount] = useState("6");
  const [targetLang, setTargetLang] = useState(
    i18n.language.toLowerCase().startsWith("pt") ? "en" : "pt"
  );

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
            key: "fixGrammar",
            label: t("quickActions.powerpoint.fixGrammar"),
            run: (p) => powerpointActions.fixSlideGrammar(p),
          },
          {
            key: "explain",
            label: t("quickActions.powerpoint.explain"),
            run: (p) => powerpointActions.explainSlide(p),
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

  const closeDialog = (): void => setDialog(null);

  const submitCreate = (): void => {
    const count = clampSlideCount(Number(slideCount));
    const label = t("quickActions.powerpoint.createPresentation");
    const language = contentLanguageName(i18n.language);
    closeDialog();
    void runQuickAction(
      (p) =>
        powerpointActions.createPresentation(
          { topic, slideCount: count, language },
          p
        ),
      label
    );
  };

  const submitTranslate = (): void => {
    const label = t("quickActions.powerpoint.translate");
    const language = contentLanguageName(targetLang);
    closeDialog();
    void runQuickAction(
      (p) => powerpointActions.translateSlide(language, p),
      label
    );
  };

  if (host !== "powerpoint" && actions.length === 0) return <></>;

  return (
    <>
      <div className="quick-actions">
        {host === "powerpoint" && (
          <Button
            size="small"
            appearance="outline"
            disabled={pendingAction !== null}
            onClick={() => setDialog("create")}
          >
            {t("quickActions.powerpoint.createPresentation")}
          </Button>
        )}
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
        {host === "powerpoint" && (
          <Button
            size="small"
            appearance="outline"
            disabled={pendingAction !== null}
            onClick={() => setDialog("translate")}
          >
            {t("quickActions.powerpoint.translate")}
          </Button>
        )}
      </div>

      <Dialog
        open={dialog === "create"}
        onOpenChange={(_, data) => {
          if (!data.open) closeDialog();
        }}
      >
        <DialogSurface>
          <DialogBody>
            <DialogTitle>{t("dialogs.createTitle")}</DialogTitle>
            <DialogContent>
              <div className="dialog-fields">
                <Field label={t("dialogs.topic")} required>
                  <Input
                    value={topic}
                    placeholder={t("dialogs.topicPlaceholder")}
                    onChange={(_, data) => setTopic(data.value)}
                  />
                </Field>
                <Field label={t("dialogs.slideCount")}>
                  <Input
                    type="number"
                    min={1}
                    max={15}
                    value={slideCount}
                    onChange={(_, data) => setSlideCount(data.value)}
                  />
                </Field>
              </div>
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={closeDialog}>
                {t("common.cancel")}
              </Button>
              <Button
                appearance="primary"
                disabled={!topic.trim() || pendingAction !== null}
                onClick={submitCreate}
              >
                {t("dialogs.create")}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <Dialog
        open={dialog === "translate"}
        onOpenChange={(_, data) => {
          if (!data.open) closeDialog();
        }}
      >
        <DialogSurface>
          <DialogBody>
            <DialogTitle>{t("dialogs.translateTitle")}</DialogTitle>
            <DialogContent>
              <Field label={t("dialogs.targetLanguage")}>
                <Dropdown
                  value={t(`languages.${targetLang}`)}
                  selectedOptions={[targetLang]}
                  onOptionSelect={(_, data) => {
                    if (data.optionValue) setTargetLang(data.optionValue);
                  }}
                >
                  {TARGET_LANGUAGES.map((code) => (
                    <Option key={code} value={code}>
                      {t(`languages.${code}`)}
                    </Option>
                  ))}
                </Dropdown>
              </Field>
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={closeDialog}>
                {t("common.cancel")}
              </Button>
              <Button
                appearance="primary"
                disabled={pendingAction !== null}
                onClick={submitTranslate}
              >
                {t("dialogs.translate")}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </>
  );
}

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
  Textarea,
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
  defaultTranslateLanguageCode,
} from "../../powerpoint/slidePlan";

type PromptFn = (text: string) => Promise<string>;

interface ActionDef {
  key: string;
  label: string;
  run: (prompt: PromptFn) => Promise<string>;
}

/** Codes offered by the translate dialog, in UI order. */
export const TARGET_LANGUAGES = ["pt", "en", "es", "fr", "de"] as const;

/** Codes offered by the translate dialog, in UI order. */
export type TargetLanguage = (typeof TARGET_LANGUAGES)[number];

/** Fluent UI dropdowns report the option as a possibly-undefined string. */
export function isTargetLanguage(
  value: string | undefined
): value is TargetLanguage {
  return (
    typeof value === "string" &&
    (TARGET_LANGUAGES as readonly string[]).includes(value)
  );
}

type DialogKind = "create" | "translate" | "instruction" | null;
type InstructionKind =
  "word-generate" | "excel-formula" | "excel-vba" | "excel-script";

export function QuickActions(): JSX.Element {
  const { t, i18n } = useTranslation();
  const host = useAppStore((s) => s.host);
  const pendingAction = useAppStore((s) => s.pendingAction);
  const { runQuickAction } = useChat();
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [topic, setTopic] = useState("");
  const [slideCount, setSlideCount] = useState("6");
  const [instruction, setInstruction] = useState("");
  const [instructionKind, setInstructionKind] =
    useState<InstructionKind>("word-generate");
  const [targetLang, setTargetLang] = useState<TargetLanguage>(
    defaultTranslateLanguageCode(i18n.language)
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
    const language = contentLanguageName(targetLang);
    const label =
      host === "word"
        ? t("quickActions.word.translate")
        : t("quickActions.powerpoint.translate");
    closeDialog();
    if (host === "word") {
      void runQuickAction(
        (p) => wordActions.translateSelection(language, p),
        label
      );
      return;
    }
    void runQuickAction(
      (p) => powerpointActions.translateSlide(language, p),
      label
    );
  };

  const openInstruction = (kind: InstructionKind): void => {
    setInstructionKind(kind);
    setInstruction("");
    setDialog("instruction");
  };

  const submitInstruction = (): void => {
    const text = instruction.trim();
    if (!text) return;
    closeDialog();
    if (instructionKind === "word-generate") {
      void runQuickAction(
        (p) => wordActions.generateAndInsert(text, p),
        t("quickActions.word.generate")
      );
      return;
    }
    if (instructionKind === "excel-formula") {
      void runQuickAction(
        (p) => excelActions.generateFormula(text, p),
        t("quickActions.excel.generateFormula")
      );
      return;
    }
    if (instructionKind === "excel-vba") {
      void runQuickAction(
        (p) => excelActions.generateVba(text, p),
        t("quickActions.excel.generateVba")
      );
      return;
    }
    void runQuickAction(
      (p) => excelActions.generateOfficeScript(text, p),
      t("quickActions.excel.generateScript")
    );
  };

  const instructionTitle = {
    "word-generate": t("dialogs.generateTitle"),
    "excel-formula": t("dialogs.formulaTitle"),
    "excel-vba": t("dialogs.vbaTitle"),
    "excel-script": t("dialogs.scriptTitle"),
  }[instructionKind];

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
        {host === "word" && (
          <>
            <Button
              size="small"
              appearance="outline"
              disabled={pendingAction !== null}
              onClick={() => setDialog("translate")}
            >
              {t("quickActions.word.translate")}
            </Button>
            <Button
              size="small"
              appearance="outline"
              disabled={pendingAction !== null}
              onClick={() => openInstruction("word-generate")}
            >
              {t("quickActions.word.generate")}
            </Button>
          </>
        )}
        {host === "excel" && (
          <>
            <Button
              size="small"
              appearance="outline"
              disabled={pendingAction !== null}
              onClick={() => openInstruction("excel-formula")}
            >
              {t("quickActions.excel.generateFormula")}
            </Button>
            <Button
              size="small"
              appearance="outline"
              disabled={pendingAction !== null}
              onClick={() => openInstruction("excel-vba")}
            >
              {t("quickActions.excel.generateVba")}
            </Button>
            <Button
              size="small"
              appearance="outline"
              disabled={pendingAction !== null}
              onClick={() => openInstruction("excel-script")}
            >
              {t("quickActions.excel.generateScript")}
            </Button>
          </>
        )}
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
                    if (isTargetLanguage(data.optionValue)) {
                      setTargetLang(data.optionValue);
                    }
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

      <Dialog
        open={dialog === "instruction"}
        onOpenChange={(_, data) => {
          if (!data.open) closeDialog();
        }}
      >
        <DialogSurface>
          <DialogBody>
            <DialogTitle>{instructionTitle}</DialogTitle>
            <DialogContent>
              <Field label={t("dialogs.instruction")} required>
                <Textarea
                  value={instruction}
                  placeholder={t("dialogs.instructionPlaceholder")}
                  onChange={(_, data) => setInstruction(data.value)}
                  rows={4}
                />
              </Field>
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={closeDialog}>
                {t("common.cancel")}
              </Button>
              <Button
                appearance="primary"
                disabled={!instruction.trim() || pendingAction !== null}
                onClick={submitInstruction}
              >
                {t("dialogs.generate")}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </>
  );
}

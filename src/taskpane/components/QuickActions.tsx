import type { JSX } from "react";
import { useState } from "react";
import { Button, Spinner } from "@fluentui/react-components";
import { useTranslation } from "react-i18next";
import { useAppStore } from "../../store/useAppStore";
import { useChat } from "../../hooks/useChat";
import * as wordActions from "../../word/wordActions";
import * as powerpointActions from "../../powerpoint/powerpointActions";
import {
  clampSlideCount,
  contentLanguageName,
  defaultTranslateLanguageCode,
} from "../../powerpoint/slidePlan";
import {
  buildInstructionAction,
  buildQuickActions,
  instructionTitleKey,
  type DialogKind,
  type InstructionKind,
} from "./quickActions/actions";
import { type TargetLanguage } from "./quickActions/languages";
import {
  CreatePresentationDialog,
  InstructionDialog,
  TranslateDialog,
} from "./quickActions/dialogs";

export { TARGET_LANGUAGES, isTargetLanguage } from "./quickActions/languages";
export type { TargetLanguage } from "./quickActions/languages";

export function QuickActions(): JSX.Element {
  const { t, i18n } = useTranslation();
  const host = useAppStore((s) => s.host);
  const pendingAction = useAppStore((s) => s.pendingAction);
  const isStreaming = useAppStore((s) => s.isStreaming);
  const secretsLocked = useAppStore((s) => s.secretsLocked);
  const hydrated = useAppStore((s) => s.hydrated);
  const vaultBusy = useAppStore((s) => s.vaultBusy);
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

  const actions = buildQuickActions(host, t);
  const busy =
    pendingAction !== null ||
    isStreaming ||
    secretsLocked ||
    !hydrated ||
    vaultBusy;

  const closeDialog = (): void => setDialog(null);

  const submitCreate = (): void => {
    const count = clampSlideCount(Number(slideCount));
    const label = t("quickActions.powerpoint.createPresentation");
    const language = contentLanguageName(i18n.language);
    closeDialog();
    void runQuickAction(
      (p, action) =>
        powerpointActions.createPresentation(
          { topic, slideCount: count, language },
          p,
          action
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
        (p, action) => wordActions.translateSelection(language, p, action),
        label
      );
      return;
    }
    void runQuickAction(
      (p, action) => powerpointActions.translateSlide(language, p, action),
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
    const { label, run } = buildInstructionAction(instructionKind, text, t);
    void runQuickAction(run, label);
  };

  if (host !== "powerpoint" && actions.length === 0) return <></>;

  return (
    <>
      <div className="quick-actions">
        {host === "powerpoint" && (
          <Button
            size="small"
            appearance="outline"
            disabled={busy}
            onClick={() => setDialog("create")}
          >
            {t("quickActions.powerpoint.createPresentation")}
          </Button>
        )}
        {actions.map((action) => {
          const actionBusy =
            pendingAction !== null && pendingAction.label === action.label;
          return (
            <Button
              key={action.key}
              size="small"
              appearance="outline"
              disabled={busy}
              onClick={() => void runQuickAction(action.run, action.label)}
            >
              {actionBusy ? <Spinner size="tiny" /> : action.label}
            </Button>
          );
        })}
        {host === "word" && (
          <>
            <Button
              size="small"
              appearance="outline"
              disabled={busy}
              onClick={() => setDialog("translate")}
            >
              {t("quickActions.word.translate")}
            </Button>
            <Button
              size="small"
              appearance="outline"
              disabled={busy}
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
              disabled={busy}
              onClick={() => openInstruction("excel-formula")}
            >
              {t("quickActions.excel.generateFormula")}
            </Button>
            <Button
              size="small"
              appearance="outline"
              disabled={busy}
              onClick={() => openInstruction("excel-vba")}
            >
              {t("quickActions.excel.generateVba")}
            </Button>
            <Button
              size="small"
              appearance="outline"
              disabled={busy}
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
            disabled={busy}
            onClick={() => setDialog("translate")}
          >
            {t("quickActions.powerpoint.translate")}
          </Button>
        )}
      </div>

      <CreatePresentationDialog
        open={dialog === "create"}
        onClose={closeDialog}
        busy={busy}
        topic={topic}
        onTopicChange={setTopic}
        slideCount={slideCount}
        onSlideCountChange={setSlideCount}
        onSubmit={submitCreate}
      />

      <TranslateDialog
        open={dialog === "translate"}
        onClose={closeDialog}
        busy={busy}
        targetLang={targetLang}
        onTargetLangChange={setTargetLang}
        onSubmit={submitTranslate}
      />

      <InstructionDialog
        open={dialog === "instruction"}
        onClose={closeDialog}
        busy={busy}
        title={t(instructionTitleKey(instructionKind))}
        instruction={instruction}
        onInstructionChange={setInstruction}
        onSubmit={submitInstruction}
      />
    </>
  );
}

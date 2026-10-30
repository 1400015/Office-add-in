import type { OfficeHost } from "../../../types";
import * as wordActions from "../../../word/wordActions";
import * as excelActions from "../../../excel/excelActions";
import * as powerpointActions from "../../../powerpoint/powerpointActions";

/** A prompt factory handed to quick actions by useChat.runQuickAction. */
export type PromptFn = (text: string) => Promise<string>;

/** Minimal shape of react-i18next's translation function used here. */
export type I18nLabel = (key: string) => string;

export interface ActionDef {
  key: string;
  label: string;
  run: (prompt: PromptFn) => Promise<string>;
}

export type DialogKind = "create" | "translate" | "instruction" | null;
export type InstructionKind =
  "word-generate" | "excel-formula" | "excel-vba" | "excel-script";

/** Quick-action buttons offered for each Office host, in UI order. */
export function buildQuickActions(host: OfficeHost, t: I18nLabel): ActionDef[] {
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
}

const INSTRUCTION_TITLE_KEYS: Record<InstructionKind, string> = {
  "word-generate": "dialogs.generateTitle",
  "excel-formula": "dialogs.formulaTitle",
  "excel-vba": "dialogs.vbaTitle",
  "excel-script": "dialogs.scriptTitle",
};

/** i18n key of the instruction dialog title for the given kind. */
export function instructionTitleKey(kind: InstructionKind): string {
  return INSTRUCTION_TITLE_KEYS[kind];
}

/** Maps an instruction-dialog submission to its run definition and button label. */
export function buildInstructionAction(
  kind: InstructionKind,
  text: string,
  t: I18nLabel
): { label: string; run: (prompt: PromptFn) => Promise<string> } {
  switch (kind) {
    case "word-generate":
      return {
        label: t("quickActions.word.generate"),
        run: (p) => wordActions.generateAndInsert(text, p),
      };
    case "excel-formula":
      return {
        label: t("quickActions.excel.generateFormula"),
        run: (p) => excelActions.generateFormula(text, p),
      };
    case "excel-vba":
      return {
        label: t("quickActions.excel.generateVba"),
        run: (p) => excelActions.generateVba(text, p),
      };
    case "excel-script":
      return {
        label: t("quickActions.excel.generateScript"),
        run: (p) => excelActions.generateOfficeScript(text, p),
      };
  }
}

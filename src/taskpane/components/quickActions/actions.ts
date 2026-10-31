import type { ActionContext } from "../../../services/ActionContext";
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
  run: (prompt: PromptFn, action: ActionContext) => Promise<string>;
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
          run: (p, action) => wordActions.summarizeDocument(p, action),
        },
        {
          key: "explain",
          label: t("quickActions.word.explain"),
          run: (p, action) => wordActions.explainSelection(p, action),
        },
        {
          key: "rewrite",
          label: t("quickActions.word.rewrite"),
          run: (p, action) => wordActions.rewriteSelection(p, action),
        },
        {
          key: "fixGrammar",
          label: t("quickActions.word.fixGrammar"),
          run: (p, action) => wordActions.fixGrammar(p, action),
        },
      ];
    case "excel":
      return [
        {
          key: "explainFormula",
          label: t("quickActions.excel.explainFormula"),
          run: (p, action) => excelActions.explainFormula(p, action),
        },
        {
          key: "analyseTable",
          label: t("quickActions.excel.analyseTable"),
          run: (p, action) => excelActions.analyseTable(p, action),
        },
      ];
    case "powerpoint":
      return [
        {
          key: "improveSlide",
          label: t("quickActions.powerpoint.improveSlide"),
          run: (p, action) => powerpointActions.improveSlide(p, action),
        },
        {
          key: "fixGrammar",
          label: t("quickActions.powerpoint.fixGrammar"),
          run: (p, action) => powerpointActions.fixSlideGrammar(p, action),
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
          run: (p, action) =>
            powerpointActions.summarizePresentation(p, action),
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
): {
  label: string;
  run: (prompt: PromptFn, action: ActionContext) => Promise<string>;
} {
  switch (kind) {
    case "word-generate":
      return {
        label: t("quickActions.word.generate"),
        run: (p, action) => wordActions.generateAndInsert(text, p, action),
      };
    case "excel-formula":
      return {
        label: t("quickActions.excel.generateFormula"),
        run: (p, action) => excelActions.generateFormula(text, p, action),
      };
    case "excel-vba":
      return {
        label: t("quickActions.excel.generateVba"),
        run: (p, action) => excelActions.generateVba(text, p, action),
      };
    case "excel-script":
      return {
        label: t("quickActions.excel.generateScript"),
        run: (p, action) => excelActions.generateOfficeScript(text, p, action),
      };
  }
}

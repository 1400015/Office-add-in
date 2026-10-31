import { MAX_CONTEXT_CHARS } from "../constants";
import { logger } from "../services/LoggerService";

export type PromptFn = (text: string) => Promise<string>;

import { readBoundedSelection, type RangeSnapshot } from "./rangeSnapshot";
import {
  ActionConflictError,
  isInvalidOfficeTarget,
  type ActionContext,
} from "../services/ActionContext";

async function readSelectedRange(
  action?: ActionContext
): Promise<RangeSnapshot> {
  action?.assertCurrent();
  const range = await Excel.run((context) => readBoundedSelection(context));
  action?.assertCurrent();
  if (range.truncated) action?.reportTruncation?.();
  return range;
}

function rangeToCsv(range: RangeSnapshot): string {
  const maxRows = Math.min(range.values.length, 200);
  const rows: string[] = [];
  for (let r = 0; r < maxRows; r++) {
    const row = range.values[r] ?? [];
    const formulaRow = range.formulas[r] ?? [];
    rows.push(
      row
        .map((cell, c) => {
          const formula = formulaRow[c];
          return typeof formula === "string" && formula.startsWith("=")
            ? formula
            : String(cell ?? "");
        })
        .join(",")
    );
  }
  return rows.join("\n");
}

export function extractFormula(raw: string): string {
  const cleaned = raw.replace(/```[\w]*|```/g, "").trim();
  const line = cleaned
    .split("\n")
    .map((part) => part.trim())
    .find((part) => part.startsWith("="));
  if (!line) throw new Error("The AI did not return a formula.");
  return line;
}

export async function explainFormula(
  prompt: PromptFn,
  action?: ActionContext
): Promise<string> {
  action?.assertCurrent();
  const formula = await Excel.run(async (context) => {
    const cell = context.workbook.getSelectedRange().getCell(0, 0);
    cell.load("formulas");
    await context.sync();
    return cell.formulas[0]?.[0];
  });
  action?.assertCurrent();
  if (typeof formula !== "string" || !formula.startsWith("=")) {
    throw new Error("Select a cell containing a formula.");
  }
  return prompt(
    `Explain this Excel formula step by step. Describe what each part does and what the result means:\n\n${formula}`
  );
}

export async function generateFormula(
  instruction: string,
  prompt: PromptFn,
  action?: ActionContext
): Promise<string> {
  action?.assertCurrent();
  const captured = await Excel.run(async (context) => {
    const cell = context.workbook.getSelectedRange().getCell(0, 0);
    cell.load("address,formulas");
    cell.track();
    try {
      await context.sync();
      action?.assertCurrent();
      return { cell, address: cell.address, original: cell.formulas[0]?.[0] };
    } catch (error) {
      cell.untrack();
      await context.sync().catch(() => {});
      throw error;
    }
  });
  try {
    const raw = await prompt(
      `Create an Excel formula for the following request. Return ONLY the formula (starting with =), no explanations, no markdown code fences:\n\n${instruction}\n\nTarget cell: ${captured.address}`
    );
    action?.assertCurrent();
    const formula = extractFormula(raw);
    try {
      await Excel.run(captured.cell, async (context) => {
        action?.assertCurrent();
        captured.cell.load("formulas");
        await context.sync();
        action?.assertCurrent();
        if (captured.cell.formulas[0]?.[0] !== captured.original)
          throw new ActionConflictError(formula);
        captured.cell.formulas = [[formula]];
        action?.assertCurrent();
        await context.sync();
      });
    } catch (error) {
      if (isInvalidOfficeTarget(error)) throw new ActionConflictError(formula);
      throw error;
    }
    return formula;
  } finally {
    try {
      await Excel.run(captured.cell, async (context) => {
        captured.cell.untrack();
        await context.sync();
      });
    } catch (error) {
      logger.warn("excel", "Failed to release tracked cell", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

export async function analyseTable(
  prompt: PromptFn,
  action?: ActionContext
): Promise<string> {
  logger.info("excel", "Analyse table");
  const range = await readSelectedRange(action);
  const csv = rangeToCsv(range);
  if (!csv.trim()) throw new Error("Select a range with data.");
  const truncated =
    csv.length > MAX_CONTEXT_CHARS
      ? `${csv.slice(0, MAX_CONTEXT_CHARS)}\n[Content truncated]`
      : csv;
  if (csv.length > MAX_CONTEXT_CHARS) action?.reportTruncation?.();
  return prompt(
    `Analyse this table data (CSV format, range ${range.address}, analyzed ${range.analyzedAddress}${range.truncated ? " (truncated)" : ""}). Identify trends, outliers and anomalies, and provide an executive summary:\n\n${truncated}`
  );
}

export async function translateRange(
  targetLanguage: string,
  prompt: PromptFn,
  action?: ActionContext
): Promise<string> {
  logger.info("excel", "Translate range", { targetLanguage });
  const range = await readSelectedRange(action);
  const csv = rangeToCsv(range);
  if (!csv.trim()) throw new Error("Select a range with text.");
  const truncated =
    csv.length > MAX_CONTEXT_CHARS
      ? `${csv.slice(0, MAX_CONTEXT_CHARS)}\n[Content truncated]`
      : csv;
  if (csv.length > MAX_CONTEXT_CHARS) action?.reportTruncation?.();
  return prompt(
    `Translate the textual content of this spreadsheet range ${range.address}, analyzed ${range.analyzedAddress}${range.truncated ? " (truncated)" : ""}, into ${targetLanguage}. Keep numbers unchanged. Return only the translation:\n\n${truncated}`
  );
}

export async function generateVba(
  instruction: string,
  prompt: PromptFn,
  action?: ActionContext
): Promise<string> {
  action?.assertCurrent();
  logger.info("excel", "Generate VBA");
  return prompt(
    `Write an Excel VBA macro for the following request. Return only valid, commented VBA code. Do not claim the macro was installed:\n\n${instruction}`
  );
}

export async function generateOfficeScript(
  instruction: string,
  prompt: PromptFn,
  action?: ActionContext
): Promise<string> {
  action?.assertCurrent();
  logger.info("excel", "Generate Office Script");
  return prompt(
    `Write a TypeScript Office Script for Excel for the following request. Return only valid Office Script code using the main function signature. Do not claim the script was installed:\n\n${instruction}`
  );
}

export async function insertTextInCell(text: string): Promise<void> {
  const payload = text.trim();
  if (!payload) return;
  await Excel.run(async (context) => {
    const cell = context.workbook.getSelectedRange().getCell(0, 0);
    if (payload.startsWith("=")) {
      cell.formulas = [[payload.split("\n")[0] ?? payload]];
    } else {
      cell.values = [[payload]];
    }
    await context.sync();
  });
}

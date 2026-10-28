import { MAX_CONTEXT_CHARS } from "../constants";
import { logger } from "../services/LoggerService";

export type PromptFn = (text: string) => Promise<string>;

export interface RangeSnapshot {
  address: string;
  values: (string | number | boolean)[][];
  formulas: string[][];
}

async function readSelectedRange(): Promise<RangeSnapshot> {
  return Excel.run(async (context) => {
    const range = context.workbook.getSelectedRange();
    range.load("address,values,formulas");
    await context.sync();
    return {
      address: range.address,
      values: (range.values as (string | number | boolean)[][]).map((row) => [
        ...row,
      ]),
      formulas: (range.formulas as string[][]).map((row) => [...row]),
    };
  });
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
          return formula && formula.startsWith("=")
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

export async function explainFormula(prompt: PromptFn): Promise<string> {
  logger.info("excel", "Explain formula");
  const range = await readSelectedRange();
  const formula = range.formulas[0]?.[0] ?? "";
  if (!formula.startsWith("=")) {
    throw new Error("Select a cell containing a formula.");
  }
  return prompt(
    `Explain this Excel formula step by step. Describe what each part does and what the result means:\n\n${formula}`
  );
}

export async function generateFormula(
  instruction: string,
  prompt: PromptFn
): Promise<string> {
  logger.info("excel", "Generate formula", { instruction });
  const range = await readSelectedRange();
  const raw = await prompt(
    `Create an Excel formula for the following request. Return ONLY the formula (starting with =), no explanations, no markdown code fences:\n\n${instruction}\n\nTarget cell: ${range.address}`
  );
  const formula = extractFormula(raw);
  await Excel.run(async (context) => {
    const cell = context.workbook.getSelectedRange().getCell(0, 0);
    cell.formulas = [[formula]];
    await context.sync();
  });
  return formula;
}

export async function analyseTable(prompt: PromptFn): Promise<string> {
  logger.info("excel", "Analyse table");
  const range = await readSelectedRange();
  const csv = rangeToCsv(range);
  if (!csv.trim()) throw new Error("Select a range with data.");
  const truncated =
    csv.length > MAX_CONTEXT_CHARS ? csv.slice(0, MAX_CONTEXT_CHARS) : csv;
  return prompt(
    `Analyse this table data (CSV format, range ${range.address}). Identify trends, outliers and anomalies, and provide an executive summary:\n\n${truncated}`
  );
}

export async function translateRange(
  targetLanguage: string,
  prompt: PromptFn
): Promise<string> {
  logger.info("excel", "Translate range", { targetLanguage });
  const range = await readSelectedRange();
  const csv = rangeToCsv(range);
  if (!csv.trim()) throw new Error("Select a range with text.");
  const truncated =
    csv.length > MAX_CONTEXT_CHARS ? csv.slice(0, MAX_CONTEXT_CHARS) : csv;
  return prompt(
    `Translate the textual content of this spreadsheet range into ${targetLanguage}. Keep numbers unchanged. Return only the translation:\n\n${truncated}`
  );
}

export async function generateVba(
  instruction: string,
  prompt: PromptFn
): Promise<string> {
  logger.info("excel", "Generate VBA", { instruction });
  return prompt(
    `Write an Excel VBA macro for the following request. Return only valid, commented VBA code. Do not claim the macro was installed:\n\n${instruction}`
  );
}

export async function generateOfficeScript(
  instruction: string,
  prompt: PromptFn
): Promise<string> {
  logger.info("excel", "Generate Office Script", { instruction });
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

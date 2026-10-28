import { MAX_CONTEXT_CHARS } from "../constants";
import { logger } from "../services/LoggerService";

export type PromptFn = (text: string) => Promise<string>;

async function getSelectedRange(): Promise<Excel.Range> {
  return Excel.run(async (context) => {
    const range = context.workbook.getSelectedRange();
    range.load("address,values,formulas");
    await context.sync();
    return range;
  });
}

function rangeToCsv(range: Excel.Range): string {
  const values = range.values as (string | number | boolean)[][];
  const formulas = range.formulas as string[][];
  const maxRows = Math.min(values.length, 200);
  const rows: string[] = [];
  for (let r = 0; r < maxRows; r++) {
    const row = values[r] ?? [];
    const formulaRow = formulas[r] ?? [];
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

export async function explainFormula(prompt: PromptFn): Promise<string> {
  logger.info("excel", "Explain formula");
  const range = await getSelectedRange();
  const formulas = range.formulas as string[][];
  const formula = formulas[0]?.[0] ?? "";
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
  const range = await getSelectedRange();
  return prompt(
    `Create an Excel formula for the following request. Return ONLY the formula (starting with =), no explanations, no markdown code fences:\n\n${instruction}\n\nTarget cell: ${range.address}`
  );
}

export async function analyseTable(prompt: PromptFn): Promise<string> {
  logger.info("excel", "Analyse table");
  const range = await getSelectedRange();
  const csv = rangeToCsv(range);
  if (!csv.trim()) throw new Error("Select a range with data.");
  const truncated =
    csv.length > MAX_CONTEXT_CHARS ? csv.slice(0, MAX_CONTEXT_CHARS) : csv;
  return prompt(
    `Analyse this table data (CSV format, range ${range.address}). Identify trends, outliers and anomalies, and provide an executive summary:\n\n${truncated}`
  );
}

export async function generateVba(
  instruction: string,
  prompt: PromptFn
): Promise<string> {
  logger.info("excel", "Generate VBA", { instruction });
  return prompt(
    `Write an Excel VBA macro for the following request. Return only valid, commented VBA code:\n\n${instruction}`
  );
}

export async function generateOfficeScript(
  instruction: string,
  prompt: PromptFn
): Promise<string> {
  logger.info("excel", "Generate Office Script", { instruction });
  return prompt(
    `Write a TypeScript Office Script for Excel for the following request. Return only valid Office Script code using the main function signature:\n\n${instruction}`
  );
}

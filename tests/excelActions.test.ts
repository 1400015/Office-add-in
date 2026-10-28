import { afterEach, describe, expect, it, vi } from "vitest";
import {
  analyseTable,
  explainFormula,
  extractFormula,
  generateFormula,
  insertTextInCell,
} from "../src/excel/excelActions";

interface Cell {
  formulas: string[][];
  values: (string | number | boolean)[][];
}

function installExcel(snapshot: {
  address: string;
  values: (string | number | boolean)[][];
  formulas: string[][];
}): { cell: Cell } {
  const cell: Cell = {
    formulas: [[snapshot.formulas[0]?.[0] ?? ""]],
    values: [[snapshot.values[0]?.[0] ?? ""]],
  };
  vi.stubGlobal("Excel", {
    run: async (callback: (context: unknown) => Promise<unknown>) =>
      callback({
        workbook: {
          getSelectedRange: () => ({
            address: snapshot.address,
            values: snapshot.values,
            formulas: snapshot.formulas,
            load: () => {},
            getCell: () => cell,
          }),
        },
        sync: async () => {},
      }),
  });
  return { cell };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("extractFormula", () => {
  it("pulls the formula out of a fenced reply", () => {
    expect(extractFormula("```excel\n=SUM(A1:A3)\n```")).toBe("=SUM(A1:A3)");
  });

  it("rejects prose without a formula", () => {
    expect(() => extractFormula("I cannot do that")).toThrow(/formula/i);
  });
});

describe("Excel actions", () => {
  it("explains the formula from a plain snapshot, not a live proxy", async () => {
    installExcel({
      address: "B2",
      values: [[6]],
      formulas: [["=SUM(A1:A2)"]],
    });
    const text = await explainFormula(async (prompt) => prompt);
    expect(text).toContain("=SUM(A1:A2)");
  });

  it("writes a generated formula into the active cell", async () => {
    const { cell } = installExcel({
      address: "C1",
      values: [[""]],
      formulas: [[""]],
    });
    const formula = await generateFormula(
      "sum the column",
      async () => "Here you go:\n=SUM(A:A)"
    );
    expect(formula).toBe("=SUM(A:A)");
    expect(cell.formulas).toEqual([["=SUM(A:A)"]]);
  });

  it("analyses the selected table as CSV", async () => {
    installExcel({
      address: "A1:B2",
      values: [
        ["drug", "dose"],
        ["amoxicillin", 500],
      ],
      formulas: [
        ["", ""],
        ["", ""],
      ],
    });
    const text = await analyseTable(async (prompt) => prompt);
    expect(text).toContain("amoxicillin,500");
    expect(text).toContain("A1:B2");
  });

  it("inserts plain text or a formula into the active cell", async () => {
    const { cell } = installExcel({
      address: "A1",
      values: [[""]],
      formulas: [[""]],
    });
    await insertTextInCell("nota");
    expect(cell.values).toEqual([["nota"]]);
    await insertTextInCell("=A1+1");
    expect(cell.formulas).toEqual([["=A1+1"]]);
  });
});

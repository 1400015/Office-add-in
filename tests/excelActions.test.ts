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
}): { cell: Cell; loads: string[] } {
  const loads: string[] = [];
  const bounded = {
    address: snapshot.address,
    values: snapshot.values,
    formulas: snapshot.formulas,
    load: (fields: string) => loads.push(`bounded:${fields}`),
  };
  const cell = {
    address: snapshot.address,
    formulas: [[snapshot.formulas[0]?.[0] ?? ""]],
    values: [[snapshot.values[0]?.[0] ?? ""]],
    load: (fields: string) => loads.push(`cell:${fields}`),
    track: vi.fn(),
    untrack: vi.fn(),
    getResizedRange: () => bounded,
  };
  const selected = {
    address: snapshot.address,
    rowCount: snapshot.values.length,
    columnCount: snapshot.values[0]?.length ?? 1,
    load: (fields: string) => loads.push(`selected:${fields}`),
    getCell: () => cell,
  };
  const context = {
    workbook: { getSelectedRange: () => selected },
    sync: async () => {},
  };
  vi.stubGlobal("Excel", {
    run: async (
      first: unknown,
      second?: (context: unknown) => Promise<unknown>
    ) => (typeof first === "function" ? first : second!)(context),
  });
  return { cell, loads };
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
  it("never loads cell values on the unbounded selection", async () => {
    const { loads } = installExcel({
      address: "A:A",
      values: [["a"]],
      formulas: [[""]],
    });
    await analyseTable(async (prompt) => prompt);
    expect(loads).toContain("selected:address,rowCount,columnCount");
    expect(
      loads.some(
        (entry) => entry.startsWith("selected:") && entry.includes("values")
      )
    ).toBe(false);
    expect(loads).toContain("bounded:address,values,formulas");
  });

  it("does not overwrite a cell edited while the model responds", async () => {
    const { cell } = installExcel({
      address: "A1",
      values: [[""]],
      formulas: [[""]],
    });
    await expect(
      generateFormula("sum", async () => {
        cell.formulas = [["=1"]];
        return "=2";
      })
    ).rejects.toMatchObject({ name: "ActionConflictError", result: "=2" });
    expect(cell.formulas).toEqual([["=1"]]);
  });
  it("limits a whole-sheet selection before requesting its cell data", async () => {
    const resize = vi.fn(() => ({
      address: "A1:AX200",
      values: [["a"]],
      formulas: [[""]],
      load: vi.fn(),
    }));
    const selected = {
      address: "A:XFD",
      rowCount: 1048576,
      columnCount: 16384,
      load: vi.fn(),
      getCell: () => ({ getResizedRange: resize }),
    };
    vi.stubGlobal("Excel", {
      run: async (callback: (context: unknown) => Promise<unknown>) =>
        callback({
          workbook: { getSelectedRange: () => selected },
          sync: async () => {},
        }),
    });
    const reportTruncation = vi.fn();
    const prompt = vi.fn(async (text: string) => text);
    const result = await analyseTable(prompt, {
      signal: new AbortController().signal,
      assertCurrent: () => {},
      reportTruncation,
    });
    expect(selected.load).toHaveBeenCalledWith("address,rowCount,columnCount");
    expect(resize).toHaveBeenCalledWith(199, 49);
    expect(reportTruncation).toHaveBeenCalled();
    expect(result).toContain("(truncated)");
  });

  it("does not write a generated formula after cancellation", async () => {
    const { cell } = installExcel({
      address: "A1",
      values: [[""]],
      formulas: [[""]],
    });
    const controller = new AbortController();
    const action = {
      signal: controller.signal,
      assertCurrent: () => {
        if (controller.signal.aborted) throw new Error("cancelled");
      },
    };
    await expect(
      generateFormula(
        "sum",
        async () => {
          controller.abort();
          return "=2";
        },
        action
      )
    ).rejects.toThrow("cancelled");
    expect(cell.formulas).toEqual([[""]]);
  });
  it("keeps the original tracked cell after changing the active selection", async () => {
    const makeCell = (address: string) => ({
      address,
      formulas: [[""]],
      load: vi.fn(),
      track: vi.fn(),
      untrack: vi.fn(),
    });
    const a = makeCell("Sheet1!A1");
    const b = makeCell("Sheet2!B2");
    let current = a;
    const context = {
      workbook: { getSelectedRange: () => ({ getCell: () => current }) },
      sync: async () => {},
    };
    vi.stubGlobal("Excel", {
      run: async (
        first: unknown,
        second?: (context: unknown) => Promise<unknown>
      ) => (typeof first === "function" ? first : second!)(context),
    });
    await generateFormula("sum", async () => {
      current = b;
      return "=2";
    });
    expect(a.formulas).toEqual([["=2"]]);
    expect(b.formulas).toEqual([[""]]);
    expect(a.untrack).toHaveBeenCalledOnce();
  });
});

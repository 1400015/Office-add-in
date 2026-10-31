export type CellValue = string | number | boolean;

export interface RangeSnapshot {
  address: string;
  analyzedAddress: string;
  values: CellValue[][];
  formulas: CellValue[][];
  truncated: boolean;
}

/** Bound the actual Office payload, before loading cell data. */
export async function readBoundedSelection(
  context: Excel.RequestContext,
  includeFormulas = true
): Promise<RangeSnapshot> {
  const selected = context.workbook.getSelectedRange();
  selected.load("address,rowCount,columnCount");
  await context.sync();
  const rows = Math.max(1, Math.min(selected.rowCount, 200));
  const columns = Math.max(1, Math.min(selected.columnCount, 50));
  const bounded = selected.getCell(0, 0).getResizedRange(rows - 1, columns - 1);
  bounded.load(includeFormulas ? "address,values,formulas" : "address,values");
  await context.sync();
  return {
    address: selected.address,
    analyzedAddress: bounded.address,
    values: (bounded.values as CellValue[][]).map((row) => [...row]),
    formulas: includeFormulas
      ? (bounded.formulas as CellValue[][]).map((row) => [...row])
      : [],
    truncated: selected.rowCount > rows || selected.columnCount > columns,
  };
}

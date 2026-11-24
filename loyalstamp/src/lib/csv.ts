import Papa from "papaparse";

export type CsvRow = Record<string, string>;

export type CsvParseResult = {
  rows: CsvRow[];
  /** Structural problems (wrong number of fields in a row). `row` is the spreadsheet row: header = 1. */
  errors: { row: number; message: string }[];
  missingColumns: string[];
};

/** Parses CSV text. Headers are trimmed and lowercased so "Product_ID " matches "product_id". */
export function parseCsv(text: string, requiredColumns: string[]): CsvParseResult {
  const clean = text.replace(/^\uFEFF/, ""); // Excel often adds a byte-order mark
  const result = Papa.parse<CsvRow>(clean, {
    header: true,
    delimiter: ",",
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim().toLowerCase(),
  });

  const headers = result.meta.fields ?? [];
  const missingColumns = requiredColumns.filter((c) => !headers.includes(c));
  const errors = result.errors.map((e) => ({ row: (e.row ?? 0) + 2, message: e.message }));

  return { rows: result.data, errors: missingColumns.length ? [] : errors, missingColumns };
}

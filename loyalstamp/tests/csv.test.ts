import { describe, it, expect } from "vitest";
import { parseCsv } from "@/lib/csv";

describe("parseCsv", () => {
  it("normalizes headers and strips a byte-order mark", () => {
    const r = parseCsv("\uFEFF Product_ID ,SKU\nP1,A\n", ["product_id", "sku"]);
    expect(r.missingColumns).toEqual([]);
    expect(r.rows).toEqual([{ product_id: "P1", sku: "A" }]);
  });

  it("handles quoted fields containing commas and skips blank lines", () => {
    const r = parseCsv('a,b\n"x, y",2\n\n,\n3,4\n', ["a", "b"]);
    expect(r.rows).toEqual([
      { a: "x, y", b: "2" },
      { a: "3", b: "4" },
    ]);
  });

  it("reports missing columns", () => {
    const r = parseCsv("a,b\n1,2\n", ["a", "c"]);
    expect(r.missingColumns).toEqual(["c"]);
  });

  it("flags a row with the wrong number of fields, using spreadsheet row numbers", () => {
    const r = parseCsv("a,b,c\n1,2\n", ["a"]);
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.errors[0].row).toBe(2);
  });
});

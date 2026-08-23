import assert from "node:assert/strict";
import test from "node:test";
import { parseCsv } from "../../src/ingestion/csv/parseCsv.js";

// The CSV parser is a development-only bridge for Planning fixtures. These
// tests lock down enough CSV behavior to keep fixture-based chart debugging safe.
test("parseCsv parses simple CSV rows", () => {
  assert.deepEqual(parseCsv("A,B\n1,2\n"), [{ A: "1", B: "2" }]);
});

test("parseCsv supports quoted commas, quotes, and newlines", () => {
  assert.deepEqual(parseCsv('Name,Note\n"A ""value""","line\nwith, comma"\n'), [
    { Name: 'A "value"', Note: "line\nwith, comma" },
  ]);
});

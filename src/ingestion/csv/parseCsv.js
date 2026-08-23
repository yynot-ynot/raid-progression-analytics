/**
 * Parse a CSV string into row objects.
 *
 * This small parser supports quoted fields, embedded newlines, and escaped
 * quotes. It exists for development fixtures only; production graph rendering
 * should receive app-owned objects from FFLogs loaders.
 *
 * @param {string} csvText
 * @returns {object[]}
 */
export function parseCsv(csvText = "") {
  const rows = parseCsvRecords(csvText).filter((row) => row.some((cell) => cell !== ""));
  if (rows.length === 0) return [];

  const headers = rows[0].map((header) => header.trim());
  return rows.slice(1).map((row) =>
    Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])),
  );
}

/**
 * Parse CSV text into raw cell records.
 *
 * @param {string} csvText
 * @returns {string[][]}
 */
function parseCsvRecords(csvText) {
  const records = [];
  let record = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < csvText.length; index += 1) {
    const char = csvText[index];
    const next = csvText[index + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      record.push(field);
      field = "";
    } else if (char === "\n") {
      record.push(field);
      records.push(record);
      record = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  record.push(field);
  records.push(record);
  return records;
}

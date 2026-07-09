// Values starting with these characters are interpreted as formulas by Excel/LibreOffice.
// Prepend a tab so spreadsheet apps treat the cell as plain text.
const FORMULA_INJECTION_PREFIX = /^[=+\-@|]/;

export function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text = typeof value === "object" ? JSON.stringify(value) : String(value);
  if (FORMULA_INJECTION_PREFIX.test(text)) text = `\t${text}`;
  if (/[",\n\r\t]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function convertRowsToCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => escapeCsvValue(row[header])).join(","));
  }
  return lines.join("\n");
}

/** RFC-4180 field quoting so a value containing a comma, quote or newline cannot
 *  shift every following column when the export is opened in a spreadsheet. */
function csvCell(value: unknown): string {
  const s = value == null ? '' : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Serialise a header row plus body rows to CSV with CRLF line endings (Excel
 *  treats bare LF as a single line in some locales). */
export function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
}

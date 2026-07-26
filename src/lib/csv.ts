import { NextResponse } from "next/server";

// Single export format across the app: CSV, which Apple Numbers (and Excel)
// read natively. Lead with a UTF-8 BOM so accented crew/part names render
// correctly on open. Values are escaped per RFC 4180.
export function csvResponse(
  filename: string,
  headers: string[],
  rows: ReadonlyArray<ReadonlyArray<string | number | null | undefined>>,
): NextResponse {
  const esc = (v: string | number | null | undefined) => {
    const s = v == null ? "" : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.map(esc).join(",")];
  for (const r of rows) lines.push(r.map(esc).join(","));
  const csv = "﻿" + lines.join("\r\n");
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

// Parse counterpart for spreadsheet imports. RFC-4180-tolerant: handles a
// leading UTF-8 BOM, quoted fields with embedded commas/newlines, doubled
// quotes ("") as escapes, and both \r\n and \n line endings. Stray quotes in
// unquoted fields are kept literally rather than erroring — real-world
// exports are messy. Pure function: text in, rows out.
export function parseCsv(text: string): string[][] {
  // Strip BOM.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i++;
        }
      } else {
        field += ch;
        i++;
      }
    } else if (ch === '"' && field === "") {
      inQuotes = true;
      i++;
    } else if (ch === ",") {
      pushField();
      i++;
    } else if (ch === "\r") {
      // \r\n or lone \r both end the record.
      pushRow();
      i += text[i + 1] === "\n" ? 2 : 1;
    } else if (ch === "\n") {
      pushRow();
      i++;
    } else {
      field += ch;
      i++;
    }
  }
  // Final field/row (no trailing newline).
  if (field !== "" || row.length > 0) pushRow();

  // Drop rows that are entirely empty (trailing blank lines, spacer rows).
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

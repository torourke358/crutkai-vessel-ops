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

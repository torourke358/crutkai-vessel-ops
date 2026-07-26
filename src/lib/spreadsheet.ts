import ExcelJS from "exceljs";

// Thin wrapper around exceljs: read the FIRST worksheet of an .xlsx into a
// string[][] so spreadsheet imports and CSV imports share one downstream
// path. Server-side only (exceljs is heavy — don't ship it to the browser).
//
// Coercion rules: every cell becomes a string. Dates → ISO "YYYY-MM-DD"
// (Craig's yard exports carry date-only values), rich text is flattened,
// formula cells use their cached result, null/undefined → "".

type CellValue = ExcelJS.CellValue;

function coerceCell(v: CellValue): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if ("richText" in v && Array.isArray(v.richText)) {
      return v.richText.map((r) => r.text).join("");
    }
    if ("result" in v && v.result != null) {
      return coerceCell(v.result as CellValue);
    }
    if ("text" in v && typeof v.text === "string") return v.text;
    if ("hyperlink" in v && typeof v.hyperlink === "string") return v.hyperlink;
    // Cell error objects ({ error: "#N/A" }) and anything else unknown.
    return "";
  }
  return String(v);
}

export async function parseXlsx(data: ArrayBuffer): Promise<string[][]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(data);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const rows: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    // row.values is 1-based and sparse — normalize holes to "".
    const values = row.values as CellValue[];
    const cells: string[] = [];
    for (let c = 1; c < values.length; c++) {
      cells.push(coerceCell(values[c]));
    }
    rows.push(cells);
  });

  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

// Heuristic header→field mapping shared by the inventory and yard importers.
// Headers are normalized (lowercase, alphanumerics only) then matched against
// each field's token list in order; a column is claimed at most once, and
// fields are resolved in the order given so specific fields (e.g. "part
// number") claim their column before broad ones (e.g. "part name") can.
export function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function mapColumns(
  headers: string[],
  fields: ReadonlyArray<{ field: string; tokens: readonly string[] }>,
): Record<string, number> {
  const normalized = headers.map(normalizeHeader);
  const claimed = new Set<number>();
  const mapping: Record<string, number> = {};

  for (const { field, tokens } of fields) {
    for (const token of tokens) {
      const idx = normalized.findIndex(
        (h, i) => !claimed.has(i) && h !== "" && h.includes(token),
      );
      if (idx !== -1) {
        mapping[field] = idx;
        claimed.add(idx);
        break;
      }
    }
  }
  return mapping;
}

// "8 Units" → 8, "1,204" → 1204, blank/garbage → null.
export function parseIntLoose(s: string | undefined): number | null {
  if (!s) return null;
  const m = s.replace(/,/g, "").match(/-?\d+/);
  return m ? parseInt(m[0], 10) : null;
}

// "$1,250.50" → 1250.5, "USD 40" → 40, blank/garbage → null.
export function parseMoneyLoose(s: string | undefined): number | null {
  if (!s) return null;
  const m = s.replace(/[,$]/g, "").match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

// "2024-03-12", "3/12/2024", "12 Mar 2024" → "YYYY-MM-DD"; else null.
export function parseDateLoose(s: string | undefined): string | null {
  if (!s) return null;
  const t = s.trim();
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const us = t.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/);
  if (us) {
    const [, m, d, y] = us;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const parsed = new Date(t);
  if (!isNaN(parsed.getTime()) && /[a-zA-Z]/.test(t)) {
    return parsed.toISOString().slice(0, 10);
  }
  return null;
}

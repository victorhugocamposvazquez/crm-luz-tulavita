/**
 * CSV / Excel (.xlsx, .xls) → cabeceras + filas como texto para importación de clientes.
 */

import * as XLSX from 'xlsx';
import Papa from 'papaparse';

export interface ParsedImportTable {
  fields: string[];
  rows: Record<string, string>[];
}

function normalizeCell(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'number' && Number.isFinite(v)) {
    return String(v);
  }
  return String(v).trim();
}

function excelWorkbookToTable(workbook: XLSX.WorkBook): ParsedImportTable {
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { fields: [], rows: [] };
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return { fields: [], rows: [] };

  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
    raw: false,
    blankrows: false,
  });

  if (!raw.length) return { fields: [], rows: [] };

  const rawHeaders = Object.keys(raw[0]!);
  const fields = rawHeaders.map((h) => String(h).replace(/^\uFEFF/, '').trim());

  const rows = raw
    .map((row) => {
      const out: Record<string, string> = {};
      rawHeaders.forEach((rk, i) => {
        const fk = fields[i] ?? String(rk).trim();
        out[fk] = normalizeCell(row[rk]);
      });
      return out;
    })
    .filter((row) => Object.values(row).some((v) => v.length > 0));

  return { fields, rows };
}

export function isExcelImportFile(file: File): boolean {
  const n = file.name.toLowerCase();
  const t = file.type.toLowerCase();
  return (
    n.endsWith('.xlsx') ||
    n.endsWith('.xls') ||
    t.includes('spreadsheetml.sheet') ||
    t === 'application/vnd.ms-excel'
  );
}

export async function parseClientImportFile(file: File): Promise<ParsedImportTable> {
  if (isExcelImportFile(file)) {
    const buf = await file.arrayBuffer();
    const workbook = XLSX.read(buf, { type: 'array' });
    return excelWorkbookToTable(workbook);
  }

  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.replace(/^\uFEFF/, '').trim(),
      complete: (results) => {
        const fields = results.meta.fields ?? [];
        const rows = ((results.data ?? []) as Record<string, unknown>[]).map((row) => {
          const out: Record<string, string> = {};
          for (const k of Object.keys(row)) {
            const fk = k.replace(/^\uFEFF/, '').trim();
            out[fk] = normalizeCell(row[k]);
          }
          return out;
        });
        resolve({ fields, rows });
      },
      error: (err: Error) => reject(err),
    });
  });
}

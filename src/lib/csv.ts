/** Minimal RFC 4180 CSV parser (quoted fields, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const src = text.replace(/^﻿/, ''); // strip Excel BOM
  // Excel in some locales exports with ';' — pick whichever appears first-line more.
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const delim = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"' && field === '') {
      inQuotes = true;
    } else if (c === delim) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.map((r) => r.map((f) => f.trim())).filter((r) => r.some((f) => f !== ''));
}

export interface PresenterRow {
  name: string;
  projectName: string;
}

/**
 * Turn CSV text into presenter rows. Accepts a header row (columns matched by
 * name: "name"/"presenter", "project") or no header (columns taken in order:
 * name, project). Extra columns are ignored.
 */
export function parsePresenterCsv(text: string): PresenterRow[] {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];

  const header = rows[0].map((h) => h.toLowerCase());
  const projectIdx = header.findIndex((h) => h.includes('project'));
  const nameIdx = header.findIndex((h, i) => i !== projectIdx && (h.includes('name') || h.includes('presenter')));
  const hasHeader = projectIdx !== -1 || nameIdx !== -1;

  let cols = { name: 0, project: 1 };
  if (hasHeader) {
    const name = nameIdx === -1 ? 0 : nameIdx;
    const project = projectIdx === -1 ? (name === 0 ? 1 : 0) : projectIdx;
    cols = { name, project };
  }

  return rows
    .slice(hasHeader ? 1 : 0)
    .map((r) => ({
      name: r[cols.name] ?? '',
      projectName: r[cols.project] ?? '',
    }))
    .filter((r) => r.name !== '');
}

/**
 * RFC 4180-ish CSV parser. Handles quoted fields with embedded commas and
 * doubled-quotes. No external deps.
 */
export function parseCsv(input: string): {
  headers: string[];
  rows: Array<Record<string, string>>;
} {
  const lines = splitLines(input);
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = parseLine(lines[0]!).map((h) => h.trim());
  const rows: Array<Record<string, string>> = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.trim() === "") continue;
    const cells = parseLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = cells[idx] ?? "";
    });
    rows.push(row);
  }
  return { headers, rows };
}

function splitLines(input: string): string[] {
  // Split on \n but keep newlines inside quoted fields intact.
  const out: string[] = [];
  let buf = "";
  let inQuotes = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (c === '"') {
      if (inQuotes && input[i + 1] === '"') {
        buf += '""';
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      buf += c;
    } else if ((c === "\n" || c === "\r") && !inQuotes) {
      if (c === "\r" && input[i + 1] === "\n") i++;
      out.push(buf);
      buf = "";
    } else {
      buf += c;
    }
  }
  if (buf.length > 0) out.push(buf);
  return out;
}

function parseLine(line: string): string[] {
  const cells: string[] = [];
  let buf = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        buf += '"';
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (c === "," && !inQuotes) {
      cells.push(buf);
      buf = "";
      continue;
    }
    buf += c;
  }
  cells.push(buf);
  return cells;
}

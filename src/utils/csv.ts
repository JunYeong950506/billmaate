const datePatterns = [
  /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/,
  /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/,
];

export function parseCsvText(text: string): string[][] {
  const rows: string[][] = [];
  let current = '';
  let row: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(current.trim());
      current = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') {
        index += 1;
      }
      row.push(current.trim());
      current = '';

      if (row.some((cell) => cell.length > 0)) {
        rows.push(row);
      }
      row = [];
      continue;
    }

    current += char;
  }

  if (current.length > 0 || row.length > 0) {
    row.push(current.trim());
    if (row.some((cell) => cell.length > 0)) {
      rows.push(row);
    }
  }

  return rows;
}

export function normalizeCsvDate(value: string, fallbackDate: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return fallbackDate;
  }

  for (const pattern of datePatterns) {
    const matched = trimmed.match(pattern);
    if (!matched) {
      continue;
    }

    if (pattern === datePatterns[0]) {
      const [, year, month, day] = matched;
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }

    const [, month, day, year] = matched;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    return fallbackDate;
  }

  return date.toISOString().slice(0, 10);
}

export function parseNumberText(value: string): number {
  const normalized = value.replace(/[^0-9.-]/g, '');
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return parsed;
}

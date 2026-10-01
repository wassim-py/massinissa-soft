/**
 * scripts/lib/parseVoucher.ts
 * Parses the two-row payment cells from the Excel file.
 *
 * Supports:
 *   - Standard single vouchers: "BON 12(04/08/2026)"
 *   - Hyphenated dates: "BON244 (11-09-2026)", "BON 04 ecole(15-09-2026)"
 *   - Branch labels inside voucher: "BON14anex", "BON ECOLE 10", "BON 69/ecole"
 *   - Two-digit years: "BON ECOLE 03(28/09/26)", "BON05(29/09/26)"
 *   - Date typos: "BON02(22/092026)"
 *   - Missing closing parenthesis: "BON244 (11-09-2026"
 *   - Missing voucher number: "BON(26/09/2026)" -> number = 0
 *   - Amount without voucher: amt="2000", bon=null -> number = 0
 *   - Inverted rows: amount in bottom row, voucher in top row
 *   - Triple vouchers: "BON 112+104++219(18+01+08/08+09/2026)", "BON 52+279+315(12+24/08+09/2026)"
 *   - Double vouchers: "BON 19+204(05+16/08+09/2026)", "BON 18-140(04-09/08-09/2026)"
 *   - Clean skipping of transfer notes, refunds (RMB), exemptions (مجانية), and 0 amounts
 */

export interface ParsedVoucher {
  number: number;
  amount: number;
  date: Date;
}

/**
 * Parse a payment cell (amountRaw = top row text, voucherRaw = bottom row text).
 * Returns array of ParsedVoucher (0, 1, 2, or 3 items).
 */
export function parsePaymentCell(
  amountRaw: string | null | undefined,
  voucherRaw: string | null | undefined,
  defaultAmount: number = 0
): ParsedVoucher[] {
  let amtStr = String(amountRaw ?? '').trim();
  let bonStr = String(voucherRaw ?? '').trim();

  if (!amtStr && !bonStr) return [];

  // ── 0. Handle inverted cells ──────────────────────────────────────
  // If amountRaw looks like a BON voucher and voucherRaw is empty
  if (/^BON/i.test(amtStr) && !bonStr) {
    bonStr = amtStr;
    amtStr = defaultAmount > 0 ? String(defaultAmount) : '';
  }
  // If voucherRaw is purely numbers/pluses and amountRaw is empty
  if (/^[\d\s+.,]+$/.test(bonStr) && !amtStr) {
    amtStr = bonStr;
    bonStr = '';
  }

  // ── 1. Check for text notes (transfers, refunds, exemptions) ─────
  const isTransfer = /حول|تحويل|مسلك/i.test(amtStr) || /حول|تحويل/i.test(bonStr);
  const isFree = /مجاني|مجانية/i.test(amtStr);
  const isRmb = /RMB/i.test(bonStr) || /RMB/i.test(amtStr);
  const isZero = amtStr === '0' && (bonStr === '0' || !bonStr || isRmb);

  if (isZero || isFree || isRmb) {
    return [];
  }

  // If it's a transfer note with no voucher, skip cleanly
  if (isTransfer && !bonStr) {
    return [];
  }

  // ── 2. Parse amounts ──────────────────────────────────────────────
  let amounts = amtStr
    .split('+')
    .map((s) => parseFloat(s.replace(/[^\d.,]/g, '').replace(',', '.')))
    .filter((n) => !isNaN(n) && n > 0);

  if (amounts.length === 0 && defaultAmount > 0) {
    amounts = [defaultAmount];
  }

  // If amount exists without any voucher
  if (!bonStr) {
    if (amounts.length > 0) {
      return amounts.map((amt) => ({
        number: 0,
        amount: amt,
        date: new Date(Date.UTC(2026, 8, 1, 12, 0, 0)), // Sept 2026 default
      }));
    }
    return [];
  }

  // ── 3. Normalize voucher string ───────────────────────────────────
  let normalized = bonStr.toUpperCase();

  // Missing closing paren: e.g. "BON244 (11-09-2026"
  if (normalized.includes('(') && !normalized.includes(')')) {
    normalized += ')';
  }

  // Strip branch identifiers: ECOLE, ANNEX, ANEX, AMPHI, ECL (with optional / or +)
  normalized = normalized
    .replace(/\/?(?:ECOLE|ANNEX|ANEX|AMPHI|ECL)/gi, '')
    .replace(/&AMP;/gi, '+')
    .replace(/AMP/gi, '+')
    .replace(/&/g, '+');

  // Replace date typos: missing slash e.g. 22/092026 -> 22/09/2026
  normalized = normalized.replace(/(\d{1,2})\/(\d{2})(\d{4})/g, '$1/$2/$3');

  // Replace hyphens inside dates: e.g. (11-09-2026) -> (11/09/2026)
  normalized = normalized.replace(/(\d{1,2})-(\d{1,2})-(\d{2,4})/g, '$1/$2/$3');

  // Two-digit year e.g. /26) -> /2026)
  normalized = normalized.replace(/\/(\d{2})\)/g, '/20$1)');

  // Parentheses patterns: e.g. '+(+85)' or '(+85)' -> '+85'
  normalized = normalized.replace(/\+\(\+?(\d+)\)/g, '+$1');
  normalized = normalized.replace(/\(\+?(\d+)\s*\)/g, '+$1');

  // Remove spaces around '+', '(', ')'
  normalized = normalized.replace(/\s*\+\s*/g, '+');
  normalized = normalized.replace(/\s*\(\s*/g, '(');
  normalized = normalized.replace(/\s*\)\s*/g, ')');

  // Trailing '+' before '(' e.g. "BON 45+136+(..." -> "BON 45+136(..."
  normalized = normalized.replace(/\+\(/g, '(');

  // Collapse multiple '+'
  normalized = normalized.replace(/\+{2,}/g, '+');

  // Handle "BON+" or "BON +" -> "BON "
  normalized = normalized.replace(/^BON\s*\+/i, 'BON ');
  normalized = normalized.replace(/^BON(?=\d)/i, 'BON ');

  // Handle "BON 18-140(04-09/08-09/2026)" -> "BON 18+140(04+09/08+09/2026)"
  normalized = normalized.replace(
    /^BON\s*(\d+)-(\d+)\((\d{1,2})-(\d{1,2})\/(\d{1,2})-(\d{1,2})\/(\d{4})\)$/,
    'BON $1+$2($3+$4/$5+$6/$7)'
  );

  // Trim extra spaces
  normalized = normalized.replace(/\s+/g, ' ').trim();

  // ── 4. Match BON with missing number: e.g. "BON(26/09/2026)" ──────
  const noNumMatch = normalized.match(/^BON\s*\(([0-9\/]+)\)$/);
  if (noNumMatch) {
    const dt = parseDateDMY(noNumMatch[1]);
    if (dt) {
      return [{ number: 0, amount: amounts[0] ?? 0, date: dt }];
    }
  }

  // ── 5. Match Single Voucher: "BON 12(04/08/2026)" ─────────────────
  const singleMatch = normalized.match(/^BON\s*(\d+)\(([0-9\/]+)\)$/);
  if (singleMatch) {
    const num = parseInt(singleMatch[1], 10);
    const date = parseDateDMY(singleMatch[2]);
    if (date) {
      const amount = amounts[0] ?? 0;
      return [{ number: num, amount, date }];
    }
  }

  // ── 6. Match Triple Voucher: "BON 112+104+219(18+01+08/08+09/2026)" ─
  const tripleResult = parseTripleVoucher(normalized, amounts);
  if (tripleResult) return tripleResult;

  // ── 7. Match Double Voucher ───────────────────────────────────────
  const doubleResult = parseDoubleVoucher(normalized, amounts);
  if (doubleResult) return doubleResult;

  // ── 8. Fallback: match any single voucher with space before date ──
  const fallbackSingle = normalized.match(/^BON\s*(\d+)\s*\(?([0-9\/]+)\)?$/);
  if (fallbackSingle) {
    const num = parseInt(fallbackSingle[1], 10);
    const date = parseDateDMY(fallbackSingle[2]);
    if (date) {
      return [{ number: num, amount: amounts[0] ?? 0, date }];
    }
  }

  // ── 9. Fallback: extract any BON number + date ───────────────────
  const fallback = normalized.match(/BON\s*(\d+).*?(\d{1,2}\/\d{1,2}\/\d{2,4})/);
  if (fallback) {
    const num = parseInt(fallback[1], 10);
    const date = parseDateDMY(fallback[2]);
    if (date) {
      return [{ number: num, amount: amounts[0] ?? 0, date }];
    }
  }

  return [];
}

function parseTripleVoucher(normalized: string, amounts: number[]): ParsedVoucher[] | null {
  // Format 1: BON n1+n2+n3(d1+d2+d3/m1+m2/YYYY)
  const match1 = normalized.match(
    /^BON\s*(\d+)\+(\d+)\+(\d+)\((\d{1,2})\+(\d{1,2})\+(\d{1,2})\/(\d{1,2})\+(\d{1,2})\/(\d{4})\)$/
  );
  if (match1) {
    const [, n1, n2, n3, d1, d2, d3, m1, m2, y] = match1;
    const date1 = buildDate(d1, m1, y);
    const date2 = buildDate(d2, m2, y);
    const date3 = buildDate(d3, m2, y);
    if (!date1 || !date2 || !date3) return null;
    return [
      { number: parseInt(n1), amount: amounts[0] ?? 0, date: date1 },
      { number: parseInt(n2), amount: amounts[1] ?? 0, date: date2 },
      { number: parseInt(n3), amount: amounts[2] ?? 0, date: date3 },
    ];
  }

  // Format 2: BON n1+n2+n3(d1+d2/m1+m2/YYYY) — 3 vouchers, 2 dates
  const match2 = normalized.match(
    /^BON\s*(\d+)\+(\d+)\+(\d+)\((\d{1,2})\+(\d{1,2})\/(\d{1,2})\+(\d{1,2})\/(\d{4})\)$/
  );
  if (match2) {
    const [, n1, n2, n3, d1, d2, m1, m2, y] = match2;
    const date1 = buildDate(d1, m1, y);
    const date2 = buildDate(d2, m2, y);
    if (!date1 || !date2) return null;
    return [
      { number: parseInt(n1), amount: amounts[0] ?? 0, date: date1 },
      { number: parseInt(n2), amount: amounts[1] ?? 0, date: date2 },
      { number: parseInt(n3), amount: amounts[2] ?? 0, date: date2 },
    ];
  }

  return null;
}

function parseDoubleVoucher(normalized: string, amounts: number[]): ParsedVoucher[] | null {
  // Format A: BON n1+n2(d1+d2/m1+m2/YYYY) — different months
  const matchA = normalized.match(
    /^BON\s*(\d+)\+(\d+)\((\d{1,2})\+(\d{1,2})\/(\d{1,2})\+(\d{1,2})\/(\d{4})\)$/
  );
  if (matchA) {
    const [, n1, n2, d1, d2, m1, m2, y] = matchA;
    const date1 = buildDate(d1, m1, y);
    const date2 = buildDate(d2, m2, y);
    if (!date1 || !date2) return null;
    return buildTwoVouchers(parseInt(n1), parseInt(n2), date1, date2, amounts);
  }

  // Format B: BON n1+n2(d1+d2/m/YYYY) — same month
  const matchB = normalized.match(
    /^BON\s*(\d+)\+(\d+)\((\d{1,2})\+(\d{1,2})\/(\d{1,2})\/(\d{4})\)$/
  );
  if (matchB) {
    const [, n1, n2, d1, d2, m, y] = matchB;
    const date1 = buildDate(d1, m, y);
    const date2 = buildDate(d2, m, y);
    if (!date1 || !date2) return null;
    return buildTwoVouchers(parseInt(n1), parseInt(n2), date1, date2, amounts);
  }

  // Format C: BON n1+n2(d1/m1/YYYY+d2/m2/YYYY) — explicit two full dates
  const matchC = normalized.match(
    /^BON\s*(\d+)\+(\d+)\(([0-9\/]+)\+([0-9\/]+)\)$/
  );
  if (matchC) {
    const [, n1, n2, dateStr1, dateStr2] = matchC;
    const date1 = parseDateDMY(dateStr1);
    const date2 = parseDateDMY(dateStr2);
    if (!date1 || !date2) return null;
    return buildTwoVouchers(parseInt(n1), parseInt(n2), date1, date2, amounts);
  }

  return null;
}

function buildTwoVouchers(
  n1: number,
  n2: number,
  date1: Date,
  date2: Date,
  amounts: number[]
): ParsedVoucher[] {
  const amt1 = amounts[0] ?? 0;
  const amt2 = amounts[1] ?? amounts[0] ?? 0;
  return [
    { number: n1, amount: amt1, date: date1 },
    { number: n2, amount: amt2, date: date2 },
  ];
}

function parseDateDMY(str: string): Date | null {
  const parts = str.split('/');
  if (parts.length !== 3) return null;
  let [d, m, y] = parts.map(Number);
  if (!d || !m || !y) return null;
  if (y < 100) y += 2000;
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return isNaN(dt.getTime()) ? null : dt;
}

function buildDate(d: string, m: string, y: string): Date | null {
  return parseDateDMY(`${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`);
}

/**
 * scripts/lib/parseVoucher.ts
 * Parses the two-row payment cells from the Excel file.
 *
 * === TOP ROW (amount) examples ===
 *   "2500"
 *   "2500+500"    → two amounts (partial + completion)
 *   "3000"
 *   "250"         → inscription fee
 *
 * === BOTTOM ROW (voucher) examples ===
 *   "BON 12(04/08/2026)"                → single voucher
 *   "BON+ 5(28/08/2026)"                → single voucher
 *   "BON +04(21/08/2026)"               → single voucher
 *   "BON 19+204(05+16/08+09/2026)"      → two vouchers: #19 on 05/08/2026, #204 on 16/09/2026
 *   "BON 20+80(05+04/08+09/2026)"       → two vouchers: #20 on 05/08, #80 on 04/09/2026
 *   "BON26+(+85)(06+05/08+09/2026)"     → two vouchers: #26 on 06/08, #85 on 05/09/2026
 *   "BON156amp+57 (01+03/09/2026)"      → two vouchers: #156 and #57
 *   "BON64+186 (04+13/09/2026)"         → two vouchers
 *   "BON+ 55+97(30+29/08/2026)"         → two vouchers
 *   "BON153+04(09+03/09+08/2026)"       → two vouchers
 *
 * Returns an array of parsed vouchers (1 or 2 per cell).
 */

export interface ParsedVoucher {
  number: number;
  amount: number;
  date: Date;
}

/**
 * Parse a payment cell (amountRaw = top row text, voucherRaw = bottom row text).
 * Returns array of ParsedVoucher (1 or 2 items).
 */
export function parsePaymentCell(
  amountRaw: string | null | undefined,
  voucherRaw: string | null | undefined
): ParsedVoucher[] {
  if (!voucherRaw || !String(voucherRaw).trim()) return [];

  const amountStr = String(amountRaw ?? '').trim();
  const voucherStr = String(voucherRaw).trim();

  // ── Parse amounts ──────────────────────────────────────────────────
  // "2500", "2500+500", "250", "3000+750"
  const amounts = amountStr
    .split('+')
    .map((s) => parseFloat(s.replace(/\s/g, '').replace(',', '.')))
    .filter((n) => !isNaN(n) && n > 0);

  // ── Normalize voucher string ───────────────────────────────────────
  let normalized = voucherStr
    .toUpperCase()
    .replace(/&AMP;/gi, '+')
    .replace(/AMP/gi, '+')
    .replace(/&/g, '+');

  // Handle patterns like '+(+85)' or '(+85)' -> '+85'
  normalized = normalized.replace(/\+\(\+?(\d+)\)/g, '+$1');
  normalized = normalized.replace(/\(\+?(\d+)\)/g, '+$1');

  // Remove spaces around '+', '(', ')'
  normalized = normalized.replace(/\s*\+\s*/g, '+');
  normalized = normalized.replace(/\s*\(\s*/g, '(');
  normalized = normalized.replace(/\s*\)\s*/g, ')');

  // Collapse multiple '+' into single '+'
  normalized = normalized.replace(/\+{2,}/g, '+');

  // Handle "BON+5" or "BON+ 5" or "BON +5" -> "BON 5"
  normalized = normalized.replace(/^BON\s*\+/i, 'BON ');

  // Ensure space between BON and number if glued together: "BON12" -> "BON 12"
  normalized = normalized.replace(/^BON(?=\d)/i, 'BON ');

  // Trim extra spaces
  normalized = normalized.replace(/\s+/g, ' ').trim();

  // ── Match Single: "BON 12(04/08/2026)" or "BON 02(16/08/2026)" ─────
  const singleMatch = normalized.match(/^BON\s*(\d+)\((\d{1,2}\/\d{1,2}\/\d{4})\)$/);
  if (singleMatch) {
    const num = parseInt(singleMatch[1], 10);
    const date = parseDateDMY(singleMatch[2]);
    if (!date) return [];
    const amount = amounts[0] ?? 0;
    return [{ number: num, amount, date }];
  }

  // ── Match Double Voucher ───────────────────────────────────────────
  const doubleResult = parseDoubleVoucher(normalized, amounts);
  if (doubleResult) return doubleResult;

  // ── Fallback 1: match single voucher with space before date ────────
  const fallbackSingle = normalized.match(/^BON\s*(\d+)\s*\(?(\d{1,2}\/\d{1,2}\/\d{4})\)?$/);
  if (fallbackSingle) {
    const num = parseInt(fallbackSingle[1], 10);
    const date = parseDateDMY(fallbackSingle[2]);
    if (date) {
      const amount = amounts[0] ?? 0;
      return [{ number: num, amount, date }];
    }
  }

  // ── Fallback 2: try to extract any BON number + any date ───────────
  const fallback = normalized.match(/BON\s*(\d+).*?(\d{1,2}\/\d{1,2}\/\d{4})/);
  if (fallback) {
    const num = parseInt(fallback[1], 10);
    const date = parseDateDMY(fallback[2]);
    if (!date) return [];
    const amount = amounts[0] ?? 0;
    return [{ number: num, amount, date }];
  }

  return [];
}

/**
 * Handles double-voucher formats like:
 *   BON 19+204(05+16/08+09/2026)   → #19 on 05/08/2026, #204 on 16/09/2026
 *   BON 20+80(05+04/08+09/2026)    → #20 on 05/08/2026, #80 on 04/09/2026
 *   BON 48+79(09+04/09/2026)       → both in same month (09/2026)
 *   BON 51+185(12+13/08+09/2026)   → #51 on 12/08/2026, #185 on 13/09/2026
 *   BON 153+04(09+03/09+08/2026)   → #153 on 09/09/2026, #04 on 03/08/2026
 *   BON 64+186(04+13/09/2026)      → both in month 09/2026
 */
function parseDoubleVoucher(normalized: string, amounts: number[]): ParsedVoucher[] | null {
  // Format A: BON n1+n2(d1+d2/m1+m2/YYYY) — different months
  // e.g. "BON 19+204(05+16/08+09/2026)" or "BON 153+04(09+03/09+08/2026)"
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
  // e.g. "BON 48+79(09+04/09/2026)" or "BON 64+186(04+13/09/2026)"
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
    /^BON\s*(\d+)\+(\d+)\((\d{1,2}\/\d{1,2}\/\d{4})\+(\d{1,2}\/\d{1,2}\/\d{4})\)$/
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
  // "04/08/2026" → DD/MM/YYYY
  const parts = str.split('/');
  if (parts.length !== 3) return null;
  const [d, m, y] = parts.map(Number);
  if (!d || !m || !y) return null;
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return isNaN(dt.getTime()) ? null : dt;
}

function buildDate(d: string, m: string, y: string): Date | null {
  return parseDateDMY(`${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`);
}

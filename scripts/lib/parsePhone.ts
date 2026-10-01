/**
 * scripts/lib/parsePhone.ts
 * Normalizes phone numbers from the Excel "رقم الهاتف" column.
 *
 * Input:  "06 61 42 80 85 / 06 59 87 49 89 / 06 97 23 28 88"
 *         "07 70 39 30 17"
 *         "06-52-04-02-36"
 *         "0661 38 20 06+0675673558-"
 *         "07-91-87-50-94///0660-81-04-75"
 *         "6540841525"
 *
 * Output: ["0661428085", "0659874989", "0697232888"]
 */
export function parsePhoneCell(rawCell: string | null | undefined): string[] {
  if (!rawCell) return [];

  let str = String(rawCell).trim();

  // Multi-slashes, backslashes, and pluses used as delimiters between numbers
  str = str.replace(/[\/\\+]+/g, '/');

  // Hyphen separating two 9/10 digit numbers (e.g. "0554900433-0778524748-")
  str = str.replace(/(\d{9,10})\s*-\s*(\d{9,10})/g, '$1/$2');
  str = str.replace(/\s+-\s+/g, '/');

  const parts = str.split('/');
  const results: string[] = [];

  for (const part of parts) {
    const cleaned = part.replace(/[^\d]/g, '');
    if (cleaned.length >= 18 && cleaned.length <= 20) {
      const p1 = normalizePhone(cleaned.slice(0, 10)) || normalizePhone(cleaned.slice(0, 9));
      const p2 = normalizePhone(cleaned.slice(10)) || normalizePhone(cleaned.slice(9));
      if (p1) results.push(p1);
      if (p2) results.push(p2);
      continue;
    }

    const normalized = normalizePhone(part.trim());
    if (normalized) {
      results.push(normalized);
    }
  }

  return Array.from(new Set(results));
}

function normalizePhone(raw: string): string | null {
  // Strip all non-digit characters
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;

  // Standard 10 digits starting with 0: "0661428085"
  if (digits.length === 10 && digits.startsWith('0')) {
    return digits;
  }

  // 9 digits:
  // - Starts with 0 (e.g. 055856005): keep as 9 or pad
  // - Starts with 5, 6, 7 (missing leading 0): "661428085" -> "0661428085"
  if (digits.length === 9) {
    if (digits.startsWith('0')) return digits;
    if (/^[567]/.test(digits)) return '0' + digits;
  }

  // 10 digits starting with 5, 6, 7 (missing leading 0 with typo or extra digit, e.g. "6540841525"):
  if (digits.length === 10 && /^[567]/.test(digits)) {
    return '0' + digits.slice(0, 9);
  }

  // 11 digits starting with 05, 06, 07: typo with 1 trailing extra digit: e.g. "0659 8507169"
  if (digits.length === 11 && /^0[567]/.test(digits)) {
    return digits.slice(0, 10);
  }

  // Fallback for 8-10 digits starting with 0 (e.g. landline) or prefix 0
  if (digits.length >= 8 && digits.length <= 10) {
    return digits.startsWith('0') ? digits : '0' + digits;
  }

  return null;
}

/**
 * scripts/lib/parsePhone.ts
 * Normalizes phone numbers from the Excel "رقم الهاتف" column.
 *
 * Input:  "06 61 42 80 85 / 06 59 87 49 89 / 06 97 23 28 88"
 *         "07 70 39 30 17"
 *         "05 54 07 01 02"
 *         "06XXXXXXXX"
 *
 * Output: ["0661428085", "0659874989", "0697232888"]
 *
 * Templates accepted:
 *   07XX XX XX XX  (10 digits, Algérie Telecom Mobilis)
 *   05XX XX XX XX  (10 digits, Ooredoo)
 *   06XX XX XX XX  (10 digits, Djezzy)
 *   Any 9-digit or 10-digit sequence starting with 0
 */
export function parsePhoneCell(rawCell: string | null | undefined): string[] {
  if (!rawCell) return [];

  // Split on "/" or "-" used as separators between numbers
  const parts = String(rawCell).split(/[\/\-]/);

  const results: string[] = [];
  for (const part of parts) {
    const normalized = normalizePhone(part.trim());
    if (normalized) results.push(normalized);
  }

  return results;
}

function normalizePhone(raw: string): string | null {
  // Strip all non-digit characters
  const digits = raw.replace(/\D/g, '');

  // Must be 9 or 10 digits and start with 0
  if ((digits.length === 9 || digits.length === 10) && digits.startsWith('0')) {
    // Pad 9-digit to 10 if it starts with 5, 6, or 7 (missing leading 0)
    if (digits.length === 9) return '0' + digits;
    return digits;
  }

  // Sometimes the "0" prefix is missing — prefix if starts with 5, 6, 7 and length 9
  if (digits.length === 9 && /^[567]/.test(digits)) {
    return '0' + digits;
  }

  return null;
}

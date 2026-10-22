import { Prisma } from "@prisma/client";

/**
 * Authoritative timezone anchor for the school management system.
 * Algeria is strictly UTC+1 year-round (no Daylight Saving Time).
 */
export const ALGIERS_TIMEZONE = "Africa/Algiers";

/**
 * Standard weekdays in the Algerian school calendar (school week begins Saturday).
 */
export type AlgiersWeekday =
  | "SATURDAY"
  | "SUNDAY"
  | "MONDAY"
  | "TUESDAY"
  | "WEDNESDAY"
  | "THURSDAY"
  | "FRIDAY";

const ALGIERS_WEEKDAYS: readonly AlgiersWeekday[] = [
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
];

export interface AlgiersDateInfo {
  year: number;
  month: number; // 1-12
  day: number;   // 1-31
  hour: number;  // 0-23
  minute: number;// 0-59
  second: number;// 0-59
  dateStr: string; // "YYYY-MM-DD"
  timeStr: string; // "HH:mm"
  weekday: AlgiersWeekday;
}

export interface AlgiersDayBounds {
  startUtc: Date;              // e.g. 2026-10-20T23:00:00.000Z
  endUtc: Date;                // e.g. 2026-10-21T22:59:59.999Z
  dateStr: string;             // "2026-10-21"
  normalizedUtcMidnight: Date; // 2026-10-21T00:00:00.000Z (used for DailyLedger key)
}

/**
 * Safely parses any date/string/number input to a valid JS Date instance.
 * For date-only ("YYYY-MM-DD") and untimezoned date-time ("YYYY-MM-DD[ T]HH:mm(:ss)?(\.\d+)?")
 * strings, anchors them strictly to local Algiers time (UTC+1, corresponding to hour - 1 in UTC).
 * Strings with explicit timezone offsets (e.g. trailing 'Z' or '+01:00') are parsed normally.
 * Returns null if input is null, undefined, empty, or unparseable.
 */
function parseToAlgiersDate(dateInput?: Date | string | number | null): Date | null {
  if (dateInput === null || dateInput === undefined || dateInput === "") {
    return null;
  }
  if (dateInput instanceof Date) {
    return isNaN(dateInput.getTime()) ? null : dateInput;
  }
  if (typeof dateInput === "number") {
    if (!isFinite(dateInput)) return null;
    const d = new Date(dateInput);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof dateInput === "string") {
    const trimmed = dateInput.trim();
    if (!trimmed) return null;

    // Support both date-only ("YYYY-MM-DD") and untimezoned date-time ("YYYY-MM-DD[ T]HH:mm(:ss)?(\.\d+)?")
    // Anchor strictly to local Algiers time (hour - 1 in UTC)
    const match = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?)?$/.exec(trimmed);
    if (match) {
      const year = parseInt(match[1], 10);
      const month = parseInt(match[2], 10);
      const day = parseInt(match[3], 10);
      const hour = match[4] !== undefined ? parseInt(match[4], 10) : 0;
      const minute = match[5] !== undefined ? parseInt(match[5], 10) : 0;
      const second = match[6] !== undefined ? parseInt(match[6], 10) : 0;
      const millisecond = match[7] !== undefined ? parseInt(match[7].padEnd(3, "0").slice(0, 3), 10) : 0;

      // In Algiers (UTC+1), local time H corresponds to UTC H - 1
      return new Date(Date.UTC(year, month - 1, day, hour - 1, minute, second, millisecond));
    }

    const d = new Date(trimmed);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/**
 * Extracts decomposed date/time parts anchored strictly to Africa/Algiers (UTC+1).
 * Constant O(1) performance using shifted UTC arithmetic.
 */
export function getAlgiersDateInfo(dateInput?: Date | string | number | null): AlgiersDateInfo {
  const d = parseToAlgiersDate(dateInput) ?? new Date();
  // Africa/Algiers is strictly UTC+1 (+3,600,000 ms) year-round with no DST.
  const shifted = new Date(d.getTime() + 3600000);

  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth() + 1;
  const day = shifted.getUTCDate();
  const hour = shifted.getUTCHours();
  const minute = shifted.getUTCMinutes();
  const second = shifted.getUTCSeconds();
  const weekday = ALGIERS_WEEKDAYS[shifted.getUTCDay()];

  const dateStr = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const timeStr = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;

  return { year, month, day, hour, minute, second, dateStr, timeStr, weekday };
}

/**
 * Returns today's calendar date in Africa/Algiers formatted as "YYYY-MM-DD".
 * Avoids UTC date mismatch when local time is between 00:00 and 01:00 AM.
 */
export function getAlgiersTodayDateString(): string {
  return getAlgiersDateInfo().dateStr;
}

/**
 * Constructs the exact UTC database query bounds and normalized ledger key for
 * an Algerian calendar business day.
 *
 * An Algerian business day D (00:00:00.000 to 23:59:59.999 local) corresponds to:
 * - startUtc: (D - 1) 23:00:00.000Z
 * - endUtc:   D 22:59:59.999Z
 * - normalizedUtcMidnight: D 00:00:00.000Z (used as key in DailyLedger table)
 */
export function getAlgiersDayBounds(dateInput?: Date | string | number | null): AlgiersDayBounds {
  let year: number;
  let month: number;
  let day: number;

  if (typeof dateInput === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateInput.trim())) {
    const parts = dateInput.trim().split("-");
    year = parseInt(parts[0], 10);
    month = parseInt(parts[1], 10);
    day = parseInt(parts[2], 10);
  } else {
    const info = getAlgiersDateInfo(dateInput);
    year = info.year;
    month = info.month;
    day = info.day;
  }

  const dateStr = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  // In Date.UTC, hour -1 automatically rolls back to previous day 23:00 across month/year/leap boundaries
  const startUtc = new Date(Date.UTC(year, month - 1, day, -1, 0, 0, 0));
  const endUtc = new Date(Date.UTC(year, month - 1, day, 22, 59, 59, 999));
  const normalizedUtcMidnight = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));

  return { startUtc, endUtc, dateStr, normalizedUtcMidnight };
}

/**
 * Normalizes any timestamp to UTC midnight corresponding to its Algerian calendar day.
 * Eliminates midnight boundary shift for transactions between 00:00 and 01:00 AM local time.
 */
export function normalizeDateToAlgiersStartOfDay(dateInput: Date | string | number): Date {
  return getAlgiersDayBounds(dateInput).normalizedUtcMidnight;
}

/**
 * Formats a date anchored strictly to Africa/Algiers timezone.
 * Returns "" if input is null, undefined, empty, or invalid (no misleading fallbacks).
 * Default output: "DD/MM/YYYY" with ASCII digits.
 */
export function formatAlgiersDate(
  dateInput: Date | string | number | null | undefined,
  locale?: string,
  options?: Intl.DateTimeFormatOptions
): string {
  const d = parseToAlgiersDate(dateInput);
  if (!d) return "";

  if (options) {
    return new Intl.DateTimeFormat(locale || "fr-DZ", {
      ...options,
      timeZone: ALGIERS_TIMEZONE,
    }).format(d);
  }

  const info = getAlgiersDateInfo(d);
  return `${String(info.day).padStart(2, "0")}/${String(info.month).padStart(2, "0")}/${info.year}`;
}

/**
 * Formats a time strictly as "HH:mm" in Africa/Algiers timezone.
 * Returns "" if input is null, undefined, empty, or invalid.
 */
export function formatAlgiersTime(
  dateInput: Date | string | number | null | undefined,
  _locale?: string
): string {
  const d = parseToAlgiersDate(dateInput);
  if (!d) return "";

  const info = getAlgiersDateInfo(d);
  return info.timeStr;
}

/**
 * Formats date and time strictly as "DD/MM/YYYY HH:mm" in Africa/Algiers timezone.
 * Returns "" if input is null, undefined, empty, or invalid.
 */
export function formatAlgiersDateTime(
  dateInput: Date | string | number | null | undefined,
  locale?: string
): string {
  const d = parseToAlgiersDate(dateInput);
  if (!d) return "";

  const dateStr = formatAlgiersDate(d, locale);
  const timeStr = formatAlgiersTime(d, locale);
  return timeStr ? `${dateStr} ${timeStr}` : dateStr;
}

/**
 * Deterministically formats any number, numeric string, or Prisma.Decimal into
 * a standard grouped number string without SSR hydration divergence.
 *
 * Separator: ASCII space (' ', U+0020)
 * Decimal separator: comma (',', U+002C) for fractional Dinars, omitted for whole numbers
 * Edge cases: null, undefined, '', NaN, +/-Infinity -> '0'
 */
export function formatNumber(
  amount: number | string | Prisma.Decimal | null | undefined
): string {
  if (amount === null || amount === undefined || amount === "") {
    return "0";
  }

  let num: number;
  if (typeof amount === "number") {
    num = amount;
  } else if (
    typeof amount === "object" &&
    amount !== null &&
    typeof (amount as any).toNumber === "function"
  ) {
    num = (amount as any).toNumber();
  } else {
    num = Number(amount);
  }

  if (isNaN(num) || !isFinite(num)) {
    return "0";
  }

  if (Object.is(num, -0)) {
    return "0";
  }

  const isNegative = num < 0;
  const absNum = Math.abs(num);

  // Round to max 2 decimal places to prevent IEEE 754 float precision artifacts
  const rounded = Math.round(absNum * 100) / 100;
  if (rounded === 0) {
    return "0";
  }
  const parts = rounded.toString().split(".");
  const integerPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const decimalPart = parts[1];

  let result = (isNegative ? "-" : "") + integerPart;
  if (decimalPart) {
    result += "," + decimalPart;
  }
  return result;
}

/**
 * Deterministically formats an amount into Algerian Dinars (DZD) with localized currency symbol.
 * Guarantees zero SSR hydration mismatches across Node.js and client browsers:
 * - Uses ASCII space (' ', U+0020) as thousands separator.
 * - Arabic (locale starts with "ar"): " د.ج"
 * - French / Default: " DZD"
 */
export function formatDZD(
  amount: number | string | Prisma.Decimal | null | undefined,
  locale?: string
): string {
  const isAr = typeof locale === "string" && locale.startsWith("ar");
  const formatted = formatNumber(amount);
  return isAr ? `${formatted} د.ج` : `${formatted} DZD`;
}

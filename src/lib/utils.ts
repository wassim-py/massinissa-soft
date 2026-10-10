// IT APPEARS THAT BIG CALENDAR SHOWS THE LAST WEEK WHEN THE CURRENT DAY IS A WEEKEND.
// FOR THIS REASON WE'LL GET THE LAST WEEK AS THE REFERENCE WEEK.
// IN THE TUTORIAL WE'RE TAKING THE NEXT WEEK AS THE REFERENCE WEEK.

const getLatestMonday = (): Date => {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const latestMonday = today;
  latestMonday.setDate(today.getDate() - daysSinceMonday);
  return latestMonday;
};

export const adjustScheduleToCurrentWeek = (
  lessons: { title: string; start: Date; end: Date }[]
): { title: string; start: Date; end: Date }[] => {
  const latestMonday = getLatestMonday();

  return lessons.map((lesson) => {
    const lessonDayOfWeek = lesson.start.getDay();

    const daysFromMonday = lessonDayOfWeek === 0 ? 6 : lessonDayOfWeek - 1;

    const adjustedStartDate = new Date(latestMonday);

    adjustedStartDate.setDate(latestMonday.getDate() + daysFromMonday);
    adjustedStartDate.setHours(
      lesson.start.getHours(),
      lesson.start.getMinutes(),
      lesson.start.getSeconds()
    );
    const adjustedEndDate = new Date(adjustedStartDate);
    adjustedEndDate.setHours(
      lesson.end.getHours(),
      lesson.end.getMinutes(),
      lesson.end.getSeconds()
    );

    return {
      title: lesson.title,
      start: adjustedStartDate,
      end: adjustedEndDate,
    };
  });
};

/**
 * Recursively converts Decimal and BigInt objects to standard JavaScript numbers,
 * making them safe to pass across the Server Component -> Client Component boundary.
 */
export function serializeForClient<T>(val: T): T {
  if (val === null || val === undefined) return val;
  if (typeof val === "bigint") return Number(val) as any;
  if (typeof val === "object") {
    if (typeof (val as any).toNumber === "function") {
      return (val as any).toNumber();
    }
    if ((val as any).constructor && (val as any).constructor.name === "Decimal") {
      return Number(val) as any;
    }
    if (val instanceof Date) {
      return val;
    }
    if (Array.isArray(val)) {
      return val.map(serializeForClient) as any;
    }
    const res: any = {};
    for (const [k, v] of Object.entries(val)) {
      res[k] = serializeForClient(v);
    }
    return res;
  }
  return val;
}

/**
 * Splits an Algerian full name into surname (اللقب) and name (الاسم).
 * In Algeria, full names are written with Family Name first.
 */
export function splitFullName(fullName?: string | null): { surname: string; name: string } {
  if (!fullName) return { surname: "", name: "" };
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { surname: "", name: "" };
  if (parts.length === 1) return { surname: parts[0], name: "" };

  const compoundPrefixes = [
    "بن", "أيت", "ايت", "آيت", "بو", "ولد", "بل", "عبد",
    "ben", "ait", "bou", "ould", "bel", "el", "ibn", "abd"
  ];
  if (parts.length >= 3 && compoundPrefixes.includes(parts[0].toLowerCase())) {
    return {
      surname: parts.slice(0, 2).join(" "),
      name: parts.slice(2).join(" "),
    };
  }
  return {
    surname: parts[0],
    name: parts.slice(1).join(" "),
  };
}

/**
 * Combines surname (اللقب) and name (الاسم) in Algerian order (Family Name first).
 */
export function formatFullName(surname?: string | null, name?: string | null): string {
  return [surname?.trim(), name?.trim()].filter(Boolean).join(" ");
}

export const dayToSaturdayOffset: Record<string, number> = {
  SATURDAY: 0,
  SUNDAY: 1,
  MONDAY: 2,
  TUESDAY: 3,
  WEDNESDAY: 4,
  THURSDAY: 5,
  FRIDAY: 6,
};

export function getCurrentWeekSaturday(referenceDate: Date = new Date()): Date {
  const d = new Date(referenceDate);
  const dayOfWeek = d.getDay(); // 0 is Sun, ..., 6 is Sat
  const diffToSaturday = (dayOfWeek + 1) % 7; // Sat -> 0, Sun -> 1, ..., Fri -> 6
  const currentSaturday = new Date(d);
  currentSaturday.setDate(d.getDate() - diffToSaturday);
  currentSaturday.setHours(0, 0, 0, 0);
  return currentSaturday;
}

export function getLessonDateTime(day: string, time: string, dateStr?: string | null): Date {
  const [hours, minutes] = (time || "00:00").split(":").map(Number);

  let year: number;
  let month: number;
  let dayNum: number;

  if (dateStr && dateStr.trim().length > 0) {
    const parts = dateStr.trim().split("-").map(Number);
    if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
      year = parts[0];
      month = parts[1] - 1; // 0-indexed in JS Date
      dayNum = parts[2];
    } else {
      const targetSaturday = getCurrentWeekSaturday(new Date());
      const offset = dayToSaturdayOffset[(day || "").toUpperCase()] ?? 0;
      const targetDate = new Date(targetSaturday);
      targetDate.setDate(targetSaturday.getDate() + offset);
      year = targetDate.getFullYear();
      month = targetDate.getMonth();
      dayNum = targetDate.getDate();
    }
  } else {
    // Normal lesson: use current week's corresponding day as base reference
    const targetSaturday = getCurrentWeekSaturday(new Date());
    const offset = dayToSaturdayOffset[(day || "").toUpperCase()] ?? 0;
    const targetDate = new Date(targetSaturday);
    targetDate.setDate(targetSaturday.getDate() + offset);
    year = targetDate.getFullYear();
    month = targetDate.getMonth();
    dayNum = targetDate.getDate();
  }

  // School timezone is UTC+1 (Africa/Algiers, constant without DST).
  // Database timestamps are stored in UTC; subtracting 1 hour from local time
  // guarantees the saved UTC time exactly matches the entered local hour when read back.
  return new Date(Date.UTC(year, month, dayNum, (hours || 0) - 1, minutes || 0, 0, 0));
}

export interface AlgiersDateInfo {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: "SATURDAY" | "SUNDAY" | "MONDAY" | "TUESDAY" | "WEDNESDAY" | "THURSDAY" | "FRIDAY";
  dateStr: string; // YYYY-MM-DD in Africa/Algiers
  timeStr: string; // HH:mm in Africa/Algiers
}

export function getAlgiersDateInfo(date: Date | string = new Date()): AlgiersDateInfo {
  const d = date instanceof Date ? date : new Date(date);
  const safeDate = isNaN(d.getTime()) ? new Date() : d;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Algiers",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "long",
  }).formatToParts(safeDate);
  const m: Record<string, string> = {};
  for (const p of parts) {
    m[p.type] = p.value;
  }
  const rawHour = parseInt(m.hour || "0", 10);
  const hour = rawHour === 24 ? 0 : rawHour;
  const minute = parseInt(m.minute || "0", 10);
  const year = parseInt(m.year || "2026", 10);
  const month = parseInt(m.month || "1", 10);
  const day = parseInt(m.day || "1", 10);
  const weekday = (m.weekday || "SATURDAY").toUpperCase() as AlgiersDateInfo["weekday"];
  const dateStr = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const timeStr = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  return { year, month, day, hour, minute, weekday, dateStr, timeStr };
}

export interface AlgiersWeekBounds {
  startOfWeek: Date;
  endOfWeek: Date;
  dayDates: Record<string, string>; // { SATURDAY: "YYYY-MM-DD", ..., FRIDAY: "YYYY-MM-DD" }
}

export function getAlgiersWeekBounds(
  weekOffset: number = 0,
  referenceDate: Date = new Date()
): AlgiersWeekBounds {
  const refInfo = getAlgiersDateInfo(referenceDate);
  const refMiddayUtc = new Date(
    Date.UTC(refInfo.year, refInfo.month - 1, refInfo.day + weekOffset * 7, 12, 0, 0, 0)
  );
  const dow = refMiddayUtc.getUTCDay(); // 0 = Sun, ..., 6 = Sat
  const diffToSaturday = (dow + 1) % 7;
  const satMiddayUtc = new Date(refMiddayUtc.getTime() - diffToSaturday * 86400000);

  const satYear = satMiddayUtc.getUTCFullYear();
  const satMonth = satMiddayUtc.getUTCMonth();
  const satDay = satMiddayUtc.getUTCDate();

  // Africa/Algiers is UTC+1 (no DST). 00:00:00 Algiers = -1h UTC; 23:59:59.999 Algiers = 22:59:59.999 UTC
  const startOfWeek = new Date(Date.UTC(satYear, satMonth, satDay, -1, 0, 0, 0));
  const endOfWeek = new Date(Date.UTC(satYear, satMonth, satDay + 6, 22, 59, 59, 999));

  const orderedDays = [
    "SATURDAY",
    "SUNDAY",
    "MONDAY",
    "TUESDAY",
    "WEDNESDAY",
    "THURSDAY",
    "FRIDAY",
  ];
  const dayDates: Record<string, string> = {};
  for (let i = 0; i < 7; i++) {
    const d = new Date(Date.UTC(satYear, satMonth, satDay + i, 12, 0, 0, 0));
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dayNum = String(d.getUTCDate()).padStart(2, "0");
    dayDates[orderedDays[i]] = `${y}-${m}-${dayNum}`;
  }

  return { startOfWeek, endOfWeek, dayDates };
}

export function projectLessonTimeToDateStr(
  startsAt: Date | string,
  endsAt: Date | string,
  targetDateStr: string
): { startsAt: Date; endsAt: Date } {
  const sDate = new Date(startsAt);
  const eDate = new Date(endsAt);
  const durationMs = Math.max(0, eDate.getTime() - sDate.getTime());
  const sInfo = getAlgiersDateInfo(sDate);
  const [year, month, day] = targetDateStr.split("-").map(Number);
  if (!year || !month || !day) {
    return { startsAt: sDate, endsAt: eDate };
  }
  const projectedStartsAt = new Date(
    Date.UTC(year, month - 1, day, sInfo.hour - 1, sInfo.minute, 0, 0)
  );
  const projectedEndsAt = new Date(projectedStartsAt.getTime() + durationMs);
  return { startsAt: projectedStartsAt, endsAt: projectedEndsAt };
}

/**
 * Deduplicates recurring lessons by (classId, weekday, startTime, endTime) and projects them
 * onto the exact calendar dates of the requested week.
 * If a Lesson row already exists in the DB for that exact date in the week, it is selected directly
 * so its date-specific id, attendances, and isTeacherAbsent are preserved.
 */
export function resolveRecurringLessonsForWeek<T extends Record<string, any>>(
  rawLessons: T[],
  weekBounds: AlgiersWeekBounds
): Array<T & { instanceDate: string }> {
  const oneOffs: Array<T & { instanceDate: string }> = [];
  const recurringGroups = new Map<string, T[]>();

  for (const r of rawLessons) {
    const isOneOff = Boolean(r.isExtra || r.isCatchUp || r.isFree || r.isWorkshop);
    const sInfo = getAlgiersDateInfo(r.startsAt);
    if (isOneOff) {
      const d = new Date(r.startsAt);
      if (d >= weekBounds.startOfWeek && d <= weekBounds.endOfWeek) {
        oneOffs.push({ ...r, instanceDate: sInfo.dateStr });
      }
      continue;
    }

    const eInfo = getAlgiersDateInfo(r.endsAt);
    const slotKey = `${r.classId ?? 0}-${sInfo.weekday}-${sInfo.timeStr}-${eInfo.timeStr}`;
    const group = recurringGroups.get(slotKey) || [];
    group.push(r);
    recurringGroups.set(slotKey, group);
  }

  const resolvedRecurring: Array<T & { instanceDate: string }> = [];

  for (const [, group] of recurringGroups.entries()) {
    if (group.length === 0) continue;
    const sampleInfo = getAlgiersDateInfo(group[0].startsAt);
    const targetDateStr = weekBounds.dayDates[sampleInfo.weekday] || sampleInfo.dateStr;

    const matchingOnTargetDate = group.filter(
      (item) => getAlgiersDateInfo(item.startsAt).dateStr === targetDateStr
    );

    if (matchingOnTargetDate.length > 0) {
      matchingOnTargetDate.sort((a, b) => {
        const aAtt = Array.isArray(a.attendances) ? a.attendances.length : 0;
        const bAtt = Array.isArray(b.attendances) ? b.attendances.length : 0;
        if (aAtt !== bAtt) return bAtt - aAtt;
        if (Boolean(a.isTeacherAbsent) !== Boolean(b.isTeacherAbsent)) {
          return a.isTeacherAbsent ? -1 : 1;
        }
        return (Number(b.id) || 0) - (Number(a.id) || 0);
      });
      const chosen = matchingOnTargetDate[0];
      resolvedRecurring.push({
        ...chosen,
        instanceDate: targetDateStr,
      });
    } else {
      const sorted = [...group].sort((a, b) => {
        const tDiff = new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime();
        if (tDiff !== 0) return tDiff;
        return (Number(b.id) || 0) - (Number(a.id) || 0);
      });
      const template = sorted[0];
      const projected = projectLessonTimeToDateStr(
        template.startsAt,
        template.endsAt,
        targetDateStr
      );
      const cloned: any = {
        ...template,
        startsAt: projected.startsAt,
        endsAt: projected.endsAt,
        isTeacherAbsent: false,
        instanceDate: targetDateStr,
      };
      if ("startTime" in cloned) cloned.startTime = projected.startsAt;
      if ("endTime" in cloned) cloned.endTime = projected.endsAt;
      if (Array.isArray(cloned.attendances)) cloned.attendances = [];
      resolvedRecurring.push(cloned);
    }
  }

  return [...resolvedRecurring, ...oneOffs].sort(
    (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
  );
}

/**
 * Resolves and deduplicates recurring + one-off lessons occurring on a specific single date (e.g. today).
 */
export function resolveRecurringLessonsForDate<T extends Record<string, any>>(
  rawLessons: T[],
  targetDate: Date = new Date()
): Array<T & { instanceDate: string }> {
  const targetInfo = getAlgiersDateInfo(targetDate);
  const weekBounds = getAlgiersWeekBounds(0, targetDate);
  const weekLessons = resolveRecurringLessonsForWeek(rawLessons, weekBounds);
  return weekLessons.filter((l) => l.instanceDate === targetInfo.dateStr);
}


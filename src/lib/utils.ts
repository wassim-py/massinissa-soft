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

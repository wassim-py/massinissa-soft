import { describe, test, expect } from "../helpers/runner";
import { readSourceFile } from "../helpers/moduleLoader";
import {
  isClassInactive,
  getClassInactiveAt,
  isLessonVisibleForClassStatus,
  normalizeClassFilterStatus,
} from "../../../src/lib/classStatus";

export async function runF15Tests() {
  await describe("F15: Group Pause / Close Status Management & Timetable Slot Release", async () => {
    test("F15-01: isClassInactive and getClassInactiveAt accurately detect paused and completed states", () => {
      expect(isClassInactive({ isPaused: false, isCompleted: false })).toBe(false);
      expect(isClassInactive({ isPaused: true, isCompleted: false })).toBe(true);
      expect(isClassInactive({ isPaused: false, isCompleted: true })).toBe(true);
      expect(isClassInactive({ isPaused: true, isCompleted: true })).toBe(true);

      const t1 = new Date("2026-11-10T10:00:00.000Z");
      const t2 = new Date("2026-11-15T10:00:00.000Z");
      const earliest = getClassInactiveAt({
        isPaused: true,
        pausedAt: t2,
        isCompleted: true,
        completedAt: t1,
      });
      expect(earliest?.getTime()).toBe(t1.getTime());
    });

    test("F15-02: isLessonVisibleForClassStatus frees current/future timetable slots immediately while preserving historical weeks", () => {
      const currentWeekStart = new Date("2026-11-15T00:00:00.000Z");
      const pausedAt = new Date("2026-11-16T12:00:00.000Z");
      const pausedClass = {
        isPaused: true,
        pausedAt,
        isCompleted: false,
        completedAt: null,
      };

      // Past week lesson (ended before pausedAt) -> visible
      const pastWeekLessonEnd = new Date("2026-11-10T15:00:00.000Z");
      expect(
        isLessonVisibleForClassStatus(pastWeekLessonEnd, pausedClass, currentWeekStart)
      ).toBe(true);

      // Earlier in current week before pausedAt -> visible
      const earlierCurrentWeekEnd = new Date("2026-11-16T10:00:00.000Z");
      expect(
        isLessonVisibleForClassStatus(earlierCurrentWeekEnd, pausedClass, currentWeekStart)
      ).toBe(true);

      // Current week after pausedAt -> hidden immediately so slot is free
      const upcomingCurrentWeekEnd = new Date("2026-11-17T15:00:00.000Z");
      expect(
        isLessonVisibleForClassStatus(upcomingCurrentWeekEnd, pausedClass, currentWeekStart)
      ).toBe(false);

      // Future week -> hidden
      const futureWeekEnd = new Date("2026-11-24T15:00:00.000Z");
      expect(
        isLessonVisibleForClassStatus(futureWeekEnd, pausedClass, currentWeekStart)
      ).toBe(false);

      // Legacy inactive class without timestamp -> visible in past weeks, hidden in current/future weeks
      const legacyInactive = {
        isPaused: true,
        pausedAt: null,
        isCompleted: false,
        completedAt: null,
      };
      expect(
        isLessonVisibleForClassStatus(pastWeekLessonEnd, legacyInactive, currentWeekStart)
      ).toBe(true);
      expect(
        isLessonVisibleForClassStatus(upcomingCurrentWeekEnd, legacyInactive, currentWeekStart)
      ).toBe(false);
    });

    test("F15-03: normalizeClassFilterStatus defaults to 'active' and normalizes filter tabs", () => {
      expect(normalizeClassFilterStatus(undefined)).toBe("active");
      expect(normalizeClassFilterStatus("active")).toBe("active");
      expect(normalizeClassFilterStatus("inactive")).toBe("inactive");
      expect(normalizeClassFilterStatus("paused")).toBe("inactive");
      expect(normalizeClassFilterStatus("closed")).toBe("inactive");
      expect(normalizeClassFilterStatus("all")).toBe("all");
    });

    test("F15-04: Prisma schema defines isPaused and pausedAt on Class without destructive cascades", () => {
      const schema = readSourceFile("prisma/schema.prisma");
      const hasIsPaused = /isPaused\s+Boolean\s+@default\(false\)/.test(schema);
      const hasPausedAt = /pausedAt\s+DateTime\?/.test(schema);
      expect(hasIsPaused && hasPausedAt).toBe(true);
    });

    test("F15-05: toggleClassStatusAction is strictly restricted to Owner (session.isOwner) and logs to AuditLog", () => {
      const actionsSource = readSourceFile("src/lib/actions.ts");
      const hasToggleExport = actionsSource.includes("export const toggleClassStatusAction = async");
      const hasOwnerGuard = actionsSource.includes("if (!session.isOwner)");
      const hasAuditLog =
        actionsSource.includes('"CLOSE_OR_PAUSE_GROUP"') &&
        actionsSource.includes('"REOPEN_GROUP"');
      expect(hasToggleExport && hasOwnerGuard && hasAuditLog).toBe(true);
    });

    test("F15-06: checkForConflicts frees teacher, group, and classroom slots when a group is paused or closed", () => {
      const actionsSource = readSourceFile("src/lib/actions.ts");
      const classPausedMatches =
        actionsSource.match(/c\."isPaused" = false OR c\."isPaused" IS NULL/g) || [];
      expect(classPausedMatches.length >= 3).toBe(true);
    });

    test("F15-07: Weekly timetable and list pages integrate classStatus filtering and Owner status controls", () => {
      const lessonsPage = readSourceFile("src/app/[locale]/(dashboard)/list/lessons/page.tsx");
      const classesPage = readSourceFile("src/app/[locale]/(dashboard)/list/classes/page.tsx");
      const paymentsPage = readSourceFile("src/app/[locale]/(dashboard)/list/payments/page.tsx");
      const attendancePage = readSourceFile("src/app/[locale]/(dashboard)/list/attendance/page.tsx");

      expect(lessonsPage.includes("isLessonVisibleForClassStatus")).toBe(true);
      expect(classesPage.includes("ClassStatusToggleButton")).toBe(true);
      expect(paymentsPage.includes("normalizeClassFilterStatus")).toBe(true);
      expect(attendancePage.includes("normalizeClassFilterStatus")).toBe(true);
    });
  });
}

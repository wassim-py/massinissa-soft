import { describe, test, expect } from "../helpers/runner";
import { readSourceFile } from "../helpers/moduleLoader";
import {
  buildAlgiersTimestamp,
  buildSingleOccurrenceTargetInWeek,
  computeRetirementCutoff,
  doesSameRecurrenceSeriesMatch,
  getLessonSlotKey,
  getNextUpcomingOccurrence,
  isLessonRowFrozen,
  isRecurringOccurrenceActive,
} from "../../../src/lib/lessonRecurrence";
import {
  getAlgiersDateInfo,
  getAlgiersWeekBounds,
  resolveActiveFormationSchedule,
  resolveRecurringLessonsForDate,
  resolveRecurringLessonsForWeek,
} from "../../../src/lib/utils";

export async function runF16Tests() {
  await describe("F16: Normal Lesson History Preservation & Non-Destructive Future Updates", async () => {
    test("F16-01 (A1): isLessonRowFrozen freezes ended sessions and any session with attendance, catch-up, voucher, or teacher absence", () => {
      const now = buildAlgiersTimestamp("2026-11-18", "12:00"); // Wed 12:00 Algiers

      // Ended earlier today -> frozen
      expect(
        isLessonRowFrozen(
          {
            startsAt: buildAlgiersTimestamp("2026-11-18", "09:00"),
            endsAt: buildAlgiersTimestamp("2026-11-18", "11:00"),
            isTeacherAbsent: false,
            _count: { attendances: 0, missedByCatchUps: 0, catchUpVisitsHosted: 0, vouchers: 0 },
          },
          now
        )
      ).toBe(true);

      // Upcoming today, unused -> NOT frozen (mutable)
      expect(
        isLessonRowFrozen(
          {
            startsAt: buildAlgiersTimestamp("2026-11-18", "14:00"),
            endsAt: buildAlgiersTimestamp("2026-11-18", "16:00"),
            isTeacherAbsent: false,
            _count: { attendances: 0, missedByCatchUps: 0, catchUpVisitsHosted: 0, vouchers: 0 },
          },
          now
        )
      ).toBe(false);

      // Upcoming today, already has attendance -> frozen
      expect(
        isLessonRowFrozen(
          {
            startsAt: buildAlgiersTimestamp("2026-11-18", "14:00"),
            endsAt: buildAlgiersTimestamp("2026-11-18", "16:00"),
            isTeacherAbsent: false,
            _count: { attendances: 3, missedByCatchUps: 0, catchUpVisitsHosted: 0, vouchers: 0 },
          },
          now
        )
      ).toBe(true);

      // Upcoming today, teacher marked absent -> frozen
      expect(
        isLessonRowFrozen(
          {
            startsAt: buildAlgiersTimestamp("2026-11-18", "14:00"),
            endsAt: buildAlgiersTimestamp("2026-11-18", "16:00"),
            isTeacherAbsent: true,
            _count: { attendances: 0, missedByCatchUps: 0, catchUpVisitsHosted: 0, vouchers: 0 },
          },
          now
        )
      ).toBe(true);
    });

    test("F16-02 (A2): getNextUpcomingOccurrence picks the very next matching weekday/time from now and skips frozen same-day dates", () => {
      const wedNoon = buildAlgiersTimestamp("2026-11-18", "12:00"); // Wed Nov 18 12:00

      // Wed updating Mon -> Thu starts THIS Thursday (Nov 19)
      const monToThu = getNextUpcomingOccurrence({
        day: "THURSDAY",
        startTime: "14:00",
        endTime: "16:00",
        now: wedNoon,
      });
      expect(monToThu.dateStr).toBe("2026-11-19");

      // Wed updating Thu -> Mon cancels this Thu and starts NEXT Monday (Nov 23), never past Mon Nov 16
      const thuToMon = getNextUpcomingOccurrence({
        day: "MONDAY",
        startTime: "10:00",
        endTime: "12:00",
        now: wedNoon,
      });
      expect(thuToMon.dateStr).toBe("2026-11-23");

      // Same-day upcoming slot (unused) starts TODAY (Wed Nov 18 15:00-17:00)
      const sameDayUnused = getNextUpcomingOccurrence({
        day: "WEDNESDAY",
        startTime: "15:00",
        endTime: "17:00",
        now: wedNoon,
      });
      expect(sameDayUnused.dateStr).toBe("2026-11-18");

      // Same-day slot where today ALREADY has a frozen session skips today and starts NEXT Wed (Nov 25)
      const sameDayFrozen = getNextUpcomingOccurrence({
        day: "WEDNESDAY",
        startTime: "15:00",
        endTime: "17:00",
        now: wedNoon,
        skipDates: new Set(["2026-11-18"]),
      });
      expect(sameDayFrozen.dateStr).toBe("2026-11-25");

      // Same-day slot that already ended today starts NEXT Wed (Nov 25)
      const wedEvening = buildAlgiersTimestamp("2026-11-18", "18:00");
      const alreadyEndedToday = getNextUpcomingOccurrence({
        day: "WEDNESDAY",
        startTime: "14:00",
        endTime: "16:00",
        now: wedEvening,
      });
      expect(alreadyEndedToday.dateStr).toBe("2026-11-25");

      // Friday updating to Saturday starts TOMORROW Saturday (next Algerian week)
      const friAfternoon = buildAlgiersTimestamp("2026-11-20", "15:00");
      const friToSat = getNextUpcomingOccurrence({
        day: "SATURDAY",
        startTime: "09:00",
        endTime: "11:00",
        now: friAfternoon,
      });
      expect(friToSat.dateStr).toBe("2026-11-21");
    });

    test("F16-03 (A1+A2+A3): Moving Sat 10:00 (Room A) -> Mon 14:00 (Room B) mid-week conserves past dates/rooms and only changes future weeks", () => {
      const wedNoon = buildAlgiersTimestamp("2026-11-18", "12:00");
      const nextMon = getNextUpcomingOccurrence({
        day: "MONDAY",
        startTime: "14:00",
        endTime: "16:00",
        now: wedNoon,
      });

      const oldPastRow1 = {
        id: 10,
        classId: 1,
        classroomId: 101,
        teacherId: "T1",
        branchId: 1,
        startsAt: buildAlgiersTimestamp("2026-11-07", "10:00"),
        endsAt: buildAlgiersTimestamp("2026-11-07", "12:00"),
        isExtra: false,
        isCatchUp: false,
        isFree: false,
        isSingleOccurrence: false,
        recurrenceStartAt: null,
        recurrenceEndAt: computeRetirementCutoff(
          [{ endsAt: buildAlgiersTimestamp("2026-11-14", "12:00") }],
          wedNoon
        ),
      };
      const oldPastRow2 = {
        ...oldPastRow1,
        id: 11,
        startsAt: buildAlgiersTimestamp("2026-11-14", "10:00"),
        endsAt: buildAlgiersTimestamp("2026-11-14", "12:00"),
      };
      const newFutureRow = {
        id: 20,
        classId: 1,
        classroomId: 202,
        teacherId: "T2",
        branchId: 2,
        startsAt: nextMon.startsAt,
        endsAt: nextMon.endsAt,
        isExtra: false,
        isCatchUp: false,
        isFree: false,
        isSingleOccurrence: false,
        recurrenceStartAt: nextMon.startsAt,
        recurrenceEndAt: null,
      };
      const allLessons = [oldPastRow1, oldPastRow2, newFutureRow];

      // Past week (-2: Oct 31 - Nov 6, unmaterialized): ONLY old Sat 10:00 Room A
      const pastWeekMinus2 = resolveRecurringLessonsForWeek(
        allLessons,
        getAlgiersWeekBounds(-2, wedNoon)
      );
      expect(pastWeekMinus2.length).toBe(1);
      expect(pastWeekMinus2[0].instanceDate).toBe("2026-10-31");
      expect(pastWeekMinus2[0].classroomId).toBe(101);
      expect(pastWeekMinus2[0].teacherId).toBe("T1");

      // Past week (-1: Nov 7 - Nov 13): ONLY old Sat Nov 7 10:00 Room A (exact DB row id=10)
      const pastWeekMinus1 = resolveRecurringLessonsForWeek(
        allLessons,
        getAlgiersWeekBounds(-1, wedNoon)
      );
      expect(pastWeekMinus1.length).toBe(1);
      expect(pastWeekMinus1[0].id).toBe(10);
      expect(pastWeekMinus1[0].instanceDate).toBe("2026-11-07");
      expect(pastWeekMinus1[0].classroomId).toBe(101);

      // Current week (0: Nov 14 - Nov 20): ONLY Sat Nov 14 10:00 Room A (Mon Nov 16 NOT retroactively shown!)
      const currentWeek = resolveRecurringLessonsForWeek(
        allLessons,
        getAlgiersWeekBounds(0, wedNoon)
      );
      expect(currentWeek.length).toBe(1);
      expect(currentWeek[0].id).toBe(11);
      expect(currentWeek[0].instanceDate).toBe("2026-11-14");
      expect(currentWeek[0].classroomId).toBe(101);

      // Next week (+1: Nov 21 - Nov 27): ONLY Mon Nov 23 14:00 Room B (old Sat Nov 21 is GONE!)
      const nextWeek = resolveRecurringLessonsForWeek(
        allLessons,
        getAlgiersWeekBounds(1, wedNoon)
      );
      expect(nextWeek.length).toBe(1);
      expect(nextWeek[0].id).toBe(20);
      expect(nextWeek[0].instanceDate).toBe("2026-11-23");
      expect(nextWeek[0].classroomId).toBe(202);
      expect(nextWeek[0].teacherId).toBe("T2");
      expect(nextWeek[0].branchId).toBe(2);

      // Two weeks ahead (+2: Nov 28 - Dec 4): ONLY Mon Nov 30 14:00 Room B
      const futureWeek = resolveRecurringLessonsForWeek(
        allLessons,
        getAlgiersWeekBounds(2, wedNoon)
      );
      expect(futureWeek.length).toBe(1);
      expect(futureWeek[0].instanceDate).toBe("2026-11-30");
      expect(futureWeek[0].classroomId).toBe(202);
    });

    test("F16-04 (A3): Same weekday/time room switch (Room A -> Room B -> Room A) preserves each generation cleanly without duplicates", () => {
      const nov20 = buildAlgiersTimestamp("2026-11-20", "13:00");
      const dec01 = buildAlgiersTimestamp("2026-12-01", "13:00");

      const gen1RoomA = {
        id: 1,
        classId: 5,
        classroomId: 10,
        teacherId: "T1",
        startsAt: buildAlgiersTimestamp("2026-11-18", "14:00"),
        endsAt: buildAlgiersTimestamp("2026-11-18", "16:00"),
        isExtra: false,
        isCatchUp: false,
        isFree: false,
        isSingleOccurrence: false,
        recurrenceStartAt: null,
        recurrenceEndAt: nov20,
      };
      const gen2RoomB = {
        id: 2,
        classId: 5,
        classroomId: 20,
        teacherId: "T1",
        startsAt: buildAlgiersTimestamp("2026-11-25", "14:00"),
        endsAt: buildAlgiersTimestamp("2026-11-25", "16:00"),
        isExtra: false,
        isCatchUp: false,
        isFree: false,
        isSingleOccurrence: false,
        recurrenceStartAt: buildAlgiersTimestamp("2026-11-25", "14:00"),
        recurrenceEndAt: dec01,
      };
      const gen3RoomA = {
        id: 3,
        classId: 5,
        classroomId: 10,
        teacherId: "T1",
        startsAt: buildAlgiersTimestamp("2026-12-02", "14:00"),
        endsAt: buildAlgiersTimestamp("2026-12-02", "16:00"),
        isExtra: false,
        isCatchUp: false,
        isFree: false,
        isSingleOccurrence: false,
        recurrenceStartAt: buildAlgiersTimestamp("2026-12-02", "14:00"),
        recurrenceEndAt: null,
      };

      const all = [gen1RoomA, gen2RoomB, gen3RoomA];

      // Nov 18 -> ONLY Room A (gen 1)
      const w1 = resolveRecurringLessonsForWeek(all, getAlgiersWeekBounds(0, buildAlgiersTimestamp("2026-11-18", "12:00")));
      expect(w1.length).toBe(1);
      expect(w1[0].classroomId).toBe(10);

      // Nov 25 -> ONLY Room B (gen 2)
      const w2 = resolveRecurringLessonsForWeek(all, getAlgiersWeekBounds(0, buildAlgiersTimestamp("2026-11-25", "12:00")));
      expect(w2.length).toBe(1);
      expect(w2[0].classroomId).toBe(20);

      // Dec 02 -> ONLY Room A (gen 3)
      const w3 = resolveRecurringLessonsForWeek(all, getAlgiersWeekBounds(0, buildAlgiersTimestamp("2026-12-02", "12:00")));
      expect(w3.length).toBe(1);
      expect(w3[0].classroomId).toBe(10);

      // Active series matcher must NOT match gen1 (retired) when inspecting gen3 (active)
      expect(doesSameRecurrenceSeriesMatch(gen1RoomA, gen3RoomA)).toBe(false);
      expect(doesSameRecurrenceSeriesMatch(gen2RoomB, gen3RoomA)).toBe(false);

      // Legacy rows with both bounds null still collapse cleanly to 1 entry
      const legacy1 = { ...gen1RoomA, id: 100, recurrenceStartAt: null, recurrenceEndAt: null };
      const legacy2 = { ...gen1RoomA, id: 101, classroomId: 99, startsAt: buildAlgiersTimestamp("2026-11-11", "14:00"), endsAt: buildAlgiersTimestamp("2026-11-11", "16:00"), recurrenceStartAt: null, recurrenceEndAt: null };
      const legacyResolved = resolveRecurringLessonsForWeek([legacy1, legacy2], getAlgiersWeekBounds(1, buildAlgiersTimestamp("2026-11-18", "12:00")));
      expect(legacyResolved.length).toBe(1);
    });

    test("F16-05 (A4): resolveActiveFormationSchedule immediately hides retired slots and displays upcoming next-week slots", () => {
      const wedNoon = buildAlgiersTimestamp("2026-11-18", "12:00");
      const retiredThu = {
        id: 30,
        classId: 7,
        startsAt: buildAlgiersTimestamp("2026-11-12", "14:00"),
        endsAt: buildAlgiersTimestamp("2026-11-12", "16:00"),
        isExtra: false,
        isCatchUp: false,
        isFree: false,
        isSingleOccurrence: false,
        recurrenceStartAt: null,
        recurrenceEndAt: wedNoon,
      };
      const newNextMon = {
        id: 31,
        classId: 7,
        startsAt: buildAlgiersTimestamp("2026-11-23", "10:00"),
        endsAt: buildAlgiersTimestamp("2026-11-23", "12:00"),
        isExtra: false,
        isCatchUp: false,
        isFree: false,
        isSingleOccurrence: false,
        recurrenceStartAt: buildAlgiersTimestamp("2026-11-23", "10:00"),
        recurrenceEndAt: null,
      };

      const schedule = resolveActiveFormationSchedule([retiredThu, newNextMon], wedNoon);
      expect(schedule.length).toBe(1);
      expect(schedule[0].id).toBe(31);
      expect(schedule[0].instanceDate).toBe("2026-11-23");
    });

    test("F16-06 (A5): Retiring a normal lesson on delete stops future occurrences while preserving past weeks and Today's Schedule", () => {
      const wedNoon = buildAlgiersTimestamp("2026-11-18", "12:00");
      const retiredPast = {
        id: 40,
        classId: 8,
        startsAt: buildAlgiersTimestamp("2026-11-14", "10:00"),
        endsAt: buildAlgiersTimestamp("2026-11-14", "12:00"),
        isExtra: false,
        isCatchUp: false,
        isFree: false,
        isSingleOccurrence: false,
        recurrenceStartAt: null,
        recurrenceEndAt: wedNoon,
      };

      // Past week still visible
      const pastWeek = resolveRecurringLessonsForWeek([retiredPast], getAlgiersWeekBounds(-1, wedNoon));
      expect(pastWeek.length).toBe(1);
      expect(pastWeek[0].instanceDate).toBe("2026-11-07");

      // Next week completely cleared
      const nextWeek = resolveRecurringLessonsForWeek([retiredPast], getAlgiersWeekBounds(1, wedNoon));
      expect(nextWeek.length).toBe(0);

      // Today's schedule on next Saturday is empty
      const nextSatToday = resolveRecurringLessonsForDate(
        [retiredPast],
        buildAlgiersTimestamp("2026-11-21", "08:00")
      );
      expect(nextSatToday.length).toBe(0);
    });

    test("F16-07 (A6): Editing a normal lesson on a past week affects ONLY that single occurrence without duplicating or altering other weeks", () => {
      const wedNoon = buildAlgiersTimestamp("2026-11-18", "12:00");
      const ongoingRecurring = {
        id: 50,
        classId: 9,
        classroomId: 101,
        startsAt: buildAlgiersTimestamp("2026-11-14", "10:00"),
        endsAt: buildAlgiersTimestamp("2026-11-14", "12:00"),
        isExtra: false,
        isCatchUp: false,
        isFree: false,
        isSingleOccurrence: false,
        recurrenceStartAt: null,
        recurrenceEndAt: null,
      };
      const origSlotKey = getLessonSlotKey(ongoingRecurring);

      // Admin views past week (-1: Sat Nov 7 - Fri Nov 13) and edits Sat Nov 7 -> Sun Nov 8 11:00-13:00 Room 303
      const singleTarget = buildSingleOccurrenceTargetInWeek({
        instanceDateStr: "2026-11-07",
        day: "SUNDAY",
        startTime: "11:00",
        endTime: "13:00",
      });
      expect(singleTarget.dateStr).toBe("2026-11-08");
      expect(getAlgiersDateInfo(singleTarget.startsAt).timeStr).toBe("11:00");
      expect(getAlgiersDateInfo(singleTarget.endsAt).timeStr).toBe("13:00");

      const singleOverrideRow = {
        id: 51,
        classId: 9,
        classroomId: 303,
        startsAt: singleTarget.startsAt,
        endsAt: singleTarget.endsAt,
        isExtra: false,
        isCatchUp: false,
        isFree: false,
        isSingleOccurrence: true,
        recurrenceStartAt: null,
        recurrenceEndAt: null,
        overridesDate: "2026-11-07",
        overridesSlotKey: origSlotKey,
      };

      const all = [ongoingRecurring, singleOverrideRow];

      // Week -2 (Oct 31): untouched recurring Sat 10:00 Room 101
      const wMinus2 = resolveRecurringLessonsForWeek(all, getAlgiersWeekBounds(-2, wedNoon));
      expect(wMinus2.length).toBe(1);
      expect(wMinus2[0].instanceDate).toBe("2026-10-31");
      expect(wMinus2[0].classroomId).toBe(101);

      // Week -1 (Nov 7 - Nov 13): ONLY the edited Sun Nov 8 11:00 Room 303 (original Sat Nov 7 suppressed!)
      const wMinus1 = resolveRecurringLessonsForWeek(all, getAlgiersWeekBounds(-1, wedNoon));
      expect(wMinus1.length).toBe(1);
      expect(wMinus1[0].id).toBe(51);
      expect(wMinus1[0].instanceDate).toBe("2026-11-08");
      expect(wMinus1[0].classroomId).toBe(303);

      // Week 0 (Nov 14): untouched recurring Sat Nov 14 10:00 Room 101 (Sun edit did NOT leak!)
      const w0 = resolveRecurringLessonsForWeek(all, getAlgiersWeekBounds(0, wedNoon));
      expect(w0.length).toBe(1);
      expect(w0[0].instanceDate).toBe("2026-11-14");
      expect(w0[0].classroomId).toBe(101);

      // Week +1 (Nov 21): untouched recurring Sat Nov 21 10:00 Room 101
      const wPlus1 = resolveRecurringLessonsForWeek(all, getAlgiersWeekBounds(1, wedNoon));
      expect(wPlus1.length).toBe(1);
      expect(wPlus1[0].instanceDate).toBe("2026-11-21");
      expect(wPlus1[0].classroomId).toBe(101);
    });

    test("F16-08: Schema, server actions, formation actions, and UI properly wire non-destructive lifecycle without destructive sibling sync", () => {
      const schema = readSourceFile("prisma/schema.prisma");
      const lessonInstances = readSourceFile("src/lib/lessonInstances.ts");
      const actions = readSourceFile("src/lib/actions.ts");
      const formationActions = readSourceFile("src/lib/formationActions.ts");
      const lessonsPage = readSourceFile("src/app/[locale]/(dashboard)/list/lessons/page.tsx");
      const lessonForm = readSourceFile("src/components/forms/LessonForm.tsx");
      const dashboardAttendance = readSourceFile("src/lib/dashboardAttendance.ts");

      // 1. Prisma schema includes all lifecycle columns
      expect(schema.includes("recurrenceStartAt")).toBe(true);
      expect(schema.includes("recurrenceEndAt")).toBe(true);
      expect(schema.includes("isSingleOccurrence")).toBe(true);
      expect(schema.includes("overridesDate")).toBe(true);
      expect(schema.includes("overridesSlotKey")).toBe(true);

      // 2. Destructive past-date rewriter syncSiblingRecurringLessons is gone
      expect(lessonInstances.includes("syncSiblingRecurringLessons")).toBe(false);
      expect(actions.includes("syncSiblingRecurringLessons")).toBe(false);

      // 3. Non-destructive lifecycle helpers are wired into regular & formation actions
      expect(actions.includes("applyNormalLessonFutureUpdate")).toBe(true);
      expect(actions.includes("applyNormalLessonSinglePastEdit")).toBe(true);
      expect(actions.includes("retireOrDeleteNormalLesson")).toBe(true);
      expect(formationActions.includes("applyNormalLessonFutureUpdate")).toBe(true);
      expect(formationActions.includes("retireOrDeleteNormalLesson")).toBe(true);

      // 4. checkForConflicts respects recurrenceEndAt and isSingleOccurrence
      expect(actions.includes('l."isSingleOccurrence" = false')).toBe(true);
      expect(actions.includes('l."recurrenceEndAt" IS NULL')).toBe(true);

      // 5. Timetable, LessonForm, and Dashboard attendance select/pass lifecycle metadata
      expect(lessonsPage.includes("editScope")).toBe(true);
      expect(lessonsPage.includes('l."recurrenceEndAt"')).toBe(true);
      expect(lessonForm.includes("isSinglePastEdit")).toBe(true);
      expect(dashboardAttendance.includes("recurrenceEndAt: true")).toBe(true);

      // 6. Active window sanity check
      expect(
        isRecurringOccurrenceActive(
          buildAlgiersTimestamp("2026-11-23", "14:00"),
          buildAlgiersTimestamp("2026-11-23", "16:00"),
          {
            recurrenceStartAt: buildAlgiersTimestamp("2026-11-23", "14:00"),
            recurrenceEndAt: null,
          }
        )
      ).toBe(true);
    });
  });
}

if (process.argv[1]?.endsWith("f16-normal-lesson-history-preservation.test.ts")) {
  runF16Tests().then(async () => {
    const { runner } = require("../helpers/runner");
    await runner.runQueuedTests();
    const ok = runner.printSummaryReport();
    process.exit(ok ? 0 : 1);
  });
}

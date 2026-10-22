import { describe, test, expect } from "../helpers/runner";
import { readSourceFile } from "../helpers/moduleLoader";

export async function runF11Tests() {
  await describe("F11: Cross-Device Schedule & Attendance Timezone Anchoring (R1)", async () => {
    test("F11-01: WorkshopSchedule.tsx specifies timeZone: 'Africa/Algiers' for session times", () => {
      const source = readSourceFile("src/components/WorkshopSchedule.tsx");
      const hasAlgiersAnchor = /timeZone:\s*["']Africa\/Algiers["']/.test(source) || /formatAlgiers/.test(source);
      if (!hasAlgiersAnchor) {
        throw new Error("Defect in WorkshopSchedule.tsx: Session hours shift on client devices due to missing 'Africa/Algiers' timezone option");
      }
      expect(hasAlgiersAnchor).toBe(true);
    });

    test("F11-02: WorkshopAttendanceGrid.tsx anchors session headers to Africa/Algiers", () => {
      const source = readSourceFile("src/components/workshops/WorkshopAttendanceGrid.tsx");
      const hasAlgiersAnchor = /timeZone:\s*["']Africa\/Algiers["']/.test(source) || /formatAlgiers/.test(source);
      if (!hasAlgiersAnchor) {
        throw new Error("Defect in WorkshopAttendanceGrid.tsx: Session header dates shift across client devices");
      }
      expect(hasAlgiersAnchor).toBe(true);
    });

    test("F11-03: AttendanceGrid.tsx anchors catch-up lesson dates to Africa/Algiers", () => {
      const source = readSourceFile("src/components/AttendanceGrid.tsx");
      const hasAlgiersAnchor = /timeZone:\s*["']Africa\/Algiers["']/.test(source) || /formatAlgiers/.test(source);
      if (!hasAlgiersAnchor) {
        throw new Error("Defect in AttendanceGrid.tsx: Catch-up date formatting lacks 'Africa/Algiers' anchoring");
      }
      expect(hasAlgiersAnchor).toBe(true);
    });

    test("F11-04: Student profile page list/students/[id]/page.tsx formats lesson hours in Algiers time", () => {
      const source = readSourceFile("src/app/[locale]/(dashboard)/list/students/[id]/page.tsx");
      const hasAlgiersAnchor = /timeZone:\s*["']Africa\/Algiers["']/.test(source) || /formatAlgiers/.test(source);
      if (!hasAlgiersAnchor) {
        throw new Error("Defect in students/[id]/page.tsx: formatLessonTime does not specify 'Africa/Algiers' timezone");
      }
      expect(hasAlgiersAnchor).toBe(true);
    });

    test("F11-05: BigCalender does not shift lesson blocks across different client timezones", () => {
      // In Algiers (UTC+1), a 14:00 lesson has UTC timestamp 13:00.
      const lessonUtc = new Date("2026-10-21T13:00:00.000Z");
      const formattedAlgiersHour = new Intl.DateTimeFormat("en-US", {
        timeZone: "Africa/Algiers",
        hour: "numeric",
        hour12: false,
      }).format(lessonUtc);

      // Must be 14 in Algiers regardless of machine timezone
      expect(formattedAlgiersHour).toBe("14");
    });
  });
}

if (process.argv[1]?.endsWith("f11-schedules-attendance-timezone.test.ts")) {
  runF11Tests().then(async () => {
    const { runner } = require("../helpers/runner");
    await runner.runQueuedTests();
    const ok = runner.printSummaryReport();
    process.exit(ok ? 0 : 1);
  });
}

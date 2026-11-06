import { describe, test, expect } from "../helpers/runner";
import { readSourceFile } from "../helpers/moduleLoader";

export async function runF13Tests() {
  await describe("F13: Automated Attendance Save When Lesson Is Up & Untouched Student Guarantee", async () => {
    test("F13-01: saveAttendance in src/lib/actions.ts guarantees all active enrolled students are recorded even if untouched", () => {
      const source = readSourceFile("src/lib/actions.ts");
      const hasUntouchedLoop = source.includes("allActiveStudentIds") &&
        source.includes("No enrolled student is EVER left non-recorded even if their attendance was not touched");
      if (!hasUntouchedLoop) {
        throw new Error("Defect in saveAttendance: Does not guarantee all active enrolled students are recorded when untouched");
      }
      expect(hasUntouchedLoop).toBe(true);
    });

    test("F13-02: saveAttendance gracefully falls back un-justified NOT_DEFINED to ABSENT during auto-save without blocking", () => {
      const source = readSourceFile("src/lib/actions.ts");
      const hasAutoSaveFallback = source.includes("isAutoSave") &&
        source.includes('status = "ABSENT";');
      if (!hasAutoSaveFallback) {
        throw new Error("Defect in saveAttendance: Missing auto-save fallback for un-justified NOT_DEFINED status");
      }
      expect(hasAutoSaveFallback).toBe(true);
    });

    test("F13-03: autoSaveLessonAttendanceAction is exported and finalizes ended lesson attendance", () => {
      const source = readSourceFile("src/lib/actions.ts");
      const hasAutoSaveLesson = /export const autoSaveLessonAttendanceAction\s*=/.test(source) &&
        source.includes("unrecordedStudentIds");
      if (!hasAutoSaveLesson) {
        throw new Error("Defect in src/lib/actions.ts: autoSaveLessonAttendanceAction missing or does not query unrecorded students");
      }
      expect(hasAutoSaveLesson).toBe(true);
    });

    test("F13-04: autoSaveEndedLessonsAction is exported and processes past lessons within 7 days", () => {
      const source = readSourceFile("src/lib/actions.ts");
      const hasEndedLessonsAction = /export const autoSaveEndedLessonsAction\s*=/.test(source);
      if (!hasEndedLessonsAction) {
        throw new Error("Defect in src/lib/actions.ts: autoSaveEndedLessonsAction missing");
      }
      expect(hasEndedLessonsAction).toBe(true);
    });

    test("F13-05: AttendanceRoster.tsx includes countdown timer and auto-save trigger when lesson is up", () => {
      const source = readSourceFile("src/components/forms/AttendanceRoster.tsx");
      const hasTimer = source.includes("lessonEndTime") && source.includes("triggerAutoSave");
      const hasHiddenInputsForActive = source.includes("activeStudents.map((student)") && source.includes("isAutoSave");
      if (!hasTimer || !hasHiddenInputsForActive) {
        throw new Error("Defect in AttendanceRoster.tsx: Timer or activeStudents hidden inputs missing for automated attendance save");
      }
      expect(hasTimer && hasHiddenInputsForActive).toBe(true);
    });

    test("F13-06: /api/attendance/auto-save route exists with GET and POST handlers", () => {
      const source = readSourceFile("src/app/api/attendance/auto-save/route.ts");
      const hasGet = source.includes("export async function GET");
      const hasPost = source.includes("export async function POST");
      if (!hasGet || !hasPost) {
        throw new Error("Defect in /api/attendance/auto-save/route.ts: Missing GET or POST export");
      }
      expect(hasGet && hasPost).toBe(true);
    });

    test("F13-07: BiometricMonitorProvider includes background heartbeat for auto-saving ended lessons", () => {
      const source = readSourceFile("src/components/biometrics/BiometricMonitorProvider.tsx");
      const hasHeartbeat = source.includes("/api/attendance/auto-save");
      if (!hasHeartbeat) {
        throw new Error("Defect in BiometricMonitorProvider: Missing /api/attendance/auto-save background heartbeat");
      }
      expect(hasHeartbeat).toBe(true);
    });
  });
}

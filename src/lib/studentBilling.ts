/**
 * Core billing and payer-status calculations per Architecture §7.18.
 *
 * Statuses:
 * 1. NORMAL: Student pays full session/cycle tuition.
 * 2. NON_PAYER: Student is exempt from lesson fees (0 DZD fee).
 *    Sessions still consume credit and count in attendance/payroll normally.
 * 3. SCHOOL_FEES_ONLY: Student pays only the school's percentage share:
 *    (100% - TeacherPayRate.percentageOfSessionFee), skipping teacher's cut.
 *    Teacher payroll for the session is unaffected (teacher earns normal percentage).
 */

export type StudentPayerStatus = "NORMAL" | "NON_PAYER" | "SCHOOL_FEES_ONLY";

export interface SessionFeeCalculation {
  baseSessionFee: number;
  baseCycleFee: number;
  teacherPercentage: number;
  schoolPercentage: number;
  studentSessionFee: number;
  studentCycleFee: number;
  teacherCut: number;
  schoolCut: number;
  payerStatus: StudentPayerStatus;
  isSiblingWaived: boolean;
}

export function normalizePayerStatus(status?: string | null): StudentPayerStatus {
  if (status === "NON_PAYER") return "NON_PAYER";
  if (status === "SCHOOL_FEES_ONLY") return "SCHOOL_FEES_ONLY";
  return "NORMAL";
}

/**
 * Computes the financial breakdown for a student's session and cycle tuition.
 */
export function computeStudentSessionFee({
  payerStatus,
  pricePerCycle,
  teacherPercentage,
  isSiblingWaived = false,
}: {
  payerStatus?: string | null;
  pricePerCycle: number;
  teacherPercentage?: number | null;
  isSiblingWaived?: boolean;
}): SessionFeeCalculation {
  const normStatus = normalizePayerStatus(payerStatus);
  const baseCycleFee = Math.max(0, Number(pricePerCycle || 0));
  const baseSessionFee = baseCycleFee > 0 ? baseCycleFee / 4 : 0;

  // Teacher percentage (defaults to 0 if not set, capped between 0 and 100)
  const tPercent = Math.max(0, Math.min(100, Number(teacherPercentage || 0)));
  const sPercent = Math.max(0, 100 - tPercent);

  // Teacher cut in payroll per Wassim's rule:
  // Teacher is ONLY paid for NORMAL paying students; teacher earns 0 for NON_PAYER and SCHOOL_FEES_ONLY.
  const normalTeacherCut = (baseSessionFee * tPercent) / 100;
  const schoolCut = (baseSessionFee * sPercent) / 100;

  // 1. Sibling waiver or Non-payer: 0 student fee (§2.4 & §7.18)
  if (isSiblingWaived || normStatus === "NON_PAYER") {
    return {
      baseSessionFee,
      baseCycleFee,
      teacherPercentage: tPercent,
      schoolPercentage: sPercent,
      studentSessionFee: 0,
      studentCycleFee: 0,
      teacherCut: 0, // Teacher does NOT get paid for non-paying students
      schoolCut: 0,
      payerStatus: normStatus,
      isSiblingWaived,
    };
  }

  // 2. School-fees-only (§7.18):
  // Charge ONLY the school's percentage share (100% - TeacherPayRate.percentageOfSessionFee)
  // Teacher does NOT get paid for school-fees-only students
  if (normStatus === "SCHOOL_FEES_ONLY") {
    const studentSessionFee = schoolCut;
    const studentCycleFee = (baseCycleFee * sPercent) / 100;
    return {
      baseSessionFee,
      baseCycleFee,
      teacherPercentage: tPercent,
      schoolPercentage: sPercent,
      studentSessionFee,
      studentCycleFee,
      teacherCut: 0, // Teacher does NOT get paid for school-fees-only students
      schoolCut,
      payerStatus: normStatus,
      isSiblingWaived,
    };
  }

  // 3. Normal (§7.18): Standard tuition
  return {
    baseSessionFee,
    baseCycleFee,
    teacherPercentage: tPercent,
    schoolPercentage: sPercent,
    studentSessionFee: baseSessionFee,
    studentCycleFee: baseCycleFee,
    teacherCut: normalTeacherCut, // Teacher earns normal percentage
    schoolCut,
    payerStatus: normStatus,
    isSiblingWaived,
  };
}

/**
 * Computes the total amount a student owes for an arbitrary number of consumed sessions.
 */
export function computeStudentOwedForSessions({
  payerStatus,
  pricePerCycle,
  teacherPercentage,
  sessionCount,
  isSiblingWaived = false,
}: {
  payerStatus?: string | null;
  pricePerCycle: number;
  teacherPercentage?: number | null;
  sessionCount: number;
  isSiblingWaived?: boolean;
}): number {
  if (sessionCount <= 0) return 0;
  const { studentSessionFee } = computeStudentSessionFee({
    payerStatus,
    pricePerCycle,
    teacherPercentage,
    isSiblingWaived,
  });
  return studentSessionFee * sessionCount;
}

export type AttendanceClassification =
  | "PRESENT"
  | "NOT_DEFINED"
  | "PRE_START_ABSENCE"
  | "INTERLEAVED_ABSENCE"
  | "TRAILING_ABSENCE_HELD"
  | "FORFEITED_DROPOUT";

export interface StudentAttendanceHistoryItem {
  lessonId: number;
  startsAt: Date;
  status: "PRESENT" | "ABSENT" | "NOT_DEFINED";
  isCatchUp: boolean;
  classification: AttendanceClassification;
  isConsumedCredit: boolean;
  isTeacherPayable: boolean;
  isRefundable: boolean;
  isHeld: boolean;
}

/**
 * Classifies a student's full attendance history in a class according to Massinissa School rules:
 * 1. PRESENT: Consumed credit, teacher paid.
 * 2. NOT_DEFINED: Justified absence (0 credit deducted, 0 teacher pay).
 * 3. PRE_START_ABSENCE: Absences in brand new group before student's first presence (0 credit, 0 teacher pay).
 * 4. INTERLEAVED_ABSENCE: Absence followed by subsequent presence (consumed credit, teacher paid, non-refundable).
 * 5. TRAILING_ABSENCE_HELD: Absence at the end with <=4 missed lessons and <30 days elapsed (held pending, 0 teacher pay this month, refundable if student leaves).
 * 6. FORFEITED_DROPOUT: Student missed >4 lessons or >=30 days without attending (money retained 100% by school, 0 teacher pay, non-refundable).
 */
export function classifyStudentAttendanceHistory({
  lessons,
  attendances,
  catchUps = [],
  referenceDate = new Date(),
}: {
  lessons: Array<{ id: number; startsAt: Date | string; isFree?: boolean }>;
  attendances: Array<{ lessonId: number; status: string }>;
  catchUps?: Array<{ missedLessonId: number; recordedAt?: Date | string }>;
  referenceDate?: Date;
}): StudentAttendanceHistoryItem[] {
  // Sort lessons chronologically
  const sortedLessons = [...lessons]
    .filter((l) => !l.isFree)
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

  const attendanceMap = new Map<number, string>();
  attendances.forEach((a) => attendanceMap.set(a.lessonId, a.status));

  const catchUpSet = new Set<number>();
  catchUps.forEach((c) => catchUpSet.add(c.missedLessonId));

  // Determine presence at each lesson
  const presenceArray: boolean[] = sortedLessons.map((l) => {
    const rawStatus = attendanceMap.get(l.id);
    const hasCatchUp = catchUpSet.has(l.id);
    return rawStatus === "PRESENT" || hasCatchUp;
  });

  const firstPresenceIndex = presenceArray.findIndex((p) => p === true);
  const lastPresenceIndex = presenceArray.findLastIndex ? presenceArray.findLastIndex((p) => p === true) : (function() {
    for (let i = presenceArray.length - 1; i >= 0; i--) {
      if (presenceArray[i]) return i;
    }
    return -1;
  })();

  const lastPresenceDate =
    lastPresenceIndex >= 0 ? new Date(sortedLessons[lastPresenceIndex].startsAt) : null;

  // Count trailing unexcused absences from lastPresenceIndex to end
  const trailingAbsenceCount =
    lastPresenceIndex >= 0
      ? sortedLessons.slice(lastPresenceIndex + 1).filter((l) => {
          const st = attendanceMap.get(l.id);
          return st === "ABSENT";
        }).length
      : sortedLessons.filter((l) => attendanceMap.get(l.id) === "ABSENT").length;

  const daysSinceLastPresence = lastPresenceDate
    ? Math.floor((referenceDate.getTime() - lastPresenceDate.getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  const isForfeitedDropout = trailingAbsenceCount > 4 || (lastPresenceDate !== null && daysSinceLastPresence >= 30);

  const history: StudentAttendanceHistoryItem[] = [];

  for (let i = 0; i < sortedLessons.length; i++) {
    const lesson = sortedLessons[i];
    const startsAt = new Date(lesson.startsAt);
    const rawStatus = attendanceMap.get(lesson.id) || "ABSENT";
    const hasCatchUp = catchUpSet.has(lesson.id);

    if (rawStatus === "NOT_DEFINED") {
      history.push({
        lessonId: lesson.id,
        startsAt,
        status: "NOT_DEFINED",
        isCatchUp: false,
        classification: "NOT_DEFINED",
        isConsumedCredit: false,
        isTeacherPayable: false,
        isRefundable: false,
        isHeld: false,
      });
      continue;
    }

    if (rawStatus === "PRESENT" || hasCatchUp) {
      history.push({
        lessonId: lesson.id,
        startsAt,
        status: "PRESENT",
        isCatchUp: hasCatchUp,
        classification: "PRESENT",
        isConsumedCredit: true,
        isTeacherPayable: true,
        isRefundable: false,
        isHeld: false,
      });
      continue;
    }

    // Otherwise, rawStatus === "ABSENT"
    // 1. Check if this absence is before student's very first presence in this group
    if (firstPresenceIndex === -1 || i < firstPresenceIndex) {
      history.push({
        lessonId: lesson.id,
        startsAt,
        status: "ABSENT",
        isCatchUp: false,
        classification: "PRE_START_ABSENCE",
        isConsumedCredit: false,
        isTeacherPayable: false,
        isRefundable: true,
        isHeld: false,
      });
      continue;
    }

    // 2. Check if student attended any subsequent lesson (regular or catch-up)
    const hasSubsequentPresence = presenceArray.slice(i + 1).some((p) => p === true);

    if (hasSubsequentPresence) {
      // Interleaved absence: confirmed consumed, teacher is paid, student cannot refund
      history.push({
        lessonId: lesson.id,
        startsAt,
        status: "ABSENT",
        isCatchUp: false,
        classification: "INTERLEAVED_ABSENCE",
        isConsumedCredit: true,
        isTeacherPayable: true,
        isRefundable: false,
        isHeld: false,
      });
      continue;
    }

    // 3. Trailing absence: check if forfeited or held
    if (isForfeitedDropout) {
      history.push({
        lessonId: lesson.id,
        startsAt,
        status: "ABSENT",
        isCatchUp: false,
        classification: "FORFEITED_DROPOUT",
        isConsumedCredit: true, // Retained by school
        isTeacherPayable: false, // Teacher not paid
        isRefundable: false, // Forfeited by student
        isHeld: false,
      });
    } else {
      history.push({
        lessonId: lesson.id,
        startsAt,
        status: "ABSENT",
        isCatchUp: false,
        classification: "TRAILING_ABSENCE_HELD",
        isConsumedCredit: false,
        isTeacherPayable: false, // Held back from this month's payroll
        isRefundable: true, // Refundable if student drops out
        isHeld: true,
      });
    }
  }

  return history;
}

/**
 * Computes consumption breakdown for student cycle credit accounting.
 */
export function computeStudentCycleConsumption({
  totalPurchasedSessions,
  history,
}: {
  totalPurchasedSessions: number;
  history: StudentAttendanceHistoryItem[];
}) {
  const consumedSessions = history.filter((h) => h.isConsumedCredit).length;
  const heldSessions = history.filter((h) => h.isHeld).length;
  const forfeitedSessions = history.filter((h) => h.classification === "FORFEITED_DROPOUT").length;
  const remainingSessions = Math.max(0, totalPurchasedSessions - consumedSessions);
  const refundableSessions = Math.min(totalPurchasedSessions, remainingSessions);

  return {
    totalPurchasedSessions,
    consumedSessions,
    heldSessions,
    forfeitedSessions,
    remainingSessions,
    refundableSessions,
  };
}

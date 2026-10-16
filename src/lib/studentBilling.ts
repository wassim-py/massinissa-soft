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
  siblingDiscountPercentage?: number;
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
  siblingDiscountPercentage,
}: {
  payerStatus?: string | null;
  pricePerCycle: number;
  teacherPercentage?: number | null;
  isSiblingWaived?: boolean;
  siblingDiscountPercentage?: number | null;
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

  // 1. Non-payer status: 0 student fee (§7.18)
  if (normStatus === "NON_PAYER") {
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
      isSiblingWaived: false,
      siblingDiscountPercentage: 0,
    };
  }

  // 2. Sibling discount (percentage discount, default 50% / half-price)
  const effectiveDiscount =
    siblingDiscountPercentage !== undefined && siblingDiscountPercentage !== null
      ? Number(siblingDiscountPercentage)
      : isSiblingWaived
      ? 50
      : 0;

  if (effectiveDiscount >= 100) {
    return {
      baseSessionFee,
      baseCycleFee,
      teacherPercentage: tPercent,
      schoolPercentage: sPercent,
      studentSessionFee: 0,
      studentCycleFee: 0,
      teacherCut: 0,
      schoolCut: 0,
      payerStatus: normStatus,
      isSiblingWaived: true,
      siblingDiscountPercentage: 100,
    };
  }

  if (effectiveDiscount > 0) {
    const discountRate = effectiveDiscount / 100;
    const studentCycleFee = baseCycleFee * (1 - discountRate);
    const studentSessionFee = baseSessionFee * (1 - discountRate);
    // Option 2 (Proportional split): Teacher and school share the sibling discount proportionally
    const discountedTeacherCut = (studentSessionFee * tPercent) / 100;
    const discountedSchoolCut = (studentSessionFee * sPercent) / 100;

    return {
      baseSessionFee,
      baseCycleFee,
      teacherPercentage: tPercent,
      schoolPercentage: sPercent,
      studentSessionFee,
      studentCycleFee,
      teacherCut: discountedTeacherCut,
      schoolCut: discountedSchoolCut,
      payerStatus: normStatus,
      isSiblingWaived: false,
      siblingDiscountPercentage: effectiveDiscount,
    };
  }

  // 3. School-fees-only (§7.18):
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
      isSiblingWaived: false,
    };
  }

  // 4. Normal (§7.18): Standard tuition
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
    isSiblingWaived: false,
    siblingDiscountPercentage: 0,
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
  siblingDiscountPercentage,
}: {
  payerStatus?: string | null;
  pricePerCycle: number;
  teacherPercentage?: number | null;
  sessionCount: number;
  isSiblingWaived?: boolean;
  siblingDiscountPercentage?: number | null;
}): number {
  if (sessionCount <= 0) return 0;
  const { studentSessionFee } = computeStudentSessionFee({
    payerStatus,
    pricePerCycle,
    teacherPercentage,
    isSiblingWaived,
    siblingDiscountPercentage,
  });
  return studentSessionFee * sessionCount;
}

export type AttendanceClassification =
  | "PRESENT"
  | "NOT_DEFINED"
  | "CAUGHT_UP_ABSENCE"
  | "PRE_START_ABSENCE"
  | "INTERLEAVED_ABSENCE"
  | "TRAILING_ABSENCE_HELD"
  | "FORFEITED_DROPOUT"
  | "TEACHER_ABSENT";

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
 * 3. CAUGHT_UP_ABSENCE: Missed session that was caught up in the same group (0 credit deducted from missed slot, 0 teacher pay).
 * 4. PRE_START_ABSENCE: Absences in brand new group before student's first presence (0 credit, 0 teacher pay).
 * 5. INTERLEAVED_ABSENCE: Absence followed by subsequent presence (consumed credit, teacher paid, non-refundable).
 * 6. TRAILING_ABSENCE_HELD: Absence at the end with <60 calendar days elapsed (held pending, 0 teacher pay this month, refundable if student leaves).
 * 7. FORFEITED_DROPOUT: Student missed >=60 calendar days (2 months) without attending (money retained 100% by school, 0 teacher pay, non-refundable).
 * 8. TEACHER_ABSENT: Teacher marked absent for lesson (0 credit deducted, student credit untouched, 0 teacher pay).
 */
export function classifyStudentAttendanceHistory({
  lessons,
  attendances,
  catchUps = [],
  referenceDate = new Date(),
}: {
  lessons: Array<{ id: number; startsAt: Date | string; isFree?: boolean; isTeacherAbsent?: boolean }>;
  attendances: Array<{ lessonId: number; status: string }>;
  catchUps?: Array<{
    missedLessonId: number;
    catchUpLessonId?: number;
    recordedAt?: Date | string;
    recordedBy?: string;
    isTransferCatchUp?: boolean;
  }>;
  referenceDate?: Date;
}): StudentAttendanceHistoryItem[] {
  // Sort lessons chronologically
  const sortedLessons = [...lessons]
    .filter((l) => !l.isFree)
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

  const attendanceMap = new Map<number, string>();
  attendances.forEach((a) => attendanceMap.set(a.lessonId, a.status));

  const catchUpSet = new Set<number>();
  const transferCatchUpSet = new Set<number>();
  const missedToCatchUpMap = new Map<number, number>();
  const catchUpToMissedMap = new Map<number, number>();
  (catchUps || []).forEach((c) => {
    if (c.missedLessonId) {
      catchUpSet.add(c.missedLessonId);
      if (c.isTransferCatchUp || c.recordedBy === "transfer") {
        transferCatchUpSet.add(c.missedLessonId);
      }
      if (c.catchUpLessonId) {
        missedToCatchUpMap.set(c.missedLessonId, c.catchUpLessonId);
        catchUpToMissedMap.set(c.catchUpLessonId, c.missedLessonId);
      }
    }
  });

  const lessonIdSet = new Set(sortedLessons.map((l) => l.id));

  // Determine presence at each lesson (teacher absent lessons are never treated as student presence or normal sessions)
  const presenceArray: boolean[] = sortedLessons.map((l) => {
    if (l.isTeacherAbsent) return false;
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

  // Count trailing unexcused absences from lastPresenceIndex to end (excluding teacher absent lessons)
  const trailingAbsenceCount =
    lastPresenceIndex >= 0
      ? sortedLessons.slice(lastPresenceIndex + 1).filter((l) => {
          if (l.isTeacherAbsent) return false;
          const st = attendanceMap.get(l.id);
          return st === "ABSENT";
        }).length
      : sortedLessons.filter((l) => !l.isTeacherAbsent && attendanceMap.get(l.id) === "ABSENT").length;

  const daysSinceLastPresence = lastPresenceDate
    ? Math.floor((referenceDate.getTime() - lastPresenceDate.getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  // Forfeited dropout is triggered strictly on 2 calendar months (60 calendar days) of absence since last presence:
  const isForfeitedDropout = lastPresenceDate !== null && daysSinceLastPresence >= 60;

  const history: StudentAttendanceHistoryItem[] = [];

  for (let i = 0; i < sortedLessons.length; i++) {
    const lesson = sortedLessons[i];
    const startsAt = new Date(lesson.startsAt);
    const rawStatus = attendanceMap.get(lesson.id) || "ABSENT";
    const hasCatchUp = catchUpSet.has(lesson.id);

    // Rule: When teacher is absent, student credits are untouched (0 credit deducted)
    // even if attendance was taken, and teacher is not paid for this lesson.
    if (lesson.isTeacherAbsent) {
      history.push({
        lessonId: lesson.id,
        startsAt,
        status: (rawStatus as any) || "ABSENT",
        isCatchUp: false,
        classification: "TEACHER_ABSENT",
        isConsumedCredit: false,
        isTeacherPayable: false,
        isRefundable: false,
        isHeld: false,
      });
      continue;
    }

    // Visiting student attending a catch-up in this host class from a different group (§2.12):
    // Does NOT consume credit in this host class (0 credit deducted, teacher paid for visitor).
    const missedLessonForVisitor = catchUpToMissedMap.get(lesson.id);
    if (missedLessonForVisitor && !lessonIdSet.has(missedLessonForVisitor)) {
      history.push({
        lessonId: lesson.id,
        startsAt,
        status: rawStatus === "PRESENT" ? "PRESENT" : "ABSENT",
        isCatchUp: true,
        classification: "PRESENT",
        isConsumedCredit: false,
        isTeacherPayable: true,
        isRefundable: false,
        isHeld: false,
      });
      continue;
    }

    if (hasCatchUp) {
      if (transferCatchUpSet.has(lesson.id)) {
        // Transferred from another group: this attendance was completed in the source group.
        // It is displayed as a catch-up in this new group, but does NOT consume session credit
        // in this new group (the remaining balance transferred via tIn is preserved),
        // and the target group teacher is NOT paid for it.
        history.push({
          lessonId: lesson.id,
          startsAt,
          status: "PRESENT",
          isCatchUp: true,
          classification: "PRESENT",
          isConsumedCredit: false,
          isTeacherPayable: false,
          isRefundable: false,
          isHeld: false,
        });
        continue;
      }

      const cLessonId = missedToCatchUpMap.get(lesson.id);
      const isCatchUpInThisList = Boolean(cLessonId && lessonIdSet.has(cLessonId));
      const catchUpAttStatus = isCatchUpInThisList && cLessonId ? attendanceMap.get(cLessonId) : null;
      const isCatchUpAttendedInThisList = isCatchUpInThisList && catchUpAttStatus === "PRESENT";

      if (isCatchUpAttendedInThisList) {
        // In-group catch-up attended: the catch-up lesson will consume 1 credit when its iteration runs.
        // This missed lesson is neutralized (0 credit deducted, teacher not paid twice).
        history.push({
          lessonId: lesson.id,
          startsAt,
          status: "ABSENT",
          isCatchUp: true,
          classification: "CAUGHT_UP_ABSENCE",
          isConsumedCredit: false,
          isTeacherPayable: false,
          isRefundable: false,
          isHeld: false,
        });
        continue;
      }

      // Cross-group catch-up (attended in another group with same teacher and level):
      // If student was also marked PRESENT in this home lesson (attended both sessions):
      if (rawStatus === "PRESENT") {
        history.push({
          lessonId: lesson.id,
          startsAt,
          status: "PRESENT",
          isCatchUp: true,
          classification: "PRESENT",
          isConsumedCredit: true,
          isTeacherPayable: true,
          isRefundable: false,
          isHeld: false,
        });
        continue;
      }

      // Standard Scenario A or B: student missed this lesson and caught it up in the other group:
      // The student consumes 1 session credit in this home class package.
      // But teacher is NOT payable on this missed lesson (teacher is paid in the attended catch-up lesson).
      history.push({
        lessonId: lesson.id,
        startsAt,
        status: "ABSENT",
        isCatchUp: true,
        classification: "CAUGHT_UP_ABSENCE",
        isConsumedCredit: true,
        isTeacherPayable: false,
        isRefundable: false,
        isHeld: false,
      });
      continue;
    }

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

    if (rawStatus === "PRESENT") {
      history.push({
        lessonId: lesson.id,
        startsAt,
        status: "PRESENT",
        isCatchUp: false,
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
        isConsumedCredit: true, // Consumes student session credit per §7.22
        isTeacherPayable: false, // Held back from this month's payroll
        isRefundable: true, // Refundable if student drops out
        isHeld: true,
      });
    }
  }

  return history;
}

/**
 * Computes the total number of consumed sessions for a student in a class.
 * Accounts for Massinissa School rules:
 * - Free lessons (isFree: true) consume 0 credit.
 * - Excused absences (NOT_DEFINED) consume 0 credit.
 * - Absences before student's very first presence in the group (PRE_START_ABSENCE) consume 0 credit.
 * - Presences and unexcused absences on/after first presence consume 1 credit each.
 */
export function computeStudentConsumedSessions({
  lessons,
  attendances,
  catchUps = [],
}: {
  lessons: Array<{ id: number; startsAt: Date | string; isFree?: boolean }>;
  attendances: Array<{ lessonId: number; status: string }>;
  catchUps?: Array<{
    missedLessonId: number;
    catchUpLessonId?: number;
    recordedAt?: Date | string;
    recordedBy?: string;
    isTransferCatchUp?: boolean;
  }>;
}): number {
  if (!lessons || lessons.length === 0 || !attendances || attendances.length === 0) {
    const validCatchUps = (catchUps || []).filter(
      (c: any) => !c.isTransferCatchUp && c.recordedBy !== "transfer"
    );
    return validCatchUps.length;
  }
  const history = classifyStudentAttendanceHistory({
    lessons,
    attendances,
    catchUps,
  });
  const accountedCatchUps = new Set(history.filter((h) => h.isCatchUp).map((h) => h.lessonId));
  const lessonIds = new Set(lessons.map((l) => l.id));
  let extraCatchUp = 0;
  (catchUps || []).forEach((c: any) => {
    if (c.isTransferCatchUp || c.recordedBy === "transfer") {
      return;
    }
    // Visiting student attending catch-up in this host class from another group:
    // Does NOT consume credit in this host class.
    if (c.catchUpLessonId && lessonIds.has(c.catchUpLessonId) && !lessonIds.has(c.missedLessonId)) {
      return;
    }
    const missedAccounted = accountedCatchUps.has(c.missedLessonId);
    const catchUpAccounted = c.catchUpLessonId ? accountedCatchUps.has(c.catchUpLessonId) : false;
    const catchUpInLessons = c.catchUpLessonId ? lessonIds.has(c.catchUpLessonId) : false;
    if (!missedAccounted && !catchUpAccounted && !catchUpInLessons) {
      accountedCatchUps.add(c.missedLessonId);
      extraCatchUp += 1;
    }
  });
  return history.filter((h) => h.isConsumedCredit).length + extraCatchUp;
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
  // Held sessions (unresolved trailing absences where teacher was NOT paid) remain refund-eligible per Rule 5 & §7.22
  const refundableSessions = Math.min(totalPurchasedSessions, remainingSessions + heldSessions);

  return {
    totalPurchasedSessions,
    consumedSessions,
    heldSessions,
    forfeitedSessions,
    remainingSessions,
    refundableSessions,
  };
}

/**
 * Computes the exact refundable sessions count for a student in a cycle.
 */
export function computeStudentRefundableSessions({
  totalPurchasedSessions,
  history,
}: {
  totalPurchasedSessions: number;
  history: StudentAttendanceHistoryItem[];
}) {
  const consumedSessions = history.filter((h) => h.isConsumedCredit).length;
  const heldSessions = history.filter((h) => h.isHeld).length;
  const remainingSessions = Math.max(0, totalPurchasedSessions - consumedSessions);
  const refundableSessions = Math.min(totalPurchasedSessions, remainingSessions + heldSessions);

  return {
    remainingSessions,
    heldSessions,
    refundableSessions,
  };
}

/**
 * Computes the number of consecutive unexcused trailing absences for a student.
 * Breaks on PRESENT or CatchUp attendance. Passes through NOT_DEFINED.
 *
 * Rule: Non-starting students (students who have not yet attended any session
 * in this class) are never marked as suspended, regardless of how many pre-start
 * absences they have. Consecutive absences only begin tracking toward suspension
 * after the student's first attendance (PRESENT or CatchUp) in the class.
 */
export function computeStudentConsecutiveAbsences({
  lessons,
  attendances,
  catchUps = [],
}: {
  lessons: Array<{ id: number; startsAt: Date | string; isFree?: boolean; isTeacherAbsent?: boolean }>;
  attendances: Array<{ lessonId: number; status: string }>;
  catchUps?: Array<{ missedLessonId: number }>;
}): number {
  if (!lessons || lessons.length === 0 || !attendances || attendances.length === 0) {
    return 0;
  }
  const sortedLessons = [...lessons]
    .filter((l) => !l.isFree && !l.isTeacherAbsent)
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

  const attendanceMap = new Map<number, string>();
  attendances.forEach((a) => attendanceMap.set(a.lessonId, a.status));
  const catchUpSet = new Set<number>();
  catchUps.forEach((c) => catchUpSet.add(c.missedLessonId));

  // Determine if the student has started attending in this group (at least one PRESENT or CatchUp)
  const hasStarted = sortedLessons.some((l) => {
    const status = attendanceMap.get(l.id);
    return status === "PRESENT" || catchUpSet.has(l.id);
  });

  // Non-starting students are never marked as suspended, regardless of how many pre-start absences they have.
  if (!hasStarted) {
    return 0;
  }

  let consecutiveAbsences = 0;
  for (let i = sortedLessons.length - 1; i >= 0; i--) {
    const l = sortedLessons[i];
    const status = attendanceMap.get(l.id);
    if (!status) continue;
    if (status === "NOT_DEFINED") continue;
    if (status === "PRESENT" || catchUpSet.has(l.id)) {
      break;
    }
    if (status === "ABSENT") {
      consecutiveAbsences++;
    }
  }
  return consecutiveAbsences;
}

export interface ComputeStudentCreditParams {
  pricePerCycle: number;
  isFormation?: boolean;
  payerStatus?: string | null;
  siblingDiscountPercentage?: number | null;
  isSiblingWaived?: boolean;
  isPayerSiblingPaid?: boolean;
  tuitionVouchers?: Array<{
    amount?: any;
    isVoided?: boolean;
    isRefund?: boolean;
    status?: string | null;
    refunds?: Array<{ amount?: any }>;
  }>;
  transfersIn?: Array<{ transferredSessions: number }> | number;
  transfersOut?: Array<{ transferredSessions: number }> | number;
  creditResetOffset?: number | null;
  attendances?: Array<{
    lessonId: number;
    status: string;
    lesson?: { id: number; startsAt?: Date | string; isFree?: boolean; isTeacherAbsent?: boolean } | null;
  }>;
  lessons?: Array<{ id: number; startsAt: Date | string; isFree?: boolean; isTeacherAbsent?: boolean }>;
  catchUps?: Array<{
    missedLessonId: number;
    catchUpLessonId?: number;
    recordedAt?: Date | string;
    recordedBy?: string;
    isTransferCatchUp?: boolean;
    missedLesson?: any;
    catchUpLesson?: any;
  }>;
  payerRemainingCredit?: number | null;
}

export interface StudentCreditResult {
  purchasedSessions: number;
  transferredIn: number;
  transferredOut: number;
  attendedSessions: number;
  creditResetOffset: number;
  netSessions: number;
  effectiveLessonPrice: number;
  totalPaidTuition: number;
  netRefundableSessions: number;
  refundableSessions: number;
  refundableAmount: number;
  isFormation: boolean;
  isNonPayer: boolean;
  isSiblingWaived: boolean;
  status: "PAID" | "EXPIRING" | "UNPAID" | "SIBLING_WAIVED" | "NON_PAYER";
}

/**
 * Resolves remaining credit for a student whose tuition is paid by a designated payer sibling.
 * Follows the payer sibling's remaining credit in the matching class, or across payer's active classes.
 */
export function resolvePayerCredit({
  payerStudent,
  classId,
  classPricePerCycle,
  isFormation,
}: {
  payerStudent: any;
  classId?: number | null;
  classPricePerCycle?: number | null;
  isFormation?: boolean | null;
}): {
  netSessions: number;
  status: "PAID" | "EXPIRING" | "UNPAID";
  hasMatchingClass: boolean;
} {
  if (!payerStudent) {
    return { netSessions: 0, status: "UNPAID", hasMatchingClass: false };
  }

  // 1. Check if payer is enrolled in this class or has vouchers for this class
  if (classId) {
    const payerEnrollment = (payerStudent.enrollments || []).find(
      (e: any) => e.classId === classId && (e.status === "ACTIVE" || !e.status)
    );
    const payerVouchers = (payerStudent.vouchers || []).filter(
      (v: any) =>
        (v.classId === classId || v.class?.id === classId) &&
        v.paymentType === "TUITION_4SESSION" &&
        !v.isVoided &&
        !v.isRefund
    );

    if (payerEnrollment || payerVouchers.length > 0) {
      const payerAtts = (payerStudent.attendances || []).filter(
        (a: any) => a.lesson && a.lesson.classId === classId && !a.lesson.isFree
      );
      const payerCatchUps = (payerStudent.catchUpAttendances || []).filter(
        (cu: any) => cu.missedLesson && cu.missedLesson.classId === classId
      );

      const metrics = computeStudentCreditAndSessions({
        pricePerCycle: classPricePerCycle ?? Number(payerEnrollment?.class?.pricePerCycle || 0),
        isFormation: isFormation ?? Boolean(payerEnrollment?.class?.isFormation),
        payerStatus: payerEnrollment?.payerStatus || payerStudent.payerStatus || "NORMAL",
        tuitionVouchers: payerVouchers,
        transfersIn: payerEnrollment?.transfersTo || [],
        transfersOut: payerEnrollment?.transfersFrom || [],
        creditResetOffset: payerEnrollment?.creditResetOffset || 0,
        attendances: payerAtts,
        catchUps: payerCatchUps,
      });

      return {
        netSessions: metrics.netSessions,
        status: metrics.netSessions >= 2 ? "PAID" : metrics.netSessions === 1 ? "EXPIRING" : "UNPAID",
        hasMatchingClass: true,
      };
    }
  }

  // 2. If payer is not enrolled in this specific class, check active enrollments across other classes
  const activeEnrs = (payerStudent.enrollments || []).filter(
    (e: any) => e.status === "ACTIVE" || !e.status
  );

  if (activeEnrs.length > 0) {
    let minSessions = Infinity;
    for (const enr of activeEnrs) {
      const cId = enr.classId;
      const vouchers = (payerStudent.vouchers || []).filter(
        (v: any) =>
          (v.classId === cId || v.class?.id === cId) &&
          v.paymentType === "TUITION_4SESSION" &&
          !v.isVoided &&
          !v.isRefund
      );
      const atts = (payerStudent.attendances || []).filter(
        (a: any) => a.lesson && a.lesson.classId === cId && !a.lesson.isFree
      );
      const cus = (payerStudent.catchUpAttendances || []).filter(
        (cu: any) => cu.missedLesson && cu.missedLesson.classId === cId
      );

      const metrics = computeStudentCreditAndSessions({
        pricePerCycle: Number(enr.class?.pricePerCycle || 0),
        isFormation: Boolean(enr.class?.isFormation),
        payerStatus: enr.payerStatus || payerStudent.payerStatus || "NORMAL",
        tuitionVouchers: vouchers,
        transfersIn: enr.transfersTo || [],
        transfersOut: enr.transfersFrom || [],
        creditResetOffset: enr.creditResetOffset || 0,
        attendances: atts,
        catchUps: cus,
      });

      if (metrics.netSessions < minSessions) {
        minSessions = metrics.netSessions;
      }
    }
    const finalSessions = minSessions === Infinity ? 0 : minSessions;
    return {
      netSessions: finalSessions,
      status: finalSessions >= 2 ? "PAID" : finalSessions === 1 ? "EXPIRING" : "UNPAID",
      hasMatchingClass: false,
    };
  }

  // 3. Fallback: if no active enrollments, check if payer has any tuition vouchers at all
  const allTuitionVouchers = (payerStudent.vouchers || []).filter(
    (v: any) => v.paymentType === "TUITION_4SESSION" && !v.isVoided && !v.isRefund
  );
  if (allTuitionVouchers.length > 0) {
    const allAtts = (payerStudent.attendances || []).filter(
      (a: any) => a.lesson && !a.lesson.isFree
    );
    const metrics = computeStudentCreditAndSessions({
      pricePerCycle: classPricePerCycle ?? 0,
      payerStatus: payerStudent.payerStatus || "NORMAL",
      tuitionVouchers: allTuitionVouchers,
      attendances: allAtts,
    });
    return {
      netSessions: metrics.netSessions,
      status: metrics.netSessions >= 2 ? "PAID" : metrics.netSessions === 1 ? "EXPIRING" : "UNPAID",
      hasMatchingClass: false,
    };
  }

  return { netSessions: 0, status: "UNPAID", hasMatchingClass: false };
}


/**
 * Canonical calculation of student credit and lesson metrics.
 * Ensures strict, identical calculation across all pages:
 * Student Profile, Group Payments Page, Attendance Taking Page, and Dashboard.
 */
export function computeStudentCreditAndSessions({
  pricePerCycle,
  isFormation = false,
  payerStatus = "NORMAL",
  siblingDiscountPercentage,
  isSiblingWaived = false,
  isPayerSiblingPaid = true,
  tuitionVouchers = [],
  transfersIn = 0,
  transfersOut = 0,
  creditResetOffset = 0,
  attendances = [],
  lessons,
  catchUps = [],
  payerRemainingCredit,
}: ComputeStudentCreditParams): StudentCreditResult {
  const isForm = Boolean(isFormation);
  const isNonPayer = payerStatus === "NON_PAYER" || payerStatus === "FREE_ALL" || payerStatus === "FREE_TUITION";

  const siblingDiscountPct =
    siblingDiscountPercentage !== undefined && siblingDiscountPercentage !== null
      ? Number(siblingDiscountPercentage)
      : isSiblingWaived
      ? 100
      : 0;
  const isSiblingWaived100 = siblingDiscountPct >= 100;

  const cyclePrice = Math.max(0, Number(pricePerCycle || 0));
  const baseLessonPrice = cyclePrice > 0 ? cyclePrice / 4 : 0;
  const effectiveLessonPrice =
    siblingDiscountPct > 0 && siblingDiscountPct < 100
      ? baseLessonPrice * (1 - siblingDiscountPct / 100)
      : isSiblingWaived100
      ? 0
      : baseLessonPrice;

  const validVouchers = tuitionVouchers.filter(
    (v) => !v.isVoided && !v.isRefund && v.status !== "REFUNDED"
  );
  let totalPaidTuition = 0;
  validVouchers.forEach((v) => {
    const vAmount = Number(v.amount || 0);
    const vRefunded = (v.refunds || []).reduce((sum, r) => sum + Number(r.amount || 0), 0);
    totalPaidTuition += Math.max(0, vAmount - vRefunded);
  });

  let purchasedSessions = 0;
  if (!isForm) {
    if (isNonPayer) {
      purchasedSessions = 16;
    } else if (isSiblingWaived100) {
      purchasedSessions = isPayerSiblingPaid ? 16 : 0;
    } else if (effectiveLessonPrice > 0) {
      purchasedSessions = Math.floor(totalPaidTuition / effectiveLessonPrice);
    } else {
      validVouchers.forEach((v) => {
        const vAmount = Number(v.amount || 0);
        const vRefunded = (v.refunds || []).reduce((sum, r) => sum + Number(r.amount || 0), 0);
        const refundedSessions = vAmount > 0 ? Math.floor(vRefunded / (vAmount / 4)) : 0;
        purchasedSessions += Math.max(0, 4 - refundedSessions);
      });
    }
  }

  const tIn =
    typeof transfersIn === "number"
      ? transfersIn
      : (transfersIn || []).reduce((sum, t) => sum + Number(t.transferredSessions || 0), 0);
  const tOut =
    typeof transfersOut === "number"
      ? transfersOut
      : (transfersOut || []).reduce((sum, t) => sum + Number(t.transferredSessions || 0), 0);
  const offset = Number(creditResetOffset || 0);

  // Relevant non-free lessons where this student has an attendance record or a catch-up
  const relevantLessons: Array<{ id: number; startsAt: Date | string; isFree?: boolean; isTeacherAbsent?: boolean }> = [];
  const relevantAttendances: Array<{ lessonId: number; status: string }> = [];

  const attendanceMap = new Map<number, string>();
  attendances.forEach((a) => attendanceMap.set(a.lessonId, a.status));

  const catchUpSet = new Set<number>();
  (catchUps || []).forEach((c) => {
    if (c.missedLessonId) catchUpSet.add(c.missedLessonId);
    if (c.catchUpLessonId) catchUpSet.add(c.catchUpLessonId);
  });

  if (lessons && lessons.length > 0) {
    lessons.forEach((l) => {
      if (l.isFree) return;
      const st = attendanceMap.get(l.id);
      const hasCatchUp = catchUpSet.has(l.id);
      if (st || hasCatchUp) {
        relevantLessons.push(l);
        relevantAttendances.push({ lessonId: l.id, status: st || "ABSENT" });
      }
    });
  } else {
    const seenLessonIds = new Set<number>();
    attendances.forEach((a) => {
      if (a.lesson && !a.lesson.isFree) {
        seenLessonIds.add(a.lesson.id);
        relevantLessons.push({
          id: a.lesson.id,
          startsAt: a.lesson.startsAt || new Date(0),
          isFree: a.lesson.isFree,
          isTeacherAbsent: a.lesson.isTeacherAbsent,
        });
        relevantAttendances.push({ lessonId: a.lessonId, status: a.status });
      }
    });
    // Also include any catch-ups whose missed lesson wasn't present in attendances
    (catchUps || []).forEach((c: any) => {
      const ml = c.missedLesson;
      const mlId = c.missedLessonId;
      if (mlId && !seenLessonIds.has(mlId)) {
        seenLessonIds.add(mlId);
        relevantLessons.push({
          id: mlId,
          startsAt: ml?.startsAt || c.recordedAt || new Date(0),
          isFree: ml?.isFree || false,
          isTeacherAbsent: ml?.isTeacherAbsent || false,
        });
        relevantAttendances.push({ lessonId: mlId, status: "ABSENT" });
      }
    });
  }

  const history =
    relevantLessons.length > 0 && relevantAttendances.length > 0
      ? classifyStudentAttendanceHistory({
          lessons: relevantLessons,
          attendances: relevantAttendances,
          catchUps,
        })
      : [];

  const accountedCatchUps = new Set(history.filter((h) => h.isCatchUp).map((h) => h.lessonId));
  const relevantLessonIds = new Set(relevantLessons.map((l) => l.id));
  let extraCatchUpConsumed = 0;
  (catchUps || []).forEach((c: any) => {
    if (c.isTransferCatchUp || c.recordedBy === "transfer") {
      return;
    }
    // Visiting student attending catch-up in this host class from another group:
    // Does NOT consume credit in this host class.
    if (c.catchUpLessonId && relevantLessonIds.has(c.catchUpLessonId) && !relevantLessonIds.has(c.missedLessonId)) {
      return;
    }
    const missedAccounted = accountedCatchUps.has(c.missedLessonId);
    const catchUpAccounted = c.catchUpLessonId ? accountedCatchUps.has(c.catchUpLessonId) : false;
    const catchUpInLessons = c.catchUpLessonId ? relevantLessonIds.has(c.catchUpLessonId) : false;
    if (!missedAccounted && !catchUpAccounted && !catchUpInLessons) {
      accountedCatchUps.add(c.missedLessonId);
      extraCatchUpConsumed += 1;
    }
  });

  const attendedSessions = history.filter((h) => h.isConsumedCredit).length + extraCatchUpConsumed;
  const settledConsumedSessions =
    history.filter(
      (h) =>
        h.isConsumedCredit &&
        (h.classification === "PRESENT" ||
          h.classification === "INTERLEAVED_ABSENCE" ||
          h.classification === "FORFEITED_DROPOUT")
    ).length + extraCatchUpConsumed;

  let calculatedNetSessions = isForm ? 0 : (purchasedSessions + tIn - tOut) - attendedSessions + offset;
  if (payerRemainingCredit !== undefined && payerRemainingCredit !== null) {
    calculatedNetSessions = payerRemainingCredit;
  }
  const netSessions = calculatedNetSessions;
  const netRefundableSessions = isForm
    ? 0
    : (purchasedSessions + tIn - tOut) - settledConsumedSessions + offset;
  const refundableSessions = Math.max(0, Math.min(4, netRefundableSessions));

  let refundableAmount = 0;
  if (!isForm && !isNonPayer && !isSiblingWaived100) {
    if (effectiveLessonPrice > 0) {
      refundableAmount = Math.max(
        0,
        Math.round(
          totalPaidTuition +
            (tIn - tOut - settledConsumedSessions + offset) * effectiveLessonPrice
        )
      );
    } else {
      const latestValidVoucher = validVouchers[0];
      const fallbackLessonPrice = latestValidVoucher
        ? Number(latestValidVoucher.amount || 0) / 4
        : 0;
      refundableAmount = Math.max(0, Math.round(refundableSessions * fallbackLessonPrice));
    }
  }

  let status: "PAID" | "EXPIRING" | "UNPAID" | "SIBLING_WAIVED" | "NON_PAYER" = "UNPAID";
  if (isForm) {
    status = "PAID";
  } else if (isNonPayer) {
    status = "NON_PAYER";
  } else if (payerRemainingCredit !== undefined && payerRemainingCredit !== null) {
    if (netSessions >= 2) {
      status = "PAID";
    } else if (netSessions === 1) {
      status = "EXPIRING";
    } else {
      status = "UNPAID";
    }
  } else if (isSiblingWaived100) {
    status = isPayerSiblingPaid ? "SIBLING_WAIVED" : "UNPAID";
  } else if (netSessions >= 2) {
    status = "PAID";
  } else if (netSessions === 1) {
    status = "EXPIRING";
  } else {
    status = "UNPAID";
  }

  return {
    purchasedSessions,
    transferredIn: tIn,
    transferredOut: tOut,
    attendedSessions,
    creditResetOffset: offset,
    netSessions,
    effectiveLessonPrice,
    totalPaidTuition,
    netRefundableSessions,
    refundableSessions,
    refundableAmount,
    isFormation: isForm,
    isNonPayer,
    isSiblingWaived: isSiblingWaived100,
    status,
  };
}


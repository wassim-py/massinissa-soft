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

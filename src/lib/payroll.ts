import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { normalizeDateToStartOfDay, upsertDailyLedger } from "./ledger";

export interface TeacherPayrollCalculation {
  teacherId: string;
  teacherName: string;
  totalSessions: number;
  totalPresentAttendances?: number;
  percentageOfSessionFee?: number | null;
  grossAmount: number;
  salaryAdvances: number;
  photocopyDeductions: number;
  netAmount: number;
  branchBreakdown: Array<{
    branchId: number;
    branchName: string;
    sessionsCount: number;
    freeSessionsCount: number;
    effectiveRate: number;
    amount: number;
  }>;
  sessionDetails?: Array<{
    lessonId: number;
    startsAt: Date;
    className: string;
    branchName: string;
    presentCount: number;
    payingCount?: number;
    pricePerCycle: number;
    sessionPrice: number;
    teacherCut: number;
    lessonAmount: number;
    isFree: boolean;
    isExtra: boolean;
    isCatchUp: boolean;
  }>;
  salaryAdvanceDetails: Array<{
    id: number;
    amount: number;
    date: Date;
  }>;
  photocopyChargeDetails: Array<{
    id: number;
    branchId: number;
    branchName: string;
    pages: number;
    costAmount: number;
    date: Date;
    recordedBy: string;
  }>;
}

/**
 * Normalizes end date to include the entire day up to 23:59:59.999 UTC
 */
export function normalizeDateToEndOfDay(date: Date | string): Date {
  const d = new Date(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
}

/**
 * Calculates payroll for a single teacher over a date range.
 * Consumes Attendance records to find lessons that ACTUALLY HAPPENED (including isFree = true).
 * Applies branch override rates if configured, otherwise falls back to active TeacherPayRate.
 * Sums SalaryAdvances and PhotocopyCharges in the period.
 */
export async function calculateTeacherPayroll(
  teacherId: string,
  startDate: Date,
  endDate: Date
): Promise<TeacherPayrollCalculation | null> {
  const teacher = await prisma.teacher.findUnique({
    where: { id: teacherId },
    include: {
      TeacherBranch: {
        include: { Branch: true },
      },
      TeacherPayRate: {
        orderBy: [{ effectiveFrom: "desc" }, { id: "desc" }],
      },
    },
  });

  if (!teacher) return null;

  // Active general pay rate effective on or before endDate
  const activePayRate = teacher.TeacherPayRate.find(
    (r) => new Date(r.effectiveFrom) <= endDate
  ) || teacher.TeacherPayRate[0];

  const defaultSessionRate = activePayRate?.ratePerSession
    ? Number(activePayRate.ratePerSession)
    : 0;
  const fixedMonthly = activePayRate?.fixedMonthly
    ? Number(activePayRate.fixedMonthly)
    : 0;
  const percentageOfSessionFee = activePayRate?.percentageOfSessionFee
    ? Number(activePayRate.percentageOfSessionFee)
    : null;

  // Map of branchId -> branch override rate
  const branchRateMap = new Map<number, number>();
  teacher.TeacherBranch.forEach((tb) => {
    if (tb.payRate !== null && tb.payRate !== undefined) {
      branchRateMap.set(tb.branchId, Number(tb.payRate));
    }
  });

  // Find all lessons in the period that ACTUALLY HAPPENED (have at least one attendance record)
  // Per §2.2, isFree = true lessons are included!
  const lessons = await prisma.lesson.findMany({
    where: {
      teacherId: teacher.id,
      startsAt: {
        gte: startDate,
        lte: endDate,
      },
      attendances: {
        some: {}, // Only lessons where attendance was taken
      },
    },
    include: {
      branch: true,
      class: {
        include: {
          enrollments: {
            select: {
              studentId: true,
              payerStatus: true,
            },
          },
        },
      },
      attendances: true,
    },
    orderBy: { startsAt: "asc" },
  });

  // Aggregate sessions by branch and compute earnings per §2.9 & §7.18
  const branchSessionsMap = new Map<
    number,
    {
      branchName: string;
      totalSessions: number;
      freeSessions: number;
      amount: number;
      totalPresentAttendances: number;
    }
  >();

  // Initialize with all branches the teacher is associated with
  teacher.TeacherBranch.forEach((tb) => {
    branchSessionsMap.set(tb.branchId, {
      branchName: tb.Branch.name,
      totalSessions: 0,
      freeSessions: 0,
      amount: 0,
      totalPresentAttendances: 0,
    });
  });

  let totalSessions = 0;
  let totalPresentAttendances = 0;
  let calculatedGross = 0;
  const sessionDetails: NonNullable<TeacherPayrollCalculation["sessionDetails"]> = [];

  lessons.forEach((lesson) => {
    const existing = branchSessionsMap.get(lesson.branchId) || {
      branchName: lesson.branch.name,
      totalSessions: 0,
      freeSessions: 0,
      amount: 0,
      totalPresentAttendances: 0,
    };
    existing.totalSessions += 1;
    totalSessions += 1;
    if (lesson.isFree) {
      existing.freeSessions += 1;
    }

    // Actual student attendance (PRESENT only, per §2.9 & attendance modeling)
    const presentAttendances = lesson.attendances.filter((a) => a.status === "PRESENT");
    const presentCount = presentAttendances.length;
    existing.totalPresentAttendances += presentCount;
    totalPresentAttendances += presentCount;

    // Filter students whose payer status entitles teacher to payment (§7.18 / Wassim's rule):
    // Teacher is NOT paid for NON_PAYER or SCHOOL_FEES_ONLY students.
    const payingAttendances = presentAttendances.filter((att) => {
      const enrollment = lesson.class?.enrollments?.find((e) => e.studentId === att.studentId);
      const payerStatus = enrollment?.payerStatus || "NORMAL";
      return payerStatus === "NORMAL";
    });
    const payingCount = payingAttendances.length;

    let lessonAmount = 0;
    let effectiveRateForSession = 0;
    const pricePerCycle = lesson.class?.pricePerCycle ? Number(lesson.class.pricePerCycle) : 0;
    const sessionPrice = pricePerCycle > 0 ? pricePerCycle / 4 : 0;

    // Determine rate and amount
    if (branchRateMap.has(lesson.branchId)) {
      // Branch-level override takes precedence if explicitly set
      effectiveRateForSession = branchRateMap.get(lesson.branchId)!;
      lessonAmount = effectiveRateForSession;
    } else if (percentageOfSessionFee !== null && percentageOfSessionFee > 0) {
      // Primary model (§2.9 & §7.18): Teacher earns percentage of session tuition based on PAYING attendees
      effectiveRateForSession = (sessionPrice * percentageOfSessionFee) / 100;
      lessonAmount = payingCount * effectiveRateForSession;
    } else if (defaultSessionRate > 0) {
      // Flat rate fallback
      effectiveRateForSession = defaultSessionRate;
      lessonAmount = defaultSessionRate;
    }

    existing.amount += lessonAmount;
    calculatedGross += lessonAmount;
    branchSessionsMap.set(lesson.branchId, existing);

    sessionDetails.push({
      lessonId: lesson.id,
      startsAt: lesson.startsAt,
      className: lesson.class?.name || "فوج",
      branchName: lesson.branch.name,
      presentCount,
      payingCount,
      pricePerCycle,
      sessionPrice,
      teacherCut: effectiveRateForSession,
      lessonAmount,
      isFree: lesson.isFree,
      isExtra: lesson.isExtra,
      isCatchUp: lesson.isCatchUp,
    });
  });

  const branchBreakdown: TeacherPayrollCalculation["branchBreakdown"] = [];

  for (const [branchId, data] of branchSessionsMap.entries()) {
    // Only include branches where lessons occurred, unless fixedMonthly applies and no lessons occurred anywhere
    if (data.totalSessions === 0 && fixedMonthly === 0) continue;

    const effectiveRate = branchRateMap.has(branchId)
      ? branchRateMap.get(branchId)!
      : (percentageOfSessionFee !== null && percentageOfSessionFee > 0)
        ? (data.totalSessions > 0 ? data.amount / data.totalSessions : 0)
        : defaultSessionRate;

    branchBreakdown.push({
      branchId,
      branchName: data.branchName,
      sessionsCount: data.totalSessions,
      freeSessionsCount: data.freeSessions,
      effectiveRate: Math.round(effectiveRate * 100) / 100,
      amount: Math.round(data.amount * 100) / 100,
    });
  }

  // If teacher is on fixedMonthly and no per-session rate is used, or fixed monthly base
  let grossAmount = Math.round(calculatedGross * 100) / 100;
  if (fixedMonthly > 0) {
    grossAmount = fixedMonthly;
    // Distribute informational branch breakdown proportionally if lessons occurred
    if (totalSessions > 0) {
      branchBreakdown.forEach((b) => {
        b.amount = Math.round((b.sessionsCount / totalSessions) * fixedMonthly * 100) / 100;
      });
    } else if (branchBreakdown.length > 0) {
      // Split evenly across assigned branches if no sessions
      const splitAmount = Math.round((fixedMonthly / branchBreakdown.length) * 100) / 100;
      branchBreakdown.forEach((b) => {
        b.amount = splitAmount;
      });
    }
  }

  // Fetch Salary Advances within or up to this period
  const salaryAdvancesList = await prisma.salaryAdvance.findMany({
    where: {
      personId: teacher.id,
      date: {
        gte: startDate,
        lte: endDate,
      },
    },
    orderBy: { date: "asc" },
  });

  const totalAdvances = salaryAdvancesList.reduce(
    (sum, a) => sum + Number(a.amount),
    0
  );

  // Fetch Photocopy Charges for this teacher in this period (§2.5)
  const photocopyChargesList = await prisma.photocopyCharge.findMany({
    where: {
      teacherId: teacher.id,
      date: {
        gte: startDate,
        lte: endDate,
      },
    },
    include: {
      Branch: true,
    },
    orderBy: { date: "asc" },
  });

  const totalPhotocopyDeductions = photocopyChargesList.reduce(
    (sum, c) => sum + Number(c.costAmount),
    0
  );

  const netAmount = Math.max(0, grossAmount - totalAdvances - totalPhotocopyDeductions);

  return {
    teacherId: teacher.id,
    teacherName: teacher.name,
    totalSessions,
    totalPresentAttendances,
    percentageOfSessionFee,
    sessionDetails,
    grossAmount,
    salaryAdvances: totalAdvances,
    photocopyDeductions: totalPhotocopyDeductions,
    netAmount,
    branchBreakdown,
    salaryAdvanceDetails: salaryAdvancesList.map((a) => ({
      id: a.id,
      amount: Number(a.amount),
      date: a.date,
    })),
    photocopyChargeDetails: photocopyChargesList.map((c) => ({
      id: c.id,
      branchId: c.branchId,
      branchName: c.Branch.name,
      pages: c.pages,
      costAmount: Number(c.costAmount),
      date: c.date,
      recordedBy: c.recordedBy,
    })),
  };
}

/**
 * Generates a complete PayrollRun across all teachers for a given period.
 * Creates ONE consolidated Payslip per teacher across all branches,
 * populated with informational PayslipBranchLine breakdown items.
 */
export async function generatePayrollRun(
  periodStart: Date | string,
  periodEnd: Date | string
) {
  const startDate = normalizeDateToStartOfDay(periodStart);
  const endDate = normalizeDateToEndOfDay(periodEnd);

  // Get all teachers
  const teachers = await prisma.teacher.findMany({
    select: { id: true, name: true },
  });

  const teacherCalculations: TeacherPayrollCalculation[] = [];

  for (const t of teachers) {
    const calc = await calculateTeacherPayroll(t.id, startDate, endDate);
    // Only include teachers who taught lessons, have fixed salary, or have deductions
    if (
      calc &&
      (calc.totalSessions > 0 ||
        calc.grossAmount > 0 ||
        calc.salaryAdvances > 0 ||
        calc.photocopyDeductions > 0)
    ) {
      teacherCalculations.push(calc);
    }
  }

  // Atomically create the PayrollRun and all consolidated Payslips + PayslipBranchLines
  return await prisma.$transaction(async (tx) => {
    const payrollRun = await tx.payrollRun.create({
      data: {
        periodStart: startDate,
        periodEnd: endDate,
        status: "DRAFT",
      },
    });

    for (const calc of teacherCalculations) {
      const payslip = await tx.payslip.create({
        data: {
          payrollRunId: payrollRun.id,
          personId: calc.teacherId,
          personType: "TEACHER",
          sessionsCount: calc.totalSessions,
          grossAmount: new Prisma.Decimal(calc.grossAmount),
          advances: new Prisma.Decimal(calc.salaryAdvances),
          photocopyDeductions: new Prisma.Decimal(calc.photocopyDeductions),
          netAmount: new Prisma.Decimal(calc.netAmount),
        },
      });

      // Create informational branch lines
      for (const line of calc.branchBreakdown) {
        if (line.sessionsCount > 0 || line.amount > 0) {
          await tx.payslipBranchLine.create({
            data: {
              payslipId: payslip.id,
              branchId: line.branchId,
              sessionsCount: line.sessionsCount,
              amount: new Prisma.Decimal(line.amount),
            },
          });
        }
      }
    }

    return payrollRun;
  });
}

/**
 * Updates a PayrollRun status (DRAFT -> VALIDATED -> PAID).
 * When marked PAID, writes PAYROLL_OUT entries to DailyLedger for each branch.
 */
export async function updatePayrollRunStatus(
  payrollRunId: number,
  newStatus: "DRAFT" | "VALIDATED" | "PAID"
) {
  return await prisma.$transaction(async (tx) => {
    const run = await tx.payrollRun.findUnique({
      where: { id: payrollRunId },
      include: {
        Payslip: {
          include: {
            PayslipBranchLine: true,
          },
        },
      },
    });

    if (!run) {
      throw new Error(`Payroll run #${payrollRunId} not found`);
    }

    const updated = await tx.payrollRun.update({
      where: { id: payrollRunId },
      data: { status: newStatus },
    });

    // If marked as PAID, post ledger expense per branch from PayslipBranchLine
    if (newStatus === "PAID") {
      const branchTotals = new Map<number, number>();

      run.Payslip.forEach((slip) => {
        slip.PayslipBranchLine.forEach((line) => {
          const prev = branchTotals.get(line.branchId) || 0;
          branchTotals.set(line.branchId, prev + Number(line.amount));
        });
      });

      for (const [branchId, totalBranchPayroll] of branchTotals.entries()) {
        if (totalBranchPayroll > 0) {
          await upsertDailyLedger(tx, {
            branchId,
            date: run.periodEnd,
            type: "PAYROLL_OUT" as any,
            amount: totalBranchPayroll,
          });
        }
      }
    }

    return updated;
  });
}

/**
 * Aggregates Owner View data: Total School Revenue vs. Total Payroll Cost.
 * Primary view is school-wide; secondary view breaks down by branch.
 */
export async function getOwnerPayrollOverview(startDate: Date, endDate: Date) {
  // 1. Total revenue from DailyLedger in period
  const revenueEntries = await prisma.dailyLedger.findMany({
    where: {
      date: {
        gte: startDate,
        lte: endDate,
      },
      type: {
        not: "PAYROLL_OUT",
      },
    },
    include: { Branch: true },
  });

  const totalRevenue = revenueEntries.reduce(
    (sum, e) => sum + Number(e.amount),
    0
  );

  // 2. Total payroll cost from Payslips associated with runs in period
  const payslips = await prisma.payslip.findMany({
    where: {
      PayrollRun: {
        periodStart: { gte: startDate },
        periodEnd: { lte: endDate },
      },
    },
    include: {
      PayrollRun: true,
      PayslipBranchLine: {
        include: { Branch: true },
      },
    },
  });

  const totalGrossPayroll = payslips.reduce((s, p) => s + Number(p.grossAmount), 0);
  const totalAdvances = payslips.reduce((s, p) => s + Number(p.advances), 0);
  const totalPhotocopyDeductions = payslips.reduce((s, p) => s + Number(p.photocopyDeductions), 0);
  const totalNetPayroll = payslips.reduce((s, p) => s + Number(p.netAmount), 0);

  // Net operating margin for the school
  const operatingMargin = totalRevenue - totalGrossPayroll;

  // Branch breakdown (Secondary view)
  const branches = await prisma.branch.findMany();
  const branchBreakdown = branches.map((branch) => {
    const branchRev = revenueEntries
      .filter((e) => e.branchId === branch.id)
      .reduce((sum, e) => sum + Number(e.amount), 0);

    let branchPayroll = 0;
    payslips.forEach((slip) => {
      slip.PayslipBranchLine.forEach((line) => {
        if (line.branchId === branch.id) {
          branchPayroll += Number(line.amount);
        }
      });
    });

    return {
      branchId: branch.id,
      branchName: branch.name,
      revenue: branchRev,
      payrollCost: branchPayroll,
      margin: branchRev - branchPayroll,
    };
  });

  return {
    totalRevenue,
    totalGrossPayroll,
    totalAdvances,
    totalPhotocopyDeductions,
    totalNetPayroll,
    operatingMargin,
    branchBreakdown,
  };
}

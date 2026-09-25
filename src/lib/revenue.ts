import prisma from "./prisma";
import { format, startOfWeek, endOfWeek, parseISO } from "date-fns";
import { arDZ } from "date-fns/locale";
import { normalizeDateToStartOfDay, LedgerVoucherCategory } from "./ledger";

export interface RevenueSummary {
  grossRevenue: number;
  tuition: number;
  inscription: number;
  book: number;
  atelierFormation: number;
  refunds: number; // Always positive magnitude, shown separately
  missing: number; // Confirmed cash box deficit, deducted from net ("manque")
  surplus: number; // Confirmed cash box surplus, added to net ("excédent")
  netRevenue: number; // grossRevenue - refunds - missing + surplus
}

export interface BranchComparisonItem extends RevenueSummary {
  branchId: number;
  branchName: string;
}

export interface TimelineBucket extends RevenueSummary {
  key: string;
  label: string;
  dateStart: string;
  dateEnd: string;
  branchName?: string;
}

export interface RevenueDashboardVoucher {
  id: number;
  number: number;
  studentId: string;
  studentName: string;
  studentPhone: string | null;
  classId: number | null;
  className: string;
  branchId: number;
  branchName: string;
  issuingBranchName: string;
  paymentType: string;
  amount: number;
  issuedAt: string;
  issuedBy: string;
  isVoided: boolean;
  isPartial: boolean;
  status: string | null;
}

export interface RevenueDashboardData {
  periodMode: "daily" | "weekly" | "monthly";
  dateFrom: string;
  dateTo: string;
  selectedBranchId: number | "all";
  branches: Array<{ id: number; name: string }>;
  summary: RevenueSummary;
  branchComparison: BranchComparisonItem[];
  timeline: TimelineBucket[];
  vouchers: RevenueDashboardVoucher[];
  recentLedgerEntries: Array<{
    id: number;
    date: Date;
    branchName: string;
    type: string;
    amount: number;
  }>;
}

/**
 * Formats a period key into an Arabic / international readable label.
 */
function formatBucketLabel(date: Date, mode: "daily" | "weekly" | "monthly"): string {
  try {
    if (mode === "daily") {
      return format(date, "d MMMM yyyy", { locale: arDZ });
    }
    if (mode === "weekly") {
      const s = startOfWeek(date, { weekStartsOn: 6 }); // Algeria week starts Saturday
      const e = endOfWeek(date, { weekStartsOn: 6 });
      return `${format(s, "d MMM", { locale: arDZ })} - ${format(e, "d MMM yyyy", { locale: arDZ })}`;
    }
    if (mode === "monthly") {
      return format(date, "LLLL yyyy", { locale: arDZ });
    }
  } catch {
    // fallback
  }
  return date.toISOString().split("T")[0];
}

/**
 * Fetches and aggregates all daily revenue data built strictly on DailyLedger.
 */
export async function getDailyRevenueDashboardData(options?: {
  branchId?: number | "all";
  dateFrom?: string;
  dateTo?: string;
  periodMode?: "daily" | "weekly" | "monthly";
}): Promise<RevenueDashboardData> {
  const periodMode = options?.periodMode || "daily";
  const branchFilter = options?.branchId ?? "all";

  // Compute default date range if missing (default: current month)
  const today = new Date();
  const defaultDateTo = today.toISOString().split("T")[0];
  const firstDayOfMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const defaultDateFrom = firstDayOfMonth.toISOString().split("T")[0];

  const dateFromStr = options?.dateFrom || defaultDateFrom;
  const dateToStr = options?.dateTo || defaultDateTo;

  const [fromY, fromM, fromD] = dateFromStr.split("T")[0].split("-").map(Number);
  const startDate = new Date(Date.UTC(fromY, fromM - 1, fromD, 0, 0, 0, 0));

  const [toY, toM, toD] = dateToStr.split("T")[0].split("-").map(Number);
  const endDate = new Date(Date.UTC(toY, toM - 1, toD, 23, 59, 59, 999));

  // Fetch branches
  const branches = await prisma.branch.findMany({
    select: { id: true, name: true },
    orderBy: { id: "asc" },
  });

  const targetBranchId = branchFilter !== "all" ? Number(branchFilter) : undefined;

  // Query DailyLedger within the date range, confirmed MissingMoney, confirmed SurplusMoney, and individual Vouchers
  const [ledgerRows, comparisonRows, confirmedMissingRows, confirmedSurplusRows, voucherRows] = await Promise.all([
    prisma.dailyLedger.findMany({
      where: {
        date: {
          gte: startDate,
          lte: endDate,
        },
        ...(targetBranchId ? { branchId: targetBranchId } : {}),
      },
      include: {
        Branch: { select: { id: true, name: true } },
      },
      orderBy: { date: "asc" },
    }),
    prisma.dailyLedger.findMany({
      where: {
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        Branch: { select: { id: true, name: true } },
      },
    }),
    prisma.missingMoney.findMany({
      where: {
        date: {
          gte: startDate,
          lte: endDate,
        },
        status: "CONFIRMED",
      },
      include: {
        branch: { select: { id: true, name: true } },
      },
    }),
    prisma.surplusMoney.findMany({
      where: {
        date: {
          gte: startDate,
          lte: endDate,
        },
        status: "CONFIRMED",
      },
      include: {
        branch: { select: { id: true, name: true } },
      },
    }),
    prisma.voucher.findMany({
      where: {
        issuedAt: {
          gte: startDate,
          lte: endDate,
        },
        ...(targetBranchId ? { targetBranchId } : {}),
      },
      include: {
        student: { select: { id: true, name: true, phone: true } },
        class: { select: { id: true, name: true } },
        workshop: { select: { id: true, title: true } },
      },
      orderBy: { issuedAt: "desc" },
    }),
  ]);

  // Calculate Overall Summary
  const summary: RevenueSummary = {
    grossRevenue: 0,
    tuition: 0,
    inscription: 0,
    book: 0,
    atelierFormation: 0,
    refunds: 0,
    missing: 0,
    surplus: 0,
    netRevenue: 0,
  };

  for (const row of ledgerRows) {
    const amount = Number(row.amount);
    const type = row.type as LedgerVoucherCategory;

    if (type === "REFUND") {
      summary.refunds += Math.abs(amount);
    } else {
      summary.grossRevenue += amount;
      if (type === "TUITION" || (type as string) === "EXTRA_SESSION") summary.tuition += amount;
      else if (type === "INSCRIPTION") summary.inscription += amount;
      else if (type === "BOOK") summary.book += amount;
      else if (type === "ATELIER_FORMATION") summary.atelierFormation += amount;
    }
  }

  for (const m of confirmedMissingRows) {
    if (!targetBranchId || m.branchId === targetBranchId) {
      summary.missing += Number(m.amount);
    }
  }
  for (const s of confirmedSurplusRows) {
    if (!targetBranchId || s.branchId === targetBranchId) {
      summary.surplus += Number(s.amount);
    }
  }
  summary.netRevenue = summary.grossRevenue - summary.refunds - summary.missing + summary.surplus;

  // Calculate Branch Comparison (for all branches)
  const branchCompMap = new Map<number, BranchComparisonItem>();
  for (const b of branches) {
    branchCompMap.set(b.id, {
      branchId: b.id,
      branchName: b.name,
      grossRevenue: 0,
      tuition: 0,
      inscription: 0,
      book: 0,
      atelierFormation: 0,
      refunds: 0,
      missing: 0,
      surplus: 0,
      netRevenue: 0,
    });
  }

  for (const row of comparisonRows) {
    const item = branchCompMap.get(row.branchId);
    if (!item) continue;
    const amount = Number(row.amount);
    const type = row.type as LedgerVoucherCategory;

    if (type === "REFUND") {
      item.refunds += Math.abs(amount);
    } else {
      item.grossRevenue += amount;
      if (type === "TUITION" || (type as string) === "EXTRA_SESSION") item.tuition += amount;
      else if (type === "INSCRIPTION") item.inscription += amount;
      else if (type === "BOOK") item.book += amount;
      else if (type === "ATELIER_FORMATION") item.atelierFormation += amount;
    }
    item.netRevenue = item.grossRevenue - item.refunds - item.missing + item.surplus;
  }

  for (const m of confirmedMissingRows) {
    const item = branchCompMap.get(m.branchId);
    if (item) {
      item.missing += Number(m.amount);
      item.netRevenue = item.grossRevenue - item.refunds - item.missing + item.surplus;
    }
  }

  for (const s of confirmedSurplusRows) {
    const item = branchCompMap.get(s.branchId);
    if (item) {
      item.surplus += Number(s.amount);
      item.netRevenue = item.grossRevenue - item.refunds - item.missing + item.surplus;
    }
  }

  const branchComparison = Array.from(branchCompMap.values());

  // Aggregate Timeline (Daily, Weekly, Monthly)
  const timelineMap = new Map<string, TimelineBucket>();

  for (const row of ledgerRows) {
    const d = new Date(row.date);
    let bucketKey: string;
    let dateStartStr: string;
    let dateEndStr: string;

    if (periodMode === "daily") {
      bucketKey = d.toISOString().split("T")[0];
      dateStartStr = bucketKey;
      dateEndStr = bucketKey;
    } else if (periodMode === "weekly") {
      const sw = startOfWeek(d, { weekStartsOn: 6 });
      const ew = endOfWeek(d, { weekStartsOn: 6 });
      bucketKey = sw.toISOString().split("T")[0];
      dateStartStr = bucketKey;
      dateEndStr = ew.toISOString().split("T")[0];
    } else {
      // monthly
      bucketKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      dateStartStr = `${bucketKey}-01`;
      dateEndStr = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().split("T")[0];
    }

    let bucket = timelineMap.get(bucketKey);
    if (!bucket) {
      bucket = {
        key: bucketKey,
        label: formatBucketLabel(d, periodMode),
        dateStart: dateStartStr,
        dateEnd: dateEndStr,
        grossRevenue: 0,
        tuition: 0,
        inscription: 0,
        book: 0,
        atelierFormation: 0,
        refunds: 0,
        missing: 0,
        surplus: 0,
        netRevenue: 0,
      };
      timelineMap.set(bucketKey, bucket);
    }

    const amount = Number(row.amount);
    const type = row.type as LedgerVoucherCategory;

    if (type === "REFUND") {
      bucket.refunds += Math.abs(amount);
    } else {
      bucket.grossRevenue += amount;
      if (type === "TUITION" || (type as string) === "EXTRA_SESSION") bucket.tuition += amount;
      else if (type === "INSCRIPTION") bucket.inscription += amount;
      else if (type === "BOOK") bucket.book += amount;
      else if (type === "ATELIER_FORMATION") bucket.atelierFormation += amount;
    }
    bucket.netRevenue = bucket.grossRevenue - bucket.refunds - bucket.missing + bucket.surplus;
  }

  for (const m of confirmedMissingRows) {
    if (targetBranchId && m.branchId !== targetBranchId) continue;
    const d = new Date(m.date);
    let bucketKey: string;
    let dateStartStr: string;
    let dateEndStr: string;

    if (periodMode === "daily") {
      bucketKey = d.toISOString().split("T")[0];
      dateStartStr = bucketKey;
      dateEndStr = bucketKey;
    } else if (periodMode === "weekly") {
      const sw = startOfWeek(d, { weekStartsOn: 6 });
      const ew = endOfWeek(d, { weekStartsOn: 6 });
      bucketKey = sw.toISOString().split("T")[0];
      dateStartStr = bucketKey;
      dateEndStr = ew.toISOString().split("T")[0];
    } else {
      bucketKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      dateStartStr = `${bucketKey}-01`;
      dateEndStr = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().split("T")[0];
    }

    let bucket = timelineMap.get(bucketKey);
    if (!bucket) {
      bucket = {
        key: bucketKey,
        label: formatBucketLabel(d, periodMode),
        dateStart: dateStartStr,
        dateEnd: dateEndStr,
        grossRevenue: 0,
        tuition: 0,
        inscription: 0,
        book: 0,
        atelierFormation: 0,
        refunds: 0,
        missing: 0,
        surplus: 0,
        netRevenue: 0,
      };
      timelineMap.set(bucketKey, bucket);
    }

    const amount = Number(m.amount);
    bucket.missing += amount;
    bucket.netRevenue = bucket.grossRevenue - bucket.refunds - bucket.missing + bucket.surplus;
  }

  for (const s of confirmedSurplusRows) {
    if (targetBranchId && s.branchId !== targetBranchId) continue;
    const d = new Date(s.date);
    let bucketKey: string;
    let dateStartStr: string;
    let dateEndStr: string;

    if (periodMode === "daily") {
      bucketKey = d.toISOString().split("T")[0];
      dateStartStr = bucketKey;
      dateEndStr = bucketKey;
    } else if (periodMode === "weekly") {
      const sw = startOfWeek(d, { weekStartsOn: 6 });
      const ew = endOfWeek(d, { weekStartsOn: 6 });
      bucketKey = sw.toISOString().split("T")[0];
      dateStartStr = bucketKey;
      dateEndStr = ew.toISOString().split("T")[0];
    } else {
      bucketKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      dateStartStr = `${bucketKey}-01`;
      dateEndStr = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().split("T")[0];
    }

    let bucket = timelineMap.get(bucketKey);
    if (!bucket) {
      bucket = {
        key: bucketKey,
        label: formatBucketLabel(d, periodMode),
        dateStart: dateStartStr,
        dateEnd: dateEndStr,
        grossRevenue: 0,
        tuition: 0,
        inscription: 0,
        book: 0,
        atelierFormation: 0,
        refunds: 0,
        missing: 0,
        surplus: 0,
        netRevenue: 0,
      };
      timelineMap.set(bucketKey, bucket);
    }

    const amount = Number(s.amount);
    bucket.surplus += amount;
    bucket.netRevenue = bucket.grossRevenue - bucket.refunds - bucket.missing + bucket.surplus;
  }

  // Sort timeline by date descending for tabular view
  const timeline = Array.from(timelineMap.values()).sort((a, b) => b.key.localeCompare(a.key));

  const branchNameMap = new Map(branches.map((b) => [b.id, b.name]));

  // Format detailed vouchers for audit trail and day-level inspection
  const formattedVouchers: RevenueDashboardVoucher[] = voucherRows.map((v) => ({
    id: v.id,
    number: v.number,
    studentId: v.studentId,
    studentName: v.student?.name || "—",
    studentPhone: v.student?.phone || null,
    classId: v.classId,
    className: v.class?.name || v.workshop?.title || "—",
    branchId: v.targetBranchId,
    branchName: branchNameMap.get(v.targetBranchId) || `Branche #${v.targetBranchId}`,
    issuingBranchName: branchNameMap.get(v.issuingBranchId) || `Branche #${v.issuingBranchId}`,
    paymentType: v.paymentType,
    amount: Number(v.amount),
    issuedAt: v.issuedAt.toISOString(),
    issuedBy: v.issuedBy,
    isVoided: v.isVoided,
    isPartial: v.isPartial,
    status: v.status,
  }));

  // Recent ledger entries for transparency
  const recentLedgerEntries = ledgerRows
    .slice(-30)
    .reverse()
    .map((r) => ({
      id: r.id,
      date: r.date,
      branchName: r.Branch.name,
      type: r.type,
      amount: Number(r.amount),
    }));

  return {
    periodMode,
    dateFrom: dateFromStr,
    dateTo: dateToStr,
    selectedBranchId: branchFilter,
    branches,
    summary,
    branchComparison,
    timeline,
    vouchers: formattedVouchers,
    recentLedgerEntries,
  };
}

export interface DailyBranchLedgerData {
  branch: {
    id: number;
    name: string;
    address: string;
  };
  date: Date;
  dateStr: string;
  summary: {
    tuition: number;
    inscription: number;
    book: number;
    atelierFormation: number;
    grossRevenue: number;
    refunds: number;
    confirmedMissing: number;
    pendingMissing: number;
    confirmedSurplus: number;
    pendingSurplus: number;
    netCash: number; // grossRevenue - refunds - confirmedMissing + confirmedSurplus
  };
  missingMoneyList: Array<{
    id: number;
    amount: number;
    reason: string | null;
    declaredBy: string;
    status: string;
    confirmedBy: string | null;
    confirmedAt: Date | null;
    createdAt: Date;
  }>;
  surplusMoneyList: Array<{
    id: number;
    amount: number;
    reason: string | null;
    declaredBy: string;
    status: string;
    confirmedBy: string | null;
    confirmedAt: Date | null;
    createdAt: Date;
  }>;
  todayVouchers: Array<{
    id: number;
    number: number;
    studentName: string;
    className: string;
    paymentType: string;
    amount: number;
    issuedAt: Date;
    issuedBy: string;
    isPartial: boolean;
  }>;
}

/**
 * Fetches money at a specific branch for a specific day, broken down by fee types.
 * Reads from the exact same DailyLedger and Voucher tables as the revenue dashboard.
 */
export async function getDailyBranchLedgerData(
  branchId: number,
  targetDate?: Date | string
): Promise<DailyBranchLedgerData | null> {
  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    select: { id: true, name: true, address: true },
  });

  if (!branch) return null;

  const now = targetDate ? new Date(targetDate) : new Date();
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
  const endOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));

  // Reads from the same ledger data as §1.1's revenue dashboard, just filtered to one day and one branch
  const [ledgerRows, missingRecords, surplusRecords, todayVouchers] = await Promise.all([
    prisma.dailyLedger.findMany({
      where: {
        branchId,
        date: { gte: startOfDay, lte: endOfDay },
      },
    }),
    prisma.missingMoney.findMany({
      where: {
        branchId,
        date: { gte: startOfDay, lte: endOfDay },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.surplusMoney.findMany({
      where: {
        branchId,
        date: { gte: startOfDay, lte: endOfDay },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.voucher.findMany({
      where: {
        targetBranchId: branchId,
        issuedAt: { gte: startOfDay, lte: endOfDay },
        isVoided: false,
      },
      include: {
        student: { select: { name: true } },
        class: { select: { name: true } },
        workshop: { select: { title: true } },
      },
      orderBy: { issuedAt: "desc" },
    }),
  ]);

  const summary = {
    tuition: 0,
    inscription: 0,
    book: 0,
    atelierFormation: 0,
    grossRevenue: 0,
    refunds: 0,
    confirmedMissing: 0,
    pendingMissing: 0,
    confirmedSurplus: 0,
    pendingSurplus: 0,
    netCash: 0,
  };

  for (const row of ledgerRows) {
    const amount = Number(row.amount);
    const type = row.type as LedgerVoucherCategory;
    if (type === "REFUND") {
      summary.refunds += Math.abs(amount);
    } else {
      summary.grossRevenue += amount;
      if (type === "TUITION" || (type as string) === "EXTRA_SESSION") summary.tuition += amount;
      else if (type === "INSCRIPTION") summary.inscription += amount;
      else if (type === "BOOK") summary.book += amount;
      else if (type === "ATELIER_FORMATION") summary.atelierFormation += amount;
    }
  }

  for (const m of missingRecords) {
    const amt = Number(m.amount);
    if (m.status === "CONFIRMED") {
      summary.confirmedMissing += amt;
    } else if (m.status === "PENDING") {
      summary.pendingMissing += amt;
    }
  }

  for (const s of surplusRecords) {
    const amt = Number(s.amount);
    if (s.status === "CONFIRMED") {
      summary.confirmedSurplus += amt;
    } else if (s.status === "PENDING") {
      summary.pendingSurplus += amt;
    }
  }

  summary.netCash = summary.grossRevenue - summary.refunds - summary.confirmedMissing + summary.confirmedSurplus;

  return {
    branch,
    date: now,
    dateStr: now.toISOString().split("T")[0],
    summary,
    missingMoneyList: missingRecords.map((m) => ({
      id: m.id,
      amount: Number(m.amount),
      reason: m.reason,
      declaredBy: m.declaredBy,
      status: m.status,
      confirmedBy: m.confirmedBy,
      confirmedAt: m.confirmedAt,
      createdAt: m.createdAt,
    })),
    surplusMoneyList: surplusRecords.map((s) => ({
      id: s.id,
      amount: Number(s.amount),
      reason: s.reason,
      declaredBy: s.declaredBy,
      status: s.status,
      confirmedBy: s.confirmedBy,
      confirmedAt: s.confirmedAt,
      createdAt: s.createdAt,
    })),
    todayVouchers: todayVouchers.map((v) => ({
      id: v.id,
      number: v.number,
      studentName: v.student?.name || "—",
      className: v.class?.name || v.workshop?.title || "—",
      paymentType: v.paymentType,
      amount: Number(v.amount),
      issuedAt: v.issuedAt,
      issuedBy: v.issuedBy,
      isPartial: v.isPartial,
    })),
  };
}


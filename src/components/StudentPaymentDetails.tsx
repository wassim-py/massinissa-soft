"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { Voucher, VoucherEdit, Refund } from "@prisma/client";
import PaymentForm from "./forms/PaymentForm";
import PrintTicketButton from "./PrintTicketButton";
import { formatVoucherDisplay } from "@/lib/voucherUtils";
import { transferEnrollmentCredit, createRefund } from "@/lib/actions";
import { computeStudentSessionFee, computeStudentConsumedSessions } from "@/lib/studentBilling";
import { toast } from "react-toastify";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { SearchableGroupSelect } from "@/components/ui/SearchableGroupSelect";
import { AlertTriangle, Building2, Clock, CheckCircle2, AlertCircle, Sparkles, ShieldAlert, ArrowRightLeft, ChevronDown, ChevronUp } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";

export type ExtendedTransferItem = {
  id: number;
  fromEnrollmentId: number;
  toEnrollmentId: number;
  transferredSessions: number;
  amount?: any;
  notes?: string | null;
  transferredAt: Date | string;
  transferredBy: string;
  fromClass?: { id: number; name: string; branchId: number; branch?: { id: number; name: string } };
  toClass?: { id: number; name: string; branchId: number; branch?: { id: number; name: string } };
};

export type ExtendedEnrollmentItem = {
  id: number;
  classId: number;
  enrolledAt: Date | string;
  inscriptionFeeCharged: boolean;
  inscriptionFeeAmount?: number | null;
  feeOverriddenByOwner: boolean;
  feeOverrideNote?: string | null;
  isNonPayer?: boolean;
  status?: string;
  class: {
    id: number;
    name: string;
    branchId: number;
    pricePerCycle?: number | null;
    inscriptionFee: number;
    hasBooks: boolean;
    bookFee?: number | null;
    branch: { id: number; name: string };
    level?: { id: number; name: string } | null;
    teacher?: { id: string; name: string; TeacherPayRate?: Array<{ percentageOfSessionFee: any }> } | null;
  };
  transfersFrom?: Array<{
    id: number;
    fromEnrollmentId: number;
    toEnrollmentId: number;
    transferredSessions: number;
    amount?: any;
    notes?: string | null;
    transferredAt: Date | string;
    transferredBy: string;
    toEnrollment?: { class?: { name: string; branch?: { id: number; name: string } } };
  }>;
  transfersTo?: Array<{
    id: number;
    fromEnrollmentId: number;
    toEnrollmentId: number;
    transferredSessions: number;
    amount?: any;
    notes?: string | null;
    transferredAt: Date | string;
    transferredBy: string;
    fromEnrollment?: { class?: { name: string; branch?: { id: number; name: string } } };
  }>;
};

export type ExtendedVoucherItem = Voucher & {
  series?: {
    scope?: string | null;
    id: number;
    level?: { name: string } | null;
    issuingBranch?: { name: string } | null;
    targetBranch?: { name: string } | null;
  } | null;
  class?: {
    id: number;
    name: string;
    branchId: number;
    branch?: { name: string } | null;
    level?: { name: string } | null;
  } | null;
  issuingBranch?: { name: string } | null;
  targetBranch?: { name: string } | null;
  edits?: VoucherEdit[];
  refunds?: Refund[];
};

export type StudentPaymentRecordData = {
  id: string;
  globalNumber?: number | null;
  name: string;
  phone?: string | null;
  payerStatus?: string;
  registeredBranchId?: number;
  registeredBranch?: { id: number; name: string } | null;
  family?: { id: number; payerStudentId: string | null; discountPercentage?: any } | null;
  enrollments: ExtendedEnrollmentItem[];
  vouchers: ExtendedVoucherItem[];
  attendances?: Array<{
    id: number;
    lessonId: number;
    status: string;
    lesson?: { id: number; isFree: boolean; classId: number } | null;
  }>;
};

interface StudentPaymentDetailsProps {
  student: StudentPaymentRecordData;
  classData?: any;
  isOwner?: boolean;
  activeBranchId?: number;
  availableClassesForTransfer?: Array<{ id: number; name: string; branch: { name: string } }>;
  configuredInscriptionFee?: number;
}

export default function StudentPaymentDetails({
  student,
  classData,
  isOwner = true,
  activeBranchId = 1,
  availableClassesForTransfer = [],
  configuredInscriptionFee,
}: StudentPaymentDetailsProps) {
  const t = useTranslations("studentPaymentDetails");
  const tCommon = useTranslations("common");
  const locale = useLocale();

  const getPaymentTypeLabel = (type: string) => {
    switch (type) {
      case "INSCRIPTION":
        return t("typeInscription");
      case "TUITION_4SESSION":
        return t("typeTuition4Session");
      case "BOOK":
        return t("typeBook");
      case "EXTRA_SESSION":
        return t("typeExtraSession");
      case "CATCHUP":
        return t("typeCatchup");
      case "WORKSHOP":
        return t("typeWorkshop");
      case "FORMATION":
        return t("typeFormation");
      default:
        return type;
    }
  };

  // Branch filter tab for Owner: "all" or branchId
  const [selectedBranchTab, setSelectedBranchTab] = useState<number | "all">("all");

  // Modal states
  const [voucherModal, setVoucherModal] = useState<{
    isOpen: boolean;
    type: "create" | "update";
    classData?: any;
    voucher?: Voucher;
  }>({ isOpen: false, type: "create" });

  const [transferModal, setTransferModal] = useState<{
    isOpen: boolean;
    enrollment?: ExtendedEnrollmentItem;
    maxSessions: number;
  }>({ isOpen: false, maxSessions: 0 });

  const [auditModal, setAuditModal] = useState<{
    isOpen: boolean;
    voucher?: ExtendedVoucherItem | null;
    transfer?: ExtendedTransferItem | null;
  }>({ isOpen: false });

  const [historyTab, setHistoryTab] = useState<"all" | "vouchers" | "transfers">("all");
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(false);
  const INITIAL_HISTORY_COUNT = 5;

  const [refundModal, setRefundModal] = useState<{
    isOpen: boolean;
    voucher?: ExtendedVoucherItem;
    remainingBalance: number;
    maxRefundable: number;
    unconsumedSessions?: number;
  }>({ isOpen: false, remainingBalance: 0, maxRefundable: 0, unconsumedSessions: 0 });

  const [refundAmount, setRefundAmount] = useState<number | "">("");
  const [refundReason, setRefundReason] = useState<string>("");
  const [isRefundPending, startRefundTransition] = useTransition();

  // Transfer state
  const [targetClassId, setTargetClassId] = useState<number | "">("");
  const [sessionsToTransfer, setSessionsToTransfer] = useState<number>(1);
  const [transferNotes, setTransferNotes] = useState<string>("");
  const [isTransferPending, startTransferTransition] = useTransition();

  // Sibling discount check
  const isSiblingDiscount = Boolean(
    student.family && student.family.payerStudentId && student.family.payerStudentId !== student.id
  );
  const siblingDiscountPct = isSiblingDiscount
    ? Number((student.family as any)?.discountPercentage ?? 50)
    : 0;
  const isSiblingWaived100 = siblingDiscountPct >= 100;

  // CROSS-BRANCH ENROLLMENT (§1.0):
  // Both OWNER and BRANCH_ADMIN see the SAME complete picture (all branches, all groups).
  // Optional branch tabs allow filtering if desired, but "all" is active by default.
  const allEnrollments = student.enrollments || (classData ? [{ id: 0, classId: classData.id, class: classData, enrolledAt: new Date(), inscriptionFeeCharged: true, feeOverriddenByOwner: false, transfersFrom: [], transfersTo: [] }] : []);

  const branchScopedEnrollments = allEnrollments.filter((enr) => {
    if (selectedBranchTab !== "all") {
      return enr.class.branchId === selectedBranchTab;
    }
    return true;
  });

  const allVouchers = student.vouchers || [];
  const branchScopedVouchers = allVouchers.filter((v) => {
    const vBranchId = v.class?.branchId || v.targetBranchId || v.issuingBranchId;
    if (selectedBranchTab !== "all") {
      return vBranchId === selectedBranchTab;
    }
    return true;
  });

  // Extract all unique transfers across enrollments
  const allTransfersMap = new Map<number, ExtendedTransferItem>();
  allEnrollments.forEach((enr) => {
    (enr.transfersFrom || []).forEach((t: any) => {
      if (!allTransfersMap.has(t.id)) {
        allTransfersMap.set(t.id, {
          ...t,
          fromClass: enr.class,
          toClass: t.toEnrollment?.class,
        });
      }
    });
    (enr.transfersTo || []).forEach((t: any) => {
      if (!allTransfersMap.has(t.id)) {
        allTransfersMap.set(t.id, {
          ...t,
          fromClass: t.fromEnrollment?.class,
          toClass: enr.class,
        });
      }
    });
  });
  const allTransfers = Array.from(allTransfersMap.values()).sort(
    (a, b) => new Date(b.transferredAt).getTime() - new Date(a.transferredAt).getTime()
  );

  const branchScopedTransfers = allTransfers.filter((t) => {
    if (selectedBranchTab === "all") return true;
    return (
      t.fromClass?.branchId === selectedBranchTab ||
      t.toClass?.branchId === selectedBranchTab ||
      (t.fromClass?.branch as any)?.id === selectedBranchTab ||
      (t.toClass?.branch as any)?.id === selectedBranchTab
    );
  });

  type CombinedPaymentItem =
    | { kind: "voucher"; date: Date | string; voucher: ExtendedVoucherItem }
    | { kind: "transfer"; date: Date | string; transfer: ExtendedTransferItem };

  const combinedItems: CombinedPaymentItem[] = [];
  if (historyTab === "all" || historyTab === "vouchers") {
    branchScopedVouchers.forEach((v) => {
      combinedItems.push({ kind: "voucher", date: v.issuedAt, voucher: v });
    });
  }
  if (historyTab === "all" || historyTab === "transfers") {
    branchScopedTransfers.forEach((t) => {
      combinedItems.push({ kind: "transfer", date: t.transferredAt, transfer: t });
    });
  }
  combinedItems.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const displayedHistoryItems = isHistoryExpanded
    ? combinedItems
    : combinedItems.slice(0, INITIAL_HISTORY_COUNT);

  // Calculate per-class metrics
  const allClassMetrics = allEnrollments.map((enr) => {
    const c = enr.class;
    const classVouchers = allVouchers.filter((v) => v.classId === c.id || (v.class && v.class.id === c.id));
    const activeClassVouchers = classVouchers.filter((v) => !v.isVoided);

    const inscVouchers = activeClassVouchers.filter((v) => v.paymentType === "INSCRIPTION");
    const totalInscPaid = inscVouchers.reduce((sum, v) => sum + Number(v.amount || 0), 0);
    const requiredInscFee =
      Number(c?.inscriptionFee || 0) > 0
        ? Number(c?.inscriptionFee)
        : (configuredInscriptionFee || 1000);
    const isInscriptionPaid = totalInscPaid >= requiredInscFee && requiredInscFee > 0;
    const inscVoucher = inscVouchers.length > 0 ? inscVouchers[0] : null;
    const bookVoucher = activeClassVouchers.find((v) => v.paymentType === "BOOK");
    const tuitionVouchers = activeClassVouchers.filter((v) => v.paymentType === "TUITION_4SESSION");

    const cyclePrice = Number(c?.pricePerCycle || 0);
    const baseLessonPrice = cyclePrice > 0 ? cyclePrice / 4 : 0;
    const effectiveLessonPrice =
      siblingDiscountPct > 0 && siblingDiscountPct < 100
        ? baseLessonPrice * (1 - siblingDiscountPct / 100)
        : siblingDiscountPct >= 100
        ? 0
        : baseLessonPrice;

    let purchasedSessions = 0;
    if (isSiblingWaived100) {
      purchasedSessions = 16;
    } else if (effectiveLessonPrice > 0) {
      let totalPaidTuition = 0;
      tuitionVouchers.forEach((v) => {
        const vAmount = Number(v.amount || 0);
        const vRefunded = (v as any).refunds?.reduce((sum: number, r: any) => sum + Number(r.amount || 0), 0) || 0;
        totalPaidTuition += Math.max(0, vAmount - vRefunded);
      });
      purchasedSessions = Math.floor(totalPaidTuition / effectiveLessonPrice);
    } else {
      purchasedSessions = tuitionVouchers.length * 4;
    }
    const transferredOut = (enr.transfersFrom || []).reduce((sum, t) => sum + t.transferredSessions, 0);
    const transferredIn = (enr.transfersTo || []).reduce((sum, t) => sum + t.transferredSessions, 0);

    const classAtts = (student.attendances || []).filter(
      (att: any) => att.lesson && att.lesson.classId === c.id && !att.lesson.isFree
    );
    const classLessons = classAtts.map((att: any) => att.lesson);
    const attendedSessions = computeStudentConsumedSessions({
      lessons: classLessons,
      attendances: classAtts.map((att: any) => ({ lessonId: att.lessonId, status: att.status })),
    });

    const netSessions = (purchasedSessions + transferredIn - transferredOut) - attendedSessions + Number((enr as any).creditResetOffset || 0);
    const unconsumedInCycle = Math.max(0, Math.min(4, netSessions));

    // Identify the student's most recent active cycle for this class (§7.8)
    const activeTuitionVouchersWithBalance = tuitionVouchers.filter((v) => {
      const totalRefunded = (v as any).refunds?.reduce((sum: number, r: any) => sum + Number(r.amount || 0), 0) || 0;
      const rem = Number(v.remainingBalance ?? (Number(v.amount) - totalRefunded));
      return rem > 0;
    });

    const sortedActiveCycles = [...activeTuitionVouchersWithBalance].sort((a, b) => {
      const timeDiff = new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime();
      if (timeDiff !== 0) return timeDiff;
      return b.id - a.id;
    });

    const mostRecentActiveCycle = sortedActiveCycles[0] || null;

    const teacherPercentage = (c.teacher as any)?.TeacherPayRate?.[0]?.percentageOfSessionFee
      ? Number((c.teacher as any).TeacherPayRate[0].percentageOfSessionFee)
      : null;

    const enrPayerStatus = (enr as any).payerStatus || student.payerStatus || "NORMAL";
    const feeCalc = computeStudentSessionFee({
      payerStatus: enrPayerStatus,
      pricePerCycle: Number(c.pricePerCycle || 0),
      teacherPercentage,
      isSiblingWaived: isSiblingWaived100,
      siblingDiscountPercentage: siblingDiscountPct,
    });

    let status: "PAID" | "EXPIRING" | "UNPAID" | "SIBLING_WAIVED" = "UNPAID";
    if (isSiblingWaived100) {
      status = "SIBLING_WAIVED";
    } else if (netSessions >= 2) {
      status = "PAID";
    } else if (netSessions === 1) {
      status = "EXPIRING";
    } else {
      status = "UNPAID";
    }

    return {
      enrollment: enr,
      class: c,
      inscVoucher,
      isInscriptionPaid,
      totalInscPaid,
      requiredInscFee,
      bookVoucher,
      tuitionVouchers,
      purchasedSessions,
      transferredIn,
      transferredOut,
      attendedSessions,
      netSessions,
      unconsumedInCycle,
      mostRecentActiveCycle,
      status,
      feeCalc,
    };
  });

  const classMetricsMap = new Map<number, (typeof allClassMetrics)[0]>();
  allClassMetrics.forEach((m) => {
    classMetricsMap.set(m.class.id, m);
  });

  const classMetrics = allClassMetrics.filter((m) =>
    branchScopedEnrollments.some((enr) => enr.id === m.enrollment.id)
  );

  // SORTING RULE (§1.0 / Payment-Renewal Signal):
  // Groups where the student has ONLY 1 session left appear FIRST, above every other group on this page!
  // Secondary sort: unpaid/exhausted (<= 0), then paid (> 1), then alphabetical by class name.
  const sortedClassMetrics = [...classMetrics].sort((a, b) => {
    const aIsOne = a.netSessions === 1;
    const bIsOne = b.netSessions === 1;
    if (aIsOne && !bIsOne) return -1;
    if (!aIsOne && bIsOne) return 1;

    if (a.netSessions <= 0 && b.netSessions > 1) return -1;
    if (a.netSessions > 1 && b.netSessions <= 0) return 1;

    return (a.class.name || "").localeCompare(b.class.name || "");
  });

  // Actions
  const handleOpenTransfer = (enr: ExtendedEnrollmentItem, availableSessions: number) => {
    setTransferModal({
      isOpen: true,
      enrollment: enr,
      maxSessions: Math.max(0, availableSessions),
    });
    setSessionsToTransfer(Math.min(1, Math.max(1, availableSessions)));
    setTargetClassId("");
    setTransferNotes("");
  };

  const handleExecuteTransfer = () => {
    if (!transferModal.enrollment || !targetClassId || sessionsToTransfer < 1) {
      toast.error(t("transferSelectError"));
      return;
    }

    startTransferTransition(async () => {
      const res = await transferEnrollmentCredit(
        { success: false, error: false, message: "" },
        {
          fromEnrollmentId: transferModal.enrollment!.id,
          toClassId: Number(targetClassId),
          studentId: student.id,
          transferredSessions: Number(sessionsToTransfer),
          notes: transferNotes,
        }
      );

      if (res.success) {
        toast.success(res.message);
        setTransferModal({ isOpen: false, maxSessions: 0 });
      } else {
        toast.error(res.message);
      }
    });
  };

  const handleOpenRefund = (
    v: ExtendedVoucherItem,
    maxRefundable: number,
    unconsumedSessions?: number
  ) => {
    const totalRefunded = v.refunds?.reduce((sum, r) => sum + Number(r.amount), 0) || 0;
    const remBal = Number(v.remainingBalance ?? (Number(v.amount) - totalRefunded));
    const effectiveCap = Math.min(remBal, maxRefundable);

    setRefundModal({
      isOpen: true,
      voucher: v,
      remainingBalance: remBal,
      maxRefundable: effectiveCap,
      unconsumedSessions,
    });
    setRefundAmount(effectiveCap);
    setRefundReason("");
  };

  const handleExecuteRefund = () => {
    if (!refundModal.voucher || !refundAmount || Number(refundAmount) <= 0) {
      toast.error(t("refundAmountError"));
      return;
    }
    const cap = refundModal.maxRefundable ?? refundModal.remainingBalance;
    if (Number(refundAmount) > cap) {
      toast.error(t("refundExceedsBalance", { balance: cap.toLocaleString(locale === "ar" ? "ar-DZ" : "fr-DZ") }));
      return;
    }
    if (!refundReason || refundReason.trim().length < 3) {
      toast.error(t("refundReasonError"));
      return;
    }

    startRefundTransition(async () => {
      const res = await createRefund(
        { success: false, error: false },
        {
          voucherId: refundModal.voucher!.id,
          amount: Number(refundAmount),
          reason: refundReason.trim(),
        }
      );

      if (res.success) {
        toast.success(res.message);
        setRefundModal({
          isOpen: false,
          remainingBalance: 0,
          maxRefundable: 0,
          unconsumedSessions: 0,
        });
        setAuditModal({ isOpen: false });
      } else {
        toast.error(res.message);
      }
    });
  };

  return (
    <div className="space-y-6 font-sans">
      {/* SECTION HEADER & OWNER BRANCH FILTER TABS */}
      <Card className="border-border/80 shadow-xs">
        <CardContent className="p-5 sm:p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border pb-4">
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-section-title font-bold text-gray-900">
                  {t("recordTitle")}
                </h2>
                <Badge variant="primary" size="sm">
                  #{student.globalNumber ?? student.id.slice(0, 6)}
                </Badge>
              </div>
              <p className="text-form-helper text-muted mt-1">
                {t("recordSubtitle")}
              </p>
            </div>

            {/* Branch Filter Tabs (Available to both Owner & Branch Admin - §1.0) */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center bg-surface-muted p-1 rounded-xl border border-border text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setSelectedBranchTab("all")}
                  className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                    selectedBranchTab === "all"
                      ? "bg-primary text-white shadow-xs"
                      : "text-muted hover:text-gray-900"
                  }`}
                >
                  {t("allBranches")} ({allEnrollments.length})
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedBranchTab(1)}
                  className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                    selectedBranchTab === 1
                      ? "bg-primary text-white shadow-xs"
                      : "text-muted hover:text-gray-900"
                  }`}
                >
                  ECOLE
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedBranchTab(2)}
                  className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                    selectedBranchTab === 2
                      ? "bg-primary text-white shadow-xs"
                      : "text-muted hover:text-gray-900"
                  }`}
                >
                  ANNEX
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedBranchTab(3)}
                  className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                    selectedBranchTab === 3
                      ? "bg-primary text-white shadow-xs"
                      : "text-muted hover:text-gray-900"
                  }`}
                >
                  AMPHI
                </button>
              </div>
              {!isOwner && (
                <span className="text-[11px] text-muted">
                  {t("branchScopeNotice", { id: activeBranchId })}
                </span>
              )}
            </div>
          </div>

          {/* Sibling waiver/discount banner if applicable */}
          {isSiblingDiscount && (
            <div className="mt-4 p-3 bg-purple-50 border border-purple-200 rounded-xl flex items-center gap-2 text-xs text-purple-900">
              <span className="font-bold">
                {locale === "ar"
                  ? `خصم الإخوة مفعل (${siblingDiscountPct}%):`
                  : `Remise fratrie active (${siblingDiscountPct}%) :`}
              </span>
              <span>
                {locale === "ar"
                  ? isSiblingWaived100
                    ? t("siblingWaiverDesc")
                    : `يستفيد هذا التلميذ من تخفيض بنسبة ${siblingDiscountPct}% على معاليم الحصص الدراسية (يدفع النصف فقط).`
                  : isSiblingWaived100
                  ? t("siblingWaiverDesc")
                  : `Cet élève bénéficie d'une réduction de ${siblingDiscountPct}% sur les cours (paie la moitié).`}
              </span>
            </div>
          )}

          {/* Cross-Branch Enrollment indicator (§1.0) */}
          {(() => {
            const enrolledBranches = Array.from(
              new Set(allEnrollments.map((e) => e.class?.branch?.name).filter(Boolean))
            );
            if (enrolledBranches.length > 1) {
              return (
                <div className="mt-4 p-3 bg-blue-50/80 border border-blue-200 rounded-xl flex items-center justify-between gap-2 text-xs text-blue-900">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-blue-700 shrink-0" />
                    <span className="font-bold">{t("crossBranchTitle")}</span>
                    <span>{t("crossBranchDesc")}</span>
                    <span className="font-semibold">{enrolledBranches.join(locale === "ar" ? " ، " : ", ")}</span>
                  </div>
                  <Badge variant="primary" size="sm">
                    {t("branchesCount", { count: enrolledBranches.length })}
                  </Badge>
                </div>
              );
            }
            return null;
          })()}

          {/* 1 Session Left Payment-Renewal Signal Alert Banner */}
          {(() => {
            const expiringCount = classMetrics.filter((cm) => cm.netSessions === 1).length;
            if (expiringCount > 0) {
              return (
                <div className="mt-4 p-3.5 bg-amber-50/90 border border-amber-300 rounded-xl flex items-center justify-between gap-3 text-xs text-amber-950 shadow-xs">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <div>
                      <span className="font-bold">{t("renewalSignalTitle")}</span>{" "}
                      <span>{t("renewalSignalDesc", { count: expiringCount })}</span>
                    </div>
                  </div>
                  <Badge variant="warning" size="sm" withDot>
                    {t("renewalSignalBadge", { count: expiringCount })}
                  </Badge>
                </div>
              );
            }
            return null;
          })()}

          {/* ENROLLED GROUPS PAYMENT STATUS CARDS */}
          <div className="mt-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-900">
                {t("groupsStatusTitle")} ({sortedClassMetrics.length})
              </h3>
              <span className="text-xs text-muted">
                {t("prioritySortingDesc")}
              </span>
            </div>

            {sortedClassMetrics.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {sortedClassMetrics.map((cm) => {
                  const isSuspended = cm.enrollment.status === "SUSPENDED";
                  const isTransferred = cm.enrollment.status === "TRANSFERRED";
                  const isUnenrolled = cm.enrollment.status === "UNENROLLED";
                  const isInactive = isSuspended || isTransferred || isUnenrolled;
                  const isPaid = !isInactive && cm.status === "PAID";
                  const isExpiring = !isInactive && (cm.status === "EXPIRING" || cm.netSessions === 1);
                  const isUnpaid = !isInactive && cm.status === "UNPAID";
                  const isSibling = !isInactive && cm.status === "SIBLING_WAIVED";

                  return (
                    <Card
                      key={cm.class.id}
                      className={`border p-4 transition-all rounded-xl ${
                        isSuspended
                          ? "border-rose-300 bg-rose-50/40"
                          : isTransferred || isUnenrolled
                          ? "border-dashed border-gray-300 bg-gray-50/50 opacity-80"
                          : isExpiring
                          ? "border-amber-400 bg-amber-50/40 ring-2 ring-amber-300/80 shadow-xs"
                          : isUnpaid
                          ? "border-red-300 bg-red-50/20"
                          : "border-border bg-surface"
                      }`}
                    >
                      {/* At-a-glance payment renewal banner for 1-session-left groups */}
                      {isExpiring && (
                        <div className="mb-3 p-2 bg-amber-100/90 border border-amber-300 rounded-lg flex items-center justify-between text-xs text-amber-950 font-semibold">
                          <span className="flex items-center gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            {t("expiringNotice")}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setVoucherModal({
                                isOpen: true,
                                type: "create",
                                classData: cm.class,
                              })
                            }
                            className="text-[11px] text-amber-800 hover:text-amber-950 font-bold underline cursor-pointer"
                          >
                            {t("issueRenewalVoucher")}
                          </button>
                        </div>
                      )}

                      <div className="flex items-start justify-between gap-3 border-b border-border/70 pb-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-gray-900 text-sm">{cm.class.name}</h4>
                            <Badge variant="primary" size="sm">
                              <Building2 className="w-3 h-3 inline me-1" />
                              {cm.class.branch.name}
                            </Badge>
                            {cm.class.level && (
                              <Badge variant="secondary" size="sm">
                                {cm.class.level.name}
                              </Badge>
                            )}
                          </div>
                          {cm.class.teacher && (
                            <p className="text-xs text-muted mt-0.5">
                              {t("teacherLabel")} <span className="text-gray-700">{cm.class.teacher.name}</span>
                            </p>
                          )}
                        </div>

                        {/* Status Badge */}
                        <div className="flex items-center gap-1.5 flex-wrap justify-end">
                          {(cm.enrollment as any).payerStatus === "NON_PAYER" && (
                            <Badge variant="success" size="sm">
                              <Sparkles className="w-3 h-3 text-success" />
                              <span>{locale === "ar" ? "معفى من الدفع" : "Non-payeur"}</span>
                            </Badge>
                          )}
                          {(cm.enrollment as any).payerStatus === "SCHOOL_FEES_ONLY" && (
                            <Badge variant="warning" size="sm">
                              <ShieldAlert className="w-3 h-3 text-warning" />
                              <span>
                                {locale === "ar"
                                  ? `حصة المدرسة (${cm.feeCalc.schoolPercentage}%)`
                                  : `Part école (${cm.feeCalc.schoolPercentage}%)`}
                              </span>
                            </Badge>
                          )}
                          {isSuspended ? (
                            <Badge variant="danger" size="sm" withDot>
                              {locale === "ar" ? "معلّق" : "Suspendu"}
                            </Badge>
                          ) : isTransferred ? (
                            <Badge variant="secondary" size="sm" withDot>
                              {locale === "ar" ? "رصيد منقول (غير مسجل)" : "Transféré (Désinscrit)"}
                            </Badge>
                          ) : isUnenrolled ? (
                            <Badge variant="neutral" size="sm" withDot>
                              {locale === "ar" ? "ملغى التسجيل" : "Désinscrit"}
                            </Badge>
                          ) : isExpiring ? (
                            <Badge variant="warning" size="sm" withDot className="font-bold">
                              {t("expiringWarningBadge")}
                            </Badge>
                          ) : isPaid ? (
                            <Badge variant="success" size="sm" withDot>
                              {t("paidBadge", { count: cm.netSessions })}
                            </Badge>
                          ) : isUnpaid ? (
                            <Badge variant="danger" size="sm" withDot>
                              {t("unpaidBadge", { count: cm.netSessions })}
                            </Badge>
                          ) : isSibling ? (
                            <Badge variant="neutral" size="sm" withDot>
                              {t("siblingBadge")}
                            </Badge>
                          ) : null}
                        </div>
                      </div>

                      {/* Sessions & Fees Metrics */}
                      <div className="grid grid-cols-3 gap-2 py-3 border-b border-border/70 text-center text-xs">
                        <div>
                          <span className="text-[10px] text-muted block">{t("sessionsRemaining")}</span>
                          <span
                            className={`font-mono font-bold text-sm ${
                              cm.netSessions <= 0
                                ? "text-danger"
                                : cm.netSessions === 1
                                ? "text-amber-700 bg-amber-100/80 px-2 py-0.5 rounded border border-amber-300 inline-block"
                                : "text-success-text"
                            }`}
                          >
                            {cm.netSessions}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-muted block">{t("sessionsConsumed")}</span>
                          <span className="font-mono font-semibold text-gray-800 text-sm">
                            {cm.attendedSessions}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-muted block">{t("inscriptionFeeStatus")}</span>
                          <span className="text-xs font-semibold text-gray-800">
                            {cm.isInscriptionPaid ? (
                              <span className="text-success-text font-bold">{t("inscriptionSettled")}</span>
                            ) : cm.enrollment.feeOverriddenByOwner ? (
                              <span className="text-amber-700">{t("inscriptionOwnerWaived")}</span>
                            ) : !cm.enrollment.inscriptionFeeCharged ? (
                              <span className="text-blue-700">{t("inscriptionGroupWaived")}</span>
                            ) : (
                              <span className="text-danger font-bold">{t("inscriptionDue")}</span>
                            )}
                          </span>
                        </div>
                      </div>

                      {/* Pricing / Owed Information row (§7.18) */}
                      <div className="mt-2.5 py-2 px-2.5 bg-surface-subtle rounded-lg border border-border/70 flex items-center justify-between gap-2 text-[11px] flex-wrap">
                        <span className="text-muted">
                          {locale === "ar" ? "تسعير الحصة لهذا التلميذ:" : "Tarif séance élève :"}
                        </span>
                        <div className="flex items-center gap-1.5 font-semibold text-gray-800">
                          {(cm.enrollment as any).payerStatus === "NON_PAYER" ? (
                            <span className="text-emerald-700 font-bold">
                              0 DZD ({locale === "ar" ? "معفى من رسوم الدروس" : "Exonéré de cours"})
                            </span>
                          ) : (cm.enrollment as any).payerStatus === "SCHOOL_FEES_ONLY" ? (
                            <span className="text-amber-800 font-bold">
                              {cm.feeCalc.studentSessionFee.toLocaleString()} DZD / {locale === "ar" ? "حصة" : "séance"}
                              <span className="text-muted font-normal text-[10px] ms-1">
                                ({locale === "ar" ? `حصة المدرسة ${cm.feeCalc.schoolPercentage}%` : `part école ${cm.feeCalc.schoolPercentage}%`})
                              </span>
                            </span>
                          ) : (
                            <span>
                              {cm.feeCalc.studentSessionFee.toLocaleString()} DZD / {locale === "ar" ? "حصة" : "séance"}
                            </span>
                          )}
                        </div>

                        {cm.netSessions < 0 && (
                          <div className="w-full pt-1.5 mt-1 border-t border-border/60 flex items-center justify-between text-danger font-bold text-[11px]">
                            <span>
                              {locale === "ar"
                                ? `المبلغ المستحق (${Math.abs(cm.netSessions)} حصص مستهلكة):`
                                : `Montant dû (${Math.abs(cm.netSessions)} séances consommées) :`}
                            </span>
                            <span className="font-mono">
                              {(Math.abs(cm.netSessions) * cm.feeCalc.studentSessionFee).toLocaleString()} DZD
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Action buttons for this group */}
                      <div className="pt-3 flex items-center justify-between gap-2 flex-wrap text-xs">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Button
                            size="sm"
                            variant={isExpiring ? "primary" : "primary"}
                            onClick={() =>
                              setVoucherModal({
                                isOpen: true,
                                type: "create",
                                classData: cm.class,
                              })
                            }
                          >
                            {isExpiring ? t("issueVoucherNow") : t("issueVoucher")}
                          </Button>
                          {cm.netSessions > 0 && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleOpenTransfer(cm.enrollment, cm.netSessions)}
                            >
                              {t("transferCredit")}
                            </Button>
                          )}
                        </div>

                        <Link
                          href={`/list/payments/class/${cm.class.id}`}
                          className="text-xs font-semibold text-primary hover:underline"
                        >
                          {t("fullClassGrid")}
                        </Link>
                      </div>
                    </Card>
                  );
                })}
              </div>
            ) : (
              <div className="py-8 text-center text-muted border border-dashed rounded-xl text-xs">
                {t("noEnrollments")}
              </div>
            )}
          </div>

          {/* SCOPED VOUCHERS & TRANSFERS HISTORY TABLE */}
          <div className="mt-8 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-gray-900">
                  {locale === "ar" ? "سجل وصولات الدفع وتحويلات الرصيد" : "Historique des Reçus & Mouvements de Crédit"} ({combinedItems.length})
                </h3>
                <p className="text-xs text-muted">
                  {locale === "ar"
                    ? "يتضمن الوصولات المسددة بالإضافة إلى سجل تحويلات الحصص بين الأفواج الدراسية"
                    : "Comprend les reçus d'encaissement et les transferts de solde de séances entre groupes"}
                </p>
              </div>

              {/* Filter Tabs: All vs Vouchers vs Transfers */}
              <div className="flex items-center bg-surface-muted p-1 rounded-xl border border-border text-xs font-semibold self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => {
                    setHistoryTab("all");
                    setIsHistoryExpanded(false);
                  }}
                  className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                    historyTab === "all"
                      ? "bg-primary text-white shadow-xs"
                      : "text-muted hover:text-gray-900"
                  }`}
                >
                  {locale === "ar" ? "الكل" : "Tous"} ({branchScopedVouchers.length + branchScopedTransfers.length})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setHistoryTab("vouchers");
                    setIsHistoryExpanded(false);
                  }}
                  className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                    historyTab === "vouchers"
                      ? "bg-primary text-white shadow-xs"
                      : "text-muted hover:text-gray-900"
                  }`}
                >
                  {locale === "ar" ? "وصولات فقط" : "Reçus"} ({branchScopedVouchers.length})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setHistoryTab("transfers");
                    setIsHistoryExpanded(false);
                  }}
                  className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                    historyTab === "transfers"
                      ? "bg-primary text-white shadow-xs"
                      : "text-muted hover:text-gray-900"
                  }`}
                >
                  {locale === "ar" ? "تحويلات فقط" : "Transferts"} ({branchScopedTransfers.length})
                </button>
              </div>
            </div>

            <div className="overflow-x-auto border border-border rounded-xl bg-surface shadow-xs">
              <table className="w-full text-xs">
                <thead className="bg-surface-muted text-muted border-b border-border font-semibold">
                  <tr>
                    <th className="p-3 text-start">{t("colVoucherCode")}</th>
                    <th className="p-3 text-start">{t("colGroup")}</th>
                    <th className="p-3 text-start">{t("colPaymentType")}</th>
                    <th className="p-3 text-start">{t("colPaymentDate")}</th>
                    <th className="p-3 text-end">{t("colAmount")}</th>
                    <th className="p-3 text-center">{t("colStatus")}</th>
                    <th className="p-3 text-end">{t("colActions")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {combinedItems.length > 0 ? (
                    displayedHistoryItems.map((item) => {
                      if (item.kind === "transfer") {
                        const trf = item.transfer;
                        return (
                          <tr
                            key={`transfer-${trf.id}`}
                            className="hover:bg-purple-50/40 transition-colors bg-purple-50/20"
                          >
                            {/* Reference */}
                            <td className="p-3 text-start">
                              <span
                                className="font-mono font-bold text-purple-900 bg-purple-100/90 px-2 py-0.5 rounded-lg border border-purple-300 inline-flex items-center gap-1.5 shadow-2xs"
                                dir="ltr"
                              >
                                <ArrowRightLeft className="w-3.5 h-3.5 text-purple-700 shrink-0" />
                                TRF-#{trf.id}
                              </span>
                            </td>

                            {/* Class Names: Source -> Destination */}
                            <td className="p-3 text-start">
                              <div className="flex items-center gap-1.5 flex-wrap text-xs">
                                <span className="text-gray-800 font-medium">
                                  {trf.fromClass?.name || (locale === "ar" ? "فوج مصدر" : "Groupe source")}
                                </span>
                                <span className="text-purple-600 font-bold px-0.5">➔</span>
                                <span className="text-purple-950 font-bold">
                                  {trf.toClass?.name || (locale === "ar" ? "فوج هدف" : "Groupe cible")}
                                </span>
                              </div>
                            </td>

                            {/* Payment / Movement Type */}
                            <td className="p-3 text-start">
                              <Badge
                                variant="secondary"
                                size="sm"
                                className="bg-purple-100 text-purple-900 border-purple-300 font-semibold"
                              >
                                <ArrowRightLeft className="w-3 h-3 text-purple-600 inline me-1" />
                                {locale === "ar" ? "تحويل رصيد" : "Transfert de crédit"}
                              </Badge>
                            </td>

                            {/* Date */}
                            <td className="p-3 text-muted font-mono text-start" dir="ltr">
                              {new Date(trf.transferredAt).toLocaleDateString(locale === "ar" ? "ar-DZ" : "fr-DZ")}
                            </td>

                            {/* Sessions & Amount */}
                            <td className="p-3 text-end">
                              <span className="font-mono font-bold text-purple-900 block text-xs">
                                +{trf.transferredSessions} {locale === "ar" ? "حصص" : "séances"}
                              </span>
                              <span className="text-[10px] text-muted font-mono block">
                                ({Number(trf.amount || 0).toLocaleString(locale === "ar" ? "ar-DZ" : "fr-DZ")} DZD)
                              </span>
                            </td>

                            {/* Status */}
                            <td className="p-3 text-center">
                              <Badge variant="success" size="sm" className="bg-emerald-50 text-emerald-800 border-emerald-200">
                                {locale === "ar" ? "محول بنجاح" : "Transféré"}
                              </Badge>
                            </td>

                            {/* Actions: Audit Button */}
                            <td className="p-3 text-end">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setAuditModal({ isOpen: true, transfer: trf })}
                                  className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-purple-100 hover:bg-purple-200 text-purple-900 border border-purple-300 transition-colors inline-flex items-center gap-1 cursor-pointer"
                                  title={locale === "ar" ? "عرض تدقيق التحويل" : "Détails et audit du transfert"}
                                >
                                  <ArrowRightLeft className="w-3 h-3 text-purple-700" />
                                  <span>{t("auditBtn")}</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      }

                      const v = item.voucher;
                      const totalRefunded = v.refunds?.reduce((sum, r) => sum + Number(r.amount), 0) || 0;
                      const remainingBalance = Number(v.remainingBalance ?? (Number(v.amount) - totalRefunded));
                      const isVoidedOrFullyRefunded = v.isVoided || remainingBalance <= 0;
                      const isPartiallyRefunded = totalRefunded > 0 && remainingBalance > 0;
                      const formattedLabel = formatVoucherDisplay(v);

                      // Refund eligibility and cashback cap calculation (§7.8)
                      const targetClassId = v.classId || v.class?.id;
                      const classMetric = targetClassId ? classMetricsMap.get(targetClassId) : null;

                      let canRefund = false;
                      let maxRefundable = 0;
                      let unconsumedSessions: number | undefined = undefined;

                      if (targetClassId && classMetric) {
                        const isMostRecentCycle = Boolean(
                          classMetric.mostRecentActiveCycle && classMetric.mostRecentActiveCycle.id === v.id
                        );
                        const pricePerSession = Number(v.amount) / 4;
                        const effectiveCap = Math.round(classMetric.unconsumedInCycle * pricePerSession);
                        maxRefundable = Math.min(remainingBalance, effectiveCap);
                        unconsumedSessions = classMetric.unconsumedInCycle;
                        canRefund =
                          !isSiblingDiscount &&
                          v.paymentType === "TUITION_4SESSION" &&
                          isMostRecentCycle &&
                          !isVoidedOrFullyRefunded &&
                          remainingBalance > 0 &&
                          maxRefundable > 0;
                      } else if (!targetClassId) {
                        // Non-class voucher (e.g. workshop / formation)
                        maxRefundable = remainingBalance;
                        canRefund = !isVoidedOrFullyRefunded && remainingBalance > 0 && v.paymentType !== "INSCRIPTION";
                      }

                      return (
                        <tr
                          key={v.id}
                          className={`hover:bg-surface-subtle/80 transition-colors ${
                            isVoidedOrFullyRefunded ? "bg-red-50/30 line-through text-muted" : ""
                          }`}
                        >
                          {/* Formatted Number strictly per specification */}
                          <td className="p-3 font-mono font-bold text-gray-900 text-start" dir="ltr">
                            {formattedLabel}
                          </td>

                          {/* Class Name */}
                          <td className="p-3 text-gray-800 font-medium text-start">
                            {v.class?.name || (locale === "ar" ? "ورشة عمل / دورة" : "Atelier / Formation")}
                          </td>

                          {/* Payment Type */}
                          <td className="p-3 text-start">
                            <Badge variant="neutral" size="sm">
                              {getPaymentTypeLabel(v.paymentType)}
                            </Badge>
                          </td>

                          {/* Date */}
                          <td className="p-3 text-muted font-mono text-start" dir="ltr">
                            {new Date(v.issuedAt).toLocaleDateString(locale === "ar" ? "ar-DZ" : "fr-DZ")}
                          </td>

                          {/* Amount */}
                          <td className="p-3 font-mono font-bold text-end text-gray-900">
                            {Number(v.amount).toLocaleString(locale === "ar" ? "ar-DZ" : "fr-DZ")} DZD
                          </td>

                          {/* Status */}
                          <td className="p-3 text-center">
                            {v.isVoided ? (
                              <Badge variant="danger" size="sm">
                                {t("statusVoided")}
                              </Badge>
                            ) : isPartiallyRefunded ? (
                              <Badge variant="warning" size="sm">
                                {t("statusPartiallyRefunded")}
                              </Badge>
                            ) : remainingBalance <= 0 && totalRefunded > 0 ? (
                              <Badge variant="danger" size="sm">
                                {t("statusFullyRefunded")}
                              </Badge>
                            ) : (
                              <Badge variant="success" size="sm">
                                {t("statusActive")}
                              </Badge>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="p-3 text-end">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Edit Voucher button */}
                              {!v.isVoided && remainingBalance > 0 && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setVoucherModal({
                                      isOpen: true,
                                      type: "update",
                                      voucher: v,
                                      classData: v.class,
                                    })
                                  }
                                  className="w-7 h-7 flex items-center justify-center rounded-lg bg-surface-muted hover:bg-surface-subtle border border-border text-gray-700 transition-colors"
                                  title={t("editVoucherTitle")}
                                >
                                  <Image src="/update-black.png" alt="Edit" width={15} height={15} />
                                </button>
                              )}

                              {/* Print Receipt button */}
                              <PrintTicketButton
                                voucher={{
                                  ...v,
                                  student: student as any,
                                  class: (v.class || classMetrics[0]?.class || { name: locale === "ar" ? "فوج دراسي" : "Groupe", branch: { name: "ECOLE" } }) as any,
                                } as any}
                              />

                              {/* Audit trail button */}
                              <button
                                type="button"
                                onClick={() => setAuditModal({ isOpen: true, voucher: v })}
                                className="px-2 py-1 rounded text-[11px] font-semibold bg-gray-100 hover:bg-sky-100 text-sky-800 border border-border transition-colors"
                                title={t("auditTooltip")}
                              >
                                {t("auditBtn")}
                              </button>

                              {/* Refund button - only on latest active cycle with unconsumed credit */}
                              {canRefund && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenRefund(v, maxRefundable, unconsumedSessions)}
                                  className="px-2 py-1 rounded text-[11px] font-semibold bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 transition-colors"
                                  title={t("refundTooltip")}
                                >
                                  {t("refundBtn")}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-muted">
                        {t("noVouchersScope")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* See more / See less button */}
            {combinedItems.length > INITIAL_HISTORY_COUNT && (
              <div className="pt-1 flex justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-primary hover:bg-primary-soft/30 border-dashed cursor-pointer"
                  onClick={() => setIsHistoryExpanded(!isHistoryExpanded)}
                  leftIcon={
                    isHistoryExpanded ? (
                      <ChevronUp className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5" />
                    )
                  }
                >
                  {isHistoryExpanded
                    ? t("seeLess")
                    : t("seeMore", {
                        count: combinedItems.length - INITIAL_HISTORY_COUNT,
                      })}
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* MODAL 1: Issue or Edit Voucher */}
      {voucherModal.isOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-xl shadow-xl relative w-full max-w-md max-h-[92vh] overflow-y-auto">
            <button
              onClick={() => setVoucherModal({ isOpen: false, type: "create" })}
              className="absolute top-4 end-4 text-gray-400 hover:text-gray-600 z-10"
            >
              <Image src="/close.png" alt="close" width={16} height={16} />
            </button>
            <PaymentForm
              student={student as any}
              classData={voucherModal.classData || classMetrics[0]?.class || { id: 1, name: locale === "ar" ? "فوج" : "Groupe", inscriptionFee: 0, pricePerCycle: 0 }}
              setOpen={(open) => setVoucherModal({ ...voucherModal, isOpen: open })}
              type={voucherModal.type}
              data={voucherModal.voucher}
              defaultInscriptionFee={configuredInscriptionFee}
            />
          </div>
        </div>
      )}

      {/* MODAL 2: Credit Transfer */}
      {transferModal.isOpen && transferModal.enrollment && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-xl shadow-xl relative w-full max-w-md p-5 font-sans">
            <button
              onClick={() => setTransferModal({ isOpen: false, maxSessions: 0 })}
              className="absolute top-4 end-4 text-gray-400 hover:text-gray-600"
            >
              <Image src="/close.png" alt="close" width={16} height={16} />
            </button>

            <h3 className="text-base font-bold text-gray-900 border-b pb-2">
              {t("modalTransferTitle")}
            </h3>
            <p className="text-xs text-muted mt-2">
              {t("modalTransferDesc", { group: transferModal.enrollment.class.name })}
            </p>

            <div className="mt-4 space-y-3 text-xs">
              <div className="bg-blue-50 p-2.5 rounded border border-blue-200 text-blue-900">
                {t("modalTransferAvailable")} <strong>{transferModal.maxSessions} {t("sessionsUnit")}</strong>
              </div>

              <div>
                <label className="font-semibold block mb-1">{t("modalTransferTargetClass")}</label>
                <SearchableGroupSelect
                  options={availableClassesForTransfer
                    .filter((c) => c.id !== transferModal.enrollment?.classId)
                    .map((c) => ({
                      id: c.id,
                      name: c.name,
                      secondaryLabel: c.branch.name,
                    }))}
                  value={targetClassId}
                  onChange={(val) => setTargetClassId(val ? Number(val) : "")}
                  placeholder={t("modalTransferSelectPlaceholder")}
                  searchPlaceholder={locale === "ar" ? "بحث عن فوج..." : "Rechercher un groupe..."}
                  buttonClassName="text-xs p-2 min-h-[38px]"
                />
              </div>

              <div>
                <label className="font-semibold block mb-1">{t("modalTransferCountLabel")}</label>
                <input
                  type="number"
                  min="1"
                  max={Math.max(1, transferModal.maxSessions)}
                  value={sessionsToTransfer}
                  onChange={(e) => setSessionsToTransfer(Number(e.target.value))}
                  className="w-full border border-border rounded p-2 text-xs font-mono"
                />
              </div>

              <div>
                <label className="font-semibold block mb-1">{t("modalTransferNotesLabel")}</label>
                <input
                  type="text"
                  placeholder={t("modalTransferNotesPlaceholder")}
                  value={transferNotes}
                  onChange={(e) => setTransferNotes(e.target.value)}
                  className="w-full border border-border rounded p-2 text-xs"
                />
              </div>

              <div className="pt-3 flex gap-2 justify-end">
                <Button
                  size="sm"
                  variant="primary"
                  onClick={handleExecuteTransfer}
                  disabled={isTransferPending || !targetClassId || sessionsToTransfer < 1}
                >
                  {isTransferPending ? t("modalTransferSubmitting") : t("modalTransferConfirm")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setTransferModal({ isOpen: false, maxSessions: 0 })}
                >
                  {tCommon("cancel")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Audit Trail Modal */}
      {auditModal.isOpen && (auditModal.voucher || auditModal.transfer) && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-xl shadow-xl relative w-full max-w-lg max-h-[92vh] overflow-y-auto p-5 font-sans">
            <button
              onClick={() => setAuditModal({ isOpen: false })}
              className="absolute top-4 end-4 text-gray-400 hover:text-gray-600"
            >
              <Image src="/close.png" alt="close" width={16} height={16} />
            </button>

            {auditModal.transfer ? (
              <div>
                <h3 className="text-base font-bold text-gray-900 border-b pb-2 flex items-center gap-2">
                  <span className="p-1 rounded bg-purple-100 text-purple-700">
                    <ArrowRightLeft className="w-4 h-4" />
                  </span>
                  <span>
                    {locale === "ar"
                      ? `سجل تدقيق تحويل الرصيد #TRF-${auditModal.transfer.id}`
                      : `Journal d'audit du transfert #TRF-${auditModal.transfer.id}`}
                  </span>
                </h3>

                <div className="mt-4 space-y-3 text-xs">
                  <div className="bg-purple-50/60 p-3.5 rounded-xl border border-purple-200/80 space-y-2">
                    <div className="flex justify-between items-center py-1 border-b border-purple-100">
                      <span className="text-muted">{locale === "ar" ? "الفوج المصدر (القديم) :" : "Groupe d'origine :"}</span>
                      <span className="font-bold text-gray-900">
                        {auditModal.transfer.fromClass?.name || (locale === "ar" ? "فوج مصدر" : "Groupe source")}
                        {auditModal.transfer.fromClass?.branch?.name && (
                          <span className="text-[10px] text-muted font-normal ms-1">
                            ({auditModal.transfer.fromClass.branch.name})
                          </span>
                        )}
                      </span>
                    </div>

                    <div className="flex justify-between items-center py-1 border-b border-purple-100">
                      <span className="text-muted">{locale === "ar" ? "الفوج الهدف (الجديد) :" : "Groupe de destination :"}</span>
                      <span className="font-bold text-purple-950">
                        {auditModal.transfer.toClass?.name || (locale === "ar" ? "فوج هدف" : "Groupe cible")}
                        {auditModal.transfer.toClass?.branch?.name && (
                          <span className="text-[10px] text-muted font-normal ms-1">
                            ({auditModal.transfer.toClass.branch.name})
                          </span>
                        )}
                      </span>
                    </div>

                    <div className="flex justify-between items-center py-1 border-b border-purple-100">
                      <span className="text-muted">{locale === "ar" ? "عدد الحصص المنقولة :" : "Séances transférées :"}</span>
                      <span className="font-mono font-bold text-sm text-purple-900">
                        +{auditModal.transfer.transferredSessions} {locale === "ar" ? "حصص" : "séances"}
                      </span>
                    </div>

                    <div className="flex justify-between items-center py-1 border-b border-purple-100">
                      <span className="text-muted">{locale === "ar" ? "القيمة المالية المعادلة :" : "Valeur financière équivalente :"}</span>
                      <span className="font-mono font-bold text-gray-900">
                        {Number(auditModal.transfer.amount || 0).toLocaleString(locale === "ar" ? "ar-DZ" : "fr-DZ")} DZD
                      </span>
                    </div>

                    <div className="flex justify-between items-center py-1 border-b border-purple-100">
                      <span className="text-muted">{locale === "ar" ? "الموظف المنفذ للتحويل :" : "Effectué par :"}</span>
                      <span className="font-semibold text-gray-800">{auditModal.transfer.transferredBy}</span>
                    </div>

                    <div className="flex justify-between items-center py-1">
                      <span className="text-muted">{locale === "ar" ? "تاريخ ووقت التحويل :" : "Date et heure du transfert :"}</span>
                      <span className="font-mono text-gray-800">
                        {new Date(auditModal.transfer.transferredAt).toLocaleString(locale === "ar" ? "ar-DZ" : "fr-DZ")}
                      </span>
                    </div>
                  </div>

                  {/* Notes / Reason */}
                  <div className="bg-surface-subtle p-3 rounded-xl border border-border">
                    <p className="font-bold text-gray-900 mb-1">
                      {locale === "ar" ? "سبب / ملاحظات التحويل :" : "Motif / Remarques du transfert :"}
                    </p>
                    <p className="text-gray-700 italic">
                      {auditModal.transfer.notes ||
                        (locale === "ar" ? "لا توجد ملاحظات مسجلة." : "Aucune remarque spécifiée lors du transfert.")}
                    </p>
                  </div>
                </div>
              </div>
            ) : auditModal.voucher ? (
              <div>
                <h3 className="text-base font-bold text-gray-900 border-b pb-2">
                  {t("modalAuditTitle", { voucher: formatVoucherDisplay(auditModal.voucher) })}
                </h3>

                <div className="mt-4 space-y-3 text-xs">
                  <div className="bg-surface-muted p-3 rounded-lg border border-border space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted">{t("modalAuditAmount")}</span>
                      <span className="font-mono font-bold">{Number(auditModal.voucher.amount).toLocaleString(locale === "ar" ? "ar-DZ" : "fr-DZ")} DZD</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted">{t("modalAuditIssuedBy")}</span>
                      <span>{auditModal.voucher.issuedBy}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted">{t("modalAuditIssuedAt")}</span>
                      <span className="font-mono">{new Date(auditModal.voucher.issuedAt).toLocaleString(locale === "ar" ? "ar-DZ" : "fr-DZ")}</span>
                    </div>
                  </div>

                  {/* Edits trail */}
                  {auditModal.voucher.edits && auditModal.voucher.edits.length > 0 && (
                    <div className="space-y-2">
                      <p className="font-bold text-amber-800">{t("modalAuditEditsTitle")}</p>
                      {auditModal.voucher.edits.map((ed) => (
                        <div key={ed.id} className="bg-amber-50 p-2.5 rounded border border-amber-200">
                          <div>
                            {t("modalAuditFieldChanged", {
                              field: ed.fieldName,
                              oldVal: ed.oldValue,
                              newVal: ed.newValue,
                            })}
                          </div>
                          <div className="text-muted text-[10px] mt-0.5">
                            {t("modalAuditEditedBy", {
                              user: ed.editedBy,
                              date: new Date(ed.editedAt).toLocaleString(locale === "ar" ? "ar-DZ" : "fr-DZ"),
                            })}
                          </div>
                          {ed.reason && <p className="text-gray-600 italic mt-0.5">{t("modalAuditEditReason", { reason: ed.reason })}</p>}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Refunds trail */}
                  {auditModal.voucher.refunds && auditModal.voucher.refunds.length > 0 && (
                    <div className="space-y-2">
                      <p className="font-bold text-red-800">{t("modalAuditRefundsTitle")}</p>
                      {auditModal.voucher.refunds.map((rf) => (
                        <div key={rf.id} className="bg-red-50 p-2.5 rounded border border-red-200">
                          <div className="flex justify-between font-bold text-red-700">
                            <span>{t("modalAuditRefundItem", { amount: Number(rf.amount).toLocaleString(locale === "ar" ? "ar-DZ" : "fr-DZ") })}</span>
                            <span className="text-muted text-[10px] font-normal">{new Date(rf.refundedAt).toLocaleString(locale === "ar" ? "ar-DZ" : "fr-DZ")}</span>
                          </div>
                          <div className="mt-1 text-gray-700">{t("modalAuditRefundReason", { reason: rf.reason })}</div>
                          <div className="text-[10px] text-muted mt-0.5">{t("modalAuditRefundBy", { user: rf.refundedBy })}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* MODAL 4: Refund Modal */}
      {refundModal.isOpen && refundModal.voucher && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-xl shadow-xl relative w-full max-w-md p-5 font-sans">
            <button
              onClick={() => setRefundModal({ isOpen: false, remainingBalance: 0, maxRefundable: 0, unconsumedSessions: 0 })}
              className="absolute top-4 end-4 text-gray-400 hover:text-gray-600"
            >
              <Image src="/close.png" alt="close" width={16} height={16} />
            </button>

            <h3 className="text-base font-bold text-gray-900 border-b pb-2 flex items-center gap-2">
              <span className="text-red-600 font-mono" dir="ltr">
                {t("modalRefundTitle", { voucher: formatVoucherDisplay(refundModal.voucher) })}
              </span>
            </h3>

            <div className="mt-4 space-y-3 text-xs">
              {/* Cashback Cap Banner */}
              <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg space-y-1.5 font-mono">
                <div className="flex justify-between">
                  <span className="text-muted">{t("originalVoucherAmount")}</span>
                  <span className="font-bold text-gray-900">
                    {Number(refundModal.voucher.amount).toLocaleString(locale === "ar" ? "ar-DZ" : "fr-DZ")} DZD
                  </span>
                </div>
                <div className="flex justify-between text-green-700 font-bold">
                  <span>{t("modalRefundAvailable")}</span>
                  <span className="text-sm">
                    {(refundModal.maxRefundable ?? refundModal.remainingBalance).toLocaleString(locale === "ar" ? "ar-DZ" : "fr-DZ")} DZD
                  </span>
                </div>
                {refundModal.unconsumedSessions !== undefined && (
                  <p className="text-[11px] text-muted border-t border-blue-200/60 pt-1 font-sans">
                    {t("cashbackCapInfo", {
                      count: refundModal.unconsumedSessions,
                      amount: (refundModal.maxRefundable ?? refundModal.remainingBalance).toLocaleString(locale === "ar" ? "ar-DZ" : "fr-DZ"),
                    })}
                  </p>
                )}
              </div>

              {/* Fast Presets */}
              {(refundModal.maxRefundable ?? 0) > 0 && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setRefundAmount(refundModal.maxRefundable)}
                    className={`flex-1 py-1.5 px-2 rounded-lg border text-xs font-semibold transition-colors ${
                      Number(refundAmount) === refundModal.maxRefundable
                        ? "bg-red-600 text-white border-red-600 shadow-xs"
                        : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100"
                    }`}
                  >
                    100% ({refundModal.maxRefundable.toLocaleString(locale === "ar" ? "ar-DZ" : "fr-DZ")} DZD)
                  </button>
                  <button
                    type="button"
                    onClick={() => setRefundAmount(Math.round(refundModal.maxRefundable / 2))}
                    className="py-1.5 px-3 rounded-lg border border-gray-200 text-xs font-semibold bg-gray-50 text-gray-700 hover:bg-gray-100"
                  >
                    50%
                  </button>
                </div>
              )}

              <div>
                <label className="font-semibold block mb-1">{t("modalRefundAmountLabel")}</label>
                <input
                  type="number"
                  min="1"
                  max={refundModal.maxRefundable ?? refundModal.remainingBalance}
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value === "" ? "" : Number(e.target.value))}
                  className="w-full border border-border rounded p-2 font-mono font-bold text-red-600 focus:ring-1 focus:ring-primary outline-none"
                />
              </div>

              <div>
                <label className="font-semibold block mb-1">{t("modalRefundReasonLabel")}</label>
                <textarea
                  rows={2}
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  placeholder={t("modalRefundReasonPlaceholder")}
                  className="w-full border border-border rounded p-2 focus:ring-1 focus:ring-primary outline-none"
                />
              </div>

              <div className="pt-3 flex gap-2 justify-end border-t">
                <Button
                  size="sm"
                  variant="danger"
                  onClick={handleExecuteRefund}
                  disabled={
                    isRefundPending ||
                    !refundAmount ||
                    Number(refundAmount) <= 0 ||
                    Number(refundAmount) > (refundModal.maxRefundable ?? refundModal.remainingBalance) ||
                    !refundReason ||
                    refundReason.trim().length < 3
                  }
                >
                  {isRefundPending ? t("modalRefundSubmitting") : t("modalRefundConfirm")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setRefundModal({ isOpen: false, remainingBalance: 0, maxRefundable: 0, unconsumedSessions: 0 })}
                >
                  {tCommon("cancel")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

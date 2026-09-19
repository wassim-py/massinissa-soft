"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { Voucher, VoucherEdit, Refund } from "@prisma/client";
import PaymentForm from "./forms/PaymentForm";
import PrintTicketButton from "./PrintTicketButton";
import { formatVoucherDisplay } from "@/lib/voucherUtils";
import { transferEnrollmentCredit, createRefund } from "@/lib/actions";
import { computeStudentSessionFee } from "@/lib/studentBilling";
import { toast } from "react-toastify";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { AlertTriangle, Building2, Clock, CheckCircle2, AlertCircle, Sparkles, ShieldAlert } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";

export type ExtendedEnrollmentItem = {
  id: number;
  classId: number;
  enrolledAt: Date | string;
  inscriptionFeeCharged: boolean;
  inscriptionFeeAmount?: number | null;
  feeOverriddenByOwner: boolean;
  feeOverrideNote?: string | null;
  isNonPayer?: boolean;
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
  transfersFrom?: Array<{ id: number; transferredSessions: number; transferredAt: Date | string; transferredBy: string }>;
  transfersTo?: Array<{ id: number; transferredSessions: number; transferredAt: Date | string; transferredBy: string }>;
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
  family?: { id: number; payerStudentId: string | null } | null;
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
}

export default function StudentPaymentDetails({
  student,
  classData,
  isOwner = true,
  activeBranchId = 1,
  availableClassesForTransfer = [],
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
    voucher?: ExtendedVoucherItem;
  }>({ isOpen: false });

  const [refundModal, setRefundModal] = useState<{
    isOpen: boolean;
    voucher?: ExtendedVoucherItem;
    remainingBalance: number;
  }>({ isOpen: false, remainingBalance: 0 });

  const [refundAmount, setRefundAmount] = useState<number | "">("");
  const [refundReason, setRefundReason] = useState<string>("");
  const [isRefundPending, startRefundTransition] = useTransition();

  // Transfer state
  const [targetClassId, setTargetClassId] = useState<number | "">("");
  const [sessionsToTransfer, setSessionsToTransfer] = useState<number>(1);
  const [transferNotes, setTransferNotes] = useState<string>("");
  const [isTransferPending, startTransferTransition] = useTransition();

  // Sibling waiver check
  const isSiblingWaived = Boolean(
    student.family && student.family.payerStudentId && student.family.payerStudentId !== student.id
  );

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

  // Calculate per-class metrics
  const classMetrics = branchScopedEnrollments.map((enr) => {
    const c = enr.class;
    const classVouchers = allVouchers.filter((v) => v.classId === c.id || (v.class && v.class.id === c.id));
    const activeClassVouchers = classVouchers.filter((v) => !v.isVoided);

    const inscVoucher = activeClassVouchers.find((v) => v.paymentType === "INSCRIPTION");
    const bookVoucher = activeClassVouchers.find((v) => v.paymentType === "BOOK");
    const tuitionVouchers = activeClassVouchers.filter((v) => v.paymentType === "TUITION_4SESSION");

    const cyclePrice = Number(c?.pricePerCycle || 0);
    const lessonPrice = cyclePrice > 0 ? cyclePrice / 4 : 0;
    let purchasedSessions = 0;
    if (isSiblingWaived) {
      purchasedSessions = 16;
    } else if (lessonPrice > 0) {
      let totalPaidTuition = 0;
      tuitionVouchers.forEach((v) => {
        const vAmount = Number(v.amount || 0);
        const vRefunded = (v as any).refunds?.reduce((sum: number, r: any) => sum + Number(r.amount || 0), 0) || 0;
        totalPaidTuition += Math.max(0, vAmount - vRefunded);
      });
      purchasedSessions = Math.floor(totalPaidTuition / lessonPrice);
    } else {
      purchasedSessions = tuitionVouchers.length * 4;
    }
    const transferredOut = (enr.transfersFrom || []).reduce((sum, t) => sum + t.transferredSessions, 0);
    const transferredIn = (enr.transfersTo || []).reduce((sum, t) => sum + t.transferredSessions, 0);

    let attendedSessions = 0;
    if (student.attendances) {
      student.attendances.forEach((att) => {
        if (att.status === "PRESENT" && att.lesson && att.lesson.classId === c.id && !att.lesson.isFree) {
          attendedSessions++;
        }
      });
    }

    const netSessions = (purchasedSessions + transferredIn - transferredOut) - attendedSessions;

    const teacherPercentage = (c.teacher as any)?.TeacherPayRate?.[0]?.percentageOfSessionFee
      ? Number((c.teacher as any).TeacherPayRate[0].percentageOfSessionFee)
      : null;

    const enrPayerStatus = (enr as any).payerStatus || student.payerStatus || "NORMAL";
    const feeCalc = computeStudentSessionFee({
      payerStatus: enrPayerStatus,
      pricePerCycle: Number(c.pricePerCycle || 0),
      teacherPercentage,
      isSiblingWaived,
    });

    let status: "PAID" | "EXPIRING" | "UNPAID" | "SIBLING_WAIVED" = "UNPAID";
    if (isSiblingWaived) {
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
      bookVoucher,
      tuitionVouchers,
      purchasedSessions,
      transferredIn,
      transferredOut,
      attendedSessions,
      netSessions,
      status,
      feeCalc,
    };
  });

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

  const handleOpenRefund = (v: ExtendedVoucherItem) => {
    const totalRefunded = v.refunds?.reduce((sum, r) => sum + Number(r.amount), 0) || 0;
    const remBal = Number(v.remainingBalance ?? (Number(v.amount) - totalRefunded));
    setRefundModal({
      isOpen: true,
      voucher: v,
      remainingBalance: remBal,
    });
    setRefundAmount(remBal);
    setRefundReason("");
  };

  const handleExecuteRefund = () => {
    if (!refundModal.voucher || !refundAmount || Number(refundAmount) <= 0) {
      toast.error(t("refundAmountError"));
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
        setRefundModal({ isOpen: false, remainingBalance: 0 });
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

          {/* Sibling waiver banner if applicable */}
          {isSiblingWaived && (
            <div className="mt-4 p-3 bg-purple-50 border border-purple-200 rounded-xl flex items-center gap-2 text-xs text-purple-900">
              <span className="font-bold">{t("siblingWaiverActive")}</span>
              {t("siblingWaiverDesc")}
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
                  const isPaid = cm.status === "PAID";
                  const isExpiring = cm.status === "EXPIRING" || cm.netSessions === 1;
                  const isUnpaid = cm.status === "UNPAID";
                  const isSibling = cm.status === "SIBLING_WAIVED";

                  return (
                    <Card
                      key={cm.class.id}
                      className={`border p-4 transition-all rounded-xl ${
                        isExpiring
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
                              🏢 {cm.class.branch.name}
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
                          {isExpiring ? (
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
                            {cm.inscVoucher ? (
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
                              {t("transferCredit")} (§2.6)
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

          {/* SCOPED VOUCHERS HISTORY TABLE */}
          <div className="mt-8 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-900">
                {t("vouchersTableTitle")} ({branchScopedVouchers.length})
              </h3>
              <p className="text-xs text-muted">
                {t("officialFormatDesc", { format: "BRANCH [LEVEL] BON NUMBER (DATE)" })}
              </p>
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
                  {branchScopedVouchers.length > 0 ? (
                    branchScopedVouchers.map((v) => {
                      const totalRefunded = v.refunds?.reduce((sum, r) => sum + Number(r.amount), 0) || 0;
                      const remainingBalance = Number(v.remainingBalance ?? (Number(v.amount) - totalRefunded));
                      const isVoidedOrFullyRefunded = v.isVoided || remainingBalance <= 0;
                      const isPartiallyRefunded = totalRefunded > 0 && remainingBalance > 0;
                      const formattedLabel = formatVoucherDisplay(v);

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

                              {/* Refund button */}
                              {!isVoidedOrFullyRefunded && remainingBalance > 0 && v.paymentType !== "INSCRIPTION" && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenRefund(v)}
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
                <select
                  value={targetClassId}
                  onChange={(e) => setTargetClassId(Number(e.target.value))}
                  className="w-full border border-border rounded p-2 text-xs bg-white"
                >
                  <option value="">{t("modalTransferSelectPlaceholder")}</option>
                  {availableClassesForTransfer
                    .filter((c) => c.id !== transferModal.enrollment?.classId)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.branch.name})
                      </option>
                    ))}
                </select>
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
      {auditModal.isOpen && auditModal.voucher && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-xl shadow-xl relative w-full max-w-lg max-h-[92vh] overflow-y-auto p-5 font-sans">
            <button
              onClick={() => setAuditModal({ isOpen: false })}
              className="absolute top-4 end-4 text-gray-400 hover:text-gray-600"
            >
              <Image src="/close.png" alt="close" width={16} height={16} />
            </button>

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
        </div>
      )}

      {/* MODAL 4: Refund Modal */}
      {refundModal.isOpen && refundModal.voucher && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-xl shadow-xl relative w-full max-w-md p-5 font-sans">
            <button
              onClick={() => setRefundModal({ isOpen: false, remainingBalance: 0 })}
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
              <div className="bg-blue-50 border border-blue-200 p-2.5 rounded flex justify-between font-mono">
                <span>{t("modalRefundAvailable")}</span>
                <span className="font-bold text-green-700">{refundModal.remainingBalance.toLocaleString(locale === "ar" ? "ar-DZ" : "fr-DZ")} DZD</span>
              </div>

              <div>
                <label className="font-semibold block mb-1">{t("modalRefundAmountLabel")}</label>
                <input
                  type="number"
                  min="1"
                  max={refundModal.remainingBalance}
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value === "" ? "" : Number(e.target.value))}
                  className="w-full border border-border rounded p-2 font-mono font-bold"
                />
              </div>

              <div>
                <label className="font-semibold block mb-1">{t("modalRefundReasonLabel")}</label>
                <textarea
                  rows={2}
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  placeholder={t("modalRefundReasonPlaceholder")}
                  className="w-full border border-border rounded p-2"
                />
              </div>

              <div className="pt-3 flex gap-2 justify-end border-t">
                <Button
                  size="sm"
                  variant="danger"
                  onClick={handleExecuteRefund}
                  disabled={isRefundPending || !refundAmount || Number(refundAmount) <= 0 || !refundReason || refundReason.trim().length < 3}
                >
                  {isRefundPending ? t("modalRefundSubmitting") : t("modalRefundConfirm")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setRefundModal({ isOpen: false, remainingBalance: 0 })}
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

"use client";

import { useState, useTransition, useEffect } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import Link from "next/link";
import { Class, Student, Voucher, Enrollment, EnrollmentTransfer, VoucherEdit, Refund } from "@prisma/client";
import PaymentForm from "./forms/PaymentForm";
import PrintTicketButton from "./PrintTicketButton";
import { transferEnrollmentCredit, createRefund } from "@/lib/actions";
import {
  computeStudentSessionFee,
  computeStudentConsumedSessions,
  computeStudentCreditAndSessions,
  resolvePayerCredit,
  computeEnrollmentInscriptionStatus,
} from "@/lib/studentBilling";
import { toast } from "react-toastify";
import { formatVoucherDisplay } from "@/lib/voucherUtils";
import { useTranslations, useLocale } from "next-intl";
import { DataTable, Column } from "@/components/ui/DataTable";
import { FilterTabs, FilterTabItem } from "@/components/ui/FilterTabs";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FormField, Input, Select } from "@/components/ui/FormField";
import { SearchableGroupSelect } from "@/components/ui/SearchableGroupSelect";
import { ArrowRightLeft, X, Phone } from "lucide-react";
import BookStatusBadge, { BookStudentStatus, computeBookStatus, BookDetailItem } from "@/components/books/BookStatusBadge";

export type ExtendedEnrollment = Enrollment & {
  student: Student & {
    registeredBranch: { id: number; name: string };
    family?: { id: number; payerStudentId: string | null; discountPercentage?: any } | null;
    enrollments: {
      id: number;
      classId: number;
      class: { id: number; name: string; branchId: number; branch: { name: string } };
    }[];
    vouchers?: (Voucher & { refunds?: Refund[] })[];
  };
  transfersFrom: (EnrollmentTransfer & {
    toEnrollment?: { class?: { name: string; branch?: { name: string } } };
  })[];
  transfersTo: (EnrollmentTransfer & {
    fromEnrollment?: { class?: { name: string; branch?: { name: string } } };
  })[];
};

export type ExtendedClass = Class & {
  branch: { id: number; name: string };
  teacher?: { id: string; name: string; TeacherPayRate?: Array<{ percentageOfSessionFee: any }> } | null;
  teacherClassRates?: Array<{ teacherId: string; percentage: any }>;
  enrollments: ExtendedEnrollment[];
  vouchers: (Voucher & {
    series?: { scope: string; id: number } | null;
    edits?: VoucherEdit[];
    refunds?: Refund[];
  })[];
  lessons: {
    id: number;
    isFree: boolean;
    attendances: { studentId: string; status: string }[];
  }[];
};

type FilterType = "ALL" | "UNPAID_ONLY" | "EXPIRING_ONLY" | "PAID_ONLY" | "SIBLING_WAIVED_ONLY";

type CombinedRecord = {
  id: string;
  type: "PAYMENT" | "VIREMENT" | "CASHBACK" | "TRANSFER" | "EDIT";
  title: string;
  subtitle?: string;
  amount?: number;
  sessions?: number;
  date: Date | string;
  user?: string;
  details?: string;
  rawVoucher?: any;
  rawTransfer?: any;
  badgeVariant: "success" | "warning" | "danger" | "primary" | "secondary" | "neutral";
  canRefund?: boolean;
  maxRefundable?: number;
  unconsumedInCycle?: number;
};

export default function PaymentGrid({
  classData,
  availableClassesForTransfer,
  activeTrimester,
  classBooks = [],
  classBookReceipts = [],
  configuredInscriptionFee,
}: {
  classData: ExtendedClass;
  availableClassesForTransfer: {
    id: number;
    name: string;
    levelId?: number | null;
    formationLevelId?: number | null;
    isFormation?: boolean;
    pricePerCycle?: any;
    branch: { name: string };
  }[];
  activeTrimester?: { id: number; name: string; label: string; status: string } | null;
  classBooks?: Array<{ id: number; title: string }>;
  classBookReceipts?: Array<{ studentId: string; bookId: number; receivedAt: string | Date }>;
  configuredInscriptionFee?: number;
}) {
  const t = useTranslations("payments");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<FilterType>("ALL");
  const [mobileView, setMobileView] = useState<"cards" | "table">("table");

  // Modal states
  const [voucherModal, setVoucherModal] = useState<{
    isOpen: boolean;
    student?: any;
    voucher?: Voucher;
    type: "create" | "update";
  }>({ isOpen: false, type: "create" });

  const [transferModal, setTransferModal] = useState<{
    isOpen: boolean;
    enrollment?: ExtendedEnrollment;
    maxSessions: number;
    openEndedHeldSessions?: number;
    netSessions?: number;
  }>({ isOpen: false, maxSessions: 0 });

  const [modificationModal, setModificationModal] = useState<{
    isOpen: boolean;
    studentName: string;
    student: any;
    records: CombinedRecord[];
  }>({ isOpen: false, studentName: "", student: null, records: [] });

  const [refundModal, setRefundModal] = useState<{
    isOpen: boolean;
    voucher?: any;
    transfer?: any;
    studentName: string;
    remainingBalance: number;
    maxRefundable: number;
    unconsumedSessions?: number;
  }>({
    isOpen: false,
    studentName: "",
    remainingBalance: 0,
    maxRefundable: 0,
    unconsumedSessions: undefined,
  });

  const [refundAmount, setRefundAmount] = useState<number | "">("");
  const [refundReason, setRefundReason] = useState<string>("");
  const [isRefundPending, startRefundTransition] = useTransition();

  const handleOpenRefund = (
    v: any,
    studentName: string,
    maxRefundable: number,
    unconsumedSessions?: number
  ) => {
    const totalRefunded = v.refunds?.reduce((sum: number, r: any) => sum + Number(r.amount), 0) || 0;
    const remBal = Number(v.remainingBalance ?? (Number(v.amount) - totalRefunded));
    const effectiveCap = Math.min(remBal, maxRefundable);

    setRefundModal({
      isOpen: true,
      voucher: v,
      transfer: undefined,
      studentName,
      remainingBalance: remBal,
      maxRefundable: effectiveCap,
      unconsumedSessions,
    });
    setRefundAmount(effectiveCap);
    setRefundReason("");
  };

  const handleOpenTransferRefund = (
    tt: any,
    studentName: string,
    remBal: number,
    maxRefundable: number,
    unconsumedSessions: number
  ) => {
    const effectiveCap = Math.min(remBal, maxRefundable);
    setRefundModal({
      isOpen: true,
      voucher: undefined,
      transfer: tt,
      studentName,
      remainingBalance: remBal,
      maxRefundable: effectiveCap,
      unconsumedSessions,
    });
    setRefundAmount(effectiveCap);
    setRefundReason("");
  };

  const handleExecuteRefund = () => {
    if ((!refundModal.voucher && !refundModal.transfer) || !refundAmount || Number(refundAmount) <= 0) {
      toast.error(t("amountPositiveError"));
      return;
    }
    if (!refundReason || refundReason.trim().length < 3) {
      toast.error(t("reasonRequiredError"));
      return;
    }
    if (Number(refundAmount) > refundModal.maxRefundable) {
      toast.error(t("refundExceedsBalance", { balance: refundModal.maxRefundable.toLocaleString() }));
      return;
    }

    startRefundTransition(async () => {
      const res = await createRefund(
        { success: false, error: false },
        {
          voucherId: refundModal.voucher?.id,
          transferId: refundModal.transfer?.id,
          amount: Number(refundAmount),
          reason: refundReason.trim(),
        }
      );

      if (res.success) {
        toast.success(res.message);
        setRefundModal({
          isOpen: false,
          studentName: "",
          remainingBalance: 0,
          maxRefundable: 0,
          unconsumedSessions: undefined,
        });
        setModificationModal({ isOpen: false, studentName: "", student: null, records: [] });
      } else {
        toast.error(res.message);
      }
    });
  };

  // Transfer form state
  const [targetClassId, setTargetClassId] = useState<number | "">("");
  const [sessionsToTransfer, setSessionsToTransfer] = useState<number>(1);
  const [transferNotes, setTransferNotes] = useState<string>("");
  const [isPending, startTransition] = useTransition();

  // Deduplicate enrollments by studentId defensively and exclude transferred-out students
  const uniqueEnrollmentsMap = new Map<string, typeof classData.enrollments[0]>();
  for (const enr of classData.enrollments) {
    // Exclude students who transferred out of this group so they are only shown in their new group
    if (
      enr.status === "TRANSFERRED" ||
      enr.status === "UNENROLLED" ||
      (enr.transfersFrom && enr.transfersFrom.length > 0)
    ) {
      continue;
    }
    if (!uniqueEnrollmentsMap.has(enr.studentId)) {
      uniqueEnrollmentsMap.set(enr.studentId, enr);
    } else {
      const existing = uniqueEnrollmentsMap.get(enr.studentId)!;
      uniqueEnrollmentsMap.set(enr.studentId, {
        ...enr,
        transfersFrom: [...(existing.transfersFrom || []), ...(enr.transfersFrom || [])],
        transfersTo: [...(existing.transfersTo || []), ...(enr.transfersTo || [])],
        feeOverriddenByOwner: existing.feeOverriddenByOwner || enr.feeOverriddenByOwner,
        inscriptionFeeCharged: existing.inscriptionFeeCharged && enr.inscriptionFeeCharged,
      });
    }
  }
  const uniqueEnrollments = Array.from(uniqueEnrollmentsMap.values());

  // Calculate stats
  const processedStudents = uniqueEnrollments.map((enrollment) => {
    const student = enrollment.student;
    const studentVouchers = classData.vouchers.filter((v) => v.studentId === student.id);
    const activeVouchers = studentVouchers.filter((v) => !v.isVoided && !v.isRefund);

    // Inscription fee & 3-groups exemption rule across all student inscription vouchers
    const inscVouchers = activeVouchers.filter((v) => v.paymentType === "INSCRIPTION");
    const paidInscByClass = new Map<number, number>();
    const allStudentInscVouchers = [
      ...((student as any).vouchers || []),
      ...inscVouchers,
    ];
    const seenInscVoucherIds = new Set<number>();
    for (const v of allStudentInscVouchers) {
      if (v.id && seenInscVoucherIds.has(v.id)) continue;
      if (v.id) seenInscVoucherIds.add(v.id);
      if (v.paymentType === "INSCRIPTION" && !v.isVoided && !v.isRefund && v.classId) {
        const vAmount = Number(v.amount || 0);
        const vRefunded =
          (v as any).refunds?.reduce(
            (rSum: number, r: any) => rSum + Number(r.amount || 0),
            0
          ) || 0;
        const netPaid = Math.max(0, vAmount - vRefunded);
        if (netPaid > 0) {
          paidInscByClass.set(v.classId, (paidInscByClass.get(v.classId) || 0) + netPaid);
        }
      }
    }

    const isFormation = Boolean(classData.isFormation);
    const paidInscRegularClassIds = new Set<number>();
    paidInscByClass.forEach((amount, cid) => {
      if (amount > 0) paidInscRegularClassIds.add(cid);
    });

    const inscStatusRes = computeEnrollmentInscriptionStatus({
      enrollment,
      classData,
      vouchers: activeVouchers,
      paidInscClassIds: paidInscRegularClassIds,
    });

    const isInscriptionPaid = inscStatusRes.isInscriptionPaid;
    const totalInscPaid = inscStatusRes.totalPaid;
    const isOwnerWaived = inscStatusRes.status === "WAIVED_OWNER";
    const is3GroupsWaived = inscStatusRes.status === "WAIVED_3GROUPS";
    const isNonPayerInscWaived = inscStatusRes.status === "WAIVED_NON_PAYER";
    const isAutoWaived = is3GroupsWaived || isNonPayerInscWaived;
    const hasPaidThreeInscriptions = is3GroupsWaived;

    const requiredInscFee =
      configuredInscriptionFee && configuredInscriptionFee > 0
        ? configuredInscriptionFee
        : Number(classData.inscriptionFee || 0) > 0
        ? Number(classData.inscriptionFee)
        : isFormation
        ? 1500
        : 1000;
    const inscVoucher = inscVouchers.length > 0 ? inscVouchers[0] : null;
    const enrPayerStatusForInsc = (enrollment as any).payerStatus || (student as any).payerStatus || "NORMAL";

    // Books fee - scoped to active trimester (§7.20)
    const bookVoucher = activeVouchers.find(
      (v) =>
        v.paymentType === "BOOK" &&
        (!activeTrimester?.id || v.trimesterId === activeTrimester.id)
    );

    // Sibling discount: applies ONLY on groups where BOTH siblings are enrolled in
    const payerId = student.family?.payerStudentId;
    const hasPayerSibling = Boolean(payerId && payerId !== student.id);

    // Check if designated payer sibling is actively enrolled in THIS class
    const payerEnrollmentInClass = hasPayerSibling
      ? classData.enrollments.find(
          (e) => e.student.id === payerId && (e.status === "ACTIVE" || !e.status)
        )
      : null;

    const isPayerInThisClass = Boolean(payerEnrollmentInClass);

    let isPayerActiveAndPaid = false;
    if (isPayerInThisClass && payerEnrollmentInClass) {
      const targetPayerStudent = {
        ...payerEnrollmentInClass.student,
        enrollments: [payerEnrollmentInClass],
        vouchers: classData.vouchers.filter(v => v.studentId === payerId && !v.isVoided && !v.isRefund),
        attendances: classData.lessons.flatMap(l => 
          l.attendances.filter(a => a.studentId === payerId).map(a => ({
            lessonId: l.id,
            status: a.status,
            lesson: { id: l.id, classId: classData.id, startsAt: (l as any).startsAt || new Date(0), isFree: l.isFree, isTeacherAbsent: Boolean((l as any).isTeacherAbsent) }
          }))
        ),
        catchUpAttendances: (payerEnrollmentInClass.student as any).catchUpAttendances || [],
      };

      const payerRes = resolvePayerCredit({
        payerStudent: targetPayerStudent,
        classId: classData.id,
        classPricePerCycle: Number(classData.pricePerCycle || 0),
        isFormation: Boolean((classData as any).isFormation || (classData as any).FormationLevel || (classData as any).formationLevelId),
      });
      isPayerActiveAndPaid = payerRes.isPayerActiveAndPaid;
    }

    const isSiblingDiscount = Boolean(isPayerInThisClass && isPayerActiveAndPaid);
    const siblingDiscountPct = isPayerInThisClass
      ? Number((student.family as any)?.discountPercentage ?? 50)
      : 0;
    const isSiblingWaived100 = isPayerInThisClass && siblingDiscountPct >= 100;

    // Tuition cycles & sessions
    const tuitionVouchers = activeVouchers.filter((v) => v.paymentType === "TUITION_4SESSION");
    const formationVouchers = activeVouchers.filter((v) => v.paymentType === "FORMATION");

    const formationPrice = Number(classData.pricePerCycle || 0);
    const totalPaidFormation = formationVouchers.reduce((sum: number, v: any) => {
      const paid = Number(v.amount || 0);
      const refunded = (v.refunds || []).reduce((rSum: number, r: any) => rSum + Number(r.amount || 0), 0);
      return sum + Math.max(0, paid - refunded);
    }, 0);
    const formationRemaining = Math.max(0, formationPrice - totalPaidFormation);
    const isFormationPaidInFull = formationPrice > 0 && totalPaidFormation >= formationPrice;
    const isFormationPartiallyPaid = totalPaidFormation > 0 && totalPaidFormation < formationPrice;

    // Consumed non-free sessions (accounting for Massinissa absence rules)
    const studentAtts: Array<{ lessonId: number; status: string }> = [];
    classData.lessons.forEach((l) => {
      const att = l.attendances.find((a) => a.studentId === student.id);
      if (att) {
        studentAtts.push({ lessonId: l.id, status: att.status });
      }
    });

    const enrPayerStatus = (enrollment as any).payerStatus || (student as any).payerStatus || "NORMAL";

    const classCatchUps = ((student as any).catchUpAttendances || []).filter(
      (cu: any) =>
        (cu.missedLesson && cu.missedLesson.classId === classData.id) ||
        (cu.catchUpLesson && cu.catchUpLesson.classId === classData.id) ||
        classData.lessons.some((l: any) => l.id === cu.missedLessonId || l.id === cu.catchUpLessonId)
    );

    const teacherClassOverride = (classData.teacherClassRates as any[])?.find(
      (tcr: any) => tcr.teacherId === classData.teacherId
    )?.percentage;
    const teacherPercentage = teacherClassOverride != null
      ? Number(teacherClassOverride)
      : classData.teacher?.TeacherPayRate?.[0]?.percentageOfSessionFee
        ? Number(classData.teacher.TeacherPayRate[0].percentageOfSessionFee)
        : null;

    const creditMetrics = computeStudentCreditAndSessions({
      pricePerCycle: Number(classData.pricePerCycle || 0),
      isFormation,
      payerStatus: enrPayerStatus,
      siblingDiscountPercentage: siblingDiscountPct,
      isSiblingWaived: isSiblingWaived100,
      isPayerActiveAndPaid,
      tuitionVouchers,
      transfersIn: enrollment.transfersTo,
      transfersOut: enrollment.transfersFrom,
      creditResetOffset: (enrollment as any).creditResetOffset,
      attendances: studentAtts,
      catchUps: classCatchUps,
      lessons: classData.lessons as any,
      teacherPercentage,
    });

    const purchasedSessions = creditMetrics.purchasedSessions;
    const transferredOut = creditMetrics.transferredOut;
    const transferredIn = creditMetrics.transferredIn;
    const attendedSessions = creditMetrics.attendedSessions;
    const netSessions = creditMetrics.netSessions;
    const refundableSessions = creditMetrics.refundableSessions;
    const netRefundableSessions = creditMetrics.netRefundableSessions;
    const refundableAmount = creditMetrics.refundableAmount;
    const effectiveLessonPrice = creditMetrics.effectiveLessonPrice;

    let computedStatus = creditMetrics.status;
    if (isFormation) {
      if (isSiblingWaived100) {
        computedStatus = "SIBLING_WAIVED";
      } else if (enrPayerStatus === "NON_PAYER") {
        computedStatus = "NON_PAYER";
      } else if (isFormationPaidInFull) {
        computedStatus = "PAID";
      } else if (isFormationPartiallyPaid) {
        computedStatus = "EXPIRING";
      } else {
        computedStatus = "UNPAID";
      }
    }

    const latestVoucher =
      activeVouchers.length > 0
        ? [...activeVouchers].sort(
            (a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime()
          )[0]
        : null;

    // Book status and copy receipts calculation
    const studentReceiptMap = new Map<number, string | Date>();
    classBookReceipts.forEach((r) => {
      if (r.studentId === student.id) {
        studentReceiptMap.set(r.bookId, r.receivedAt);
      }
    });

    let bookReceivedCount = 0;
    const bookDetails: BookDetailItem[] = classBooks.map((b) => {
      const hasReceipt = studentReceiptMap.has(b.id);
      if (hasReceipt) bookReceivedCount++;
      return {
        id: b.id,
        title: b.title,
        received: hasReceipt,
        receivedAt: studentReceiptMap.get(b.id) || null,
      };
    });

    const hasPaidBook = Boolean(bookVoucher);
    const bookStatus: BookStudentStatus = computeBookStatus(
      hasPaidBook,
      bookReceivedCount,
      classBooks.length
    );

    return {
      enrollment,
      student,
      studentVouchers,
      activeVouchers,
      latestVoucher,
      inscVoucher,
      isInscriptionPaid,
      totalInscPaid,
      requiredInscFee,
      isOwnerWaived,
      isAutoWaived,
      is3GroupsWaived,
      isNonPayerInscWaived,
      bookVoucher,
      isWaivedSibling: isSiblingWaived100,
      hasPayerSibling: isSiblingDiscount,
      tuitionVouchers,
      formationVouchers,
      isFormation,
      formationPrice,
      totalPaidFormation,
      formationRemaining,
      isFormationPaidInFull,
      isFormationPartiallyPaid,
      purchasedSessions,
      transferredIn,
      transferredOut,
      attendedSessions,
      consumedLessons: attendedSessions,
      netSessions,
      refundableSessions,
      netRefundableSessions,
      transferableSessions: creditMetrics.transferableSessions,
      openEndedHeldSessions: creditMetrics.openEndedHeldSessions,
      refundableAmount,
      effectiveLessonPrice,
      status: computedStatus,
      isNonPayer: enrPayerStatus === "NON_PAYER",
      isSchoolFeesOnly: creditMetrics.isSchoolFeesOnly,
      bookReceivedCount,
      totalBooks: classBooks.length,
      bookStatus,
      bookDetails,
    };
  });

  // Filter logic
  const filteredStudents = processedStudents.filter((item) => {
    const isTransferred =
      item.enrollment.status === "TRANSFERRED" ||
      (item.enrollment.transfersFrom &&
        item.enrollment.transfersFrom.length > 0 &&
        item.enrollment.status !== "ACTIVE");

    // Transferred students will not show on their first group unless searched up
    if (isTransferred && !searchTerm.trim()) {
      return false;
    }

    // Search filter
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      const cleanNumeric = q.replace(/[^0-9]/g, "");
      const matchName = item.student.name.toLowerCase().includes(q);
      const matchPhone = item.student.phone?.toLowerCase().includes(q);
      const matchId = cleanNumeric && item.student.globalNumber !== undefined
        ? String(item.student.globalNumber).includes(cleanNumeric)
        : false;
      if (!matchName && !matchPhone && !matchId) return false;
    }

    // Type filter
    if (filterType === "UNPAID_ONLY") return item.status === "UNPAID";
    if (filterType === "EXPIRING_ONLY") return item.status === "EXPIRING";
    if (filterType === "PAID_ONLY") return item.status === "PAID";
    if (filterType === "SIBLING_WAIVED_ONLY") return item.status === "SIBLING_WAIVED";

    return true;
  });

  // Active non-transferred students list for KPI counters
  const activeStudentsList = processedStudents.filter(
    (item) =>
      item.enrollment.status !== "TRANSFERRED" &&
      !(
        item.enrollment.transfersFrom &&
        item.enrollment.transfersFrom.length > 0 &&
        item.enrollment.status !== "ACTIVE"
      )
  );

  // Counts for summary cards
  const totalCount = activeStudentsList.length;
  const paidCount = activeStudentsList.filter((s) => s.status === "PAID").length;
  const expiringCount = activeStudentsList.filter((s) => s.status === "EXPIRING").length;
  const unpaidCount = activeStudentsList.filter((s) => s.status === "UNPAID").length;
  const siblingWaivedCount = activeStudentsList.filter((s) => s.status === "SIBLING_WAIVED").length;

  const handleOpenTransfer = (item: any) => {
    const availableBalance = Math.max(0, item.transferableSessions ?? item.netRefundableSessions ?? item.refundableSessions ?? item.netSessions);
    setTransferModal({
      isOpen: true,
      enrollment: item.enrollment,
      maxSessions: availableBalance,
      openEndedHeldSessions: item.openEndedHeldSessions || 0,
      netSessions: item.netSessions,
    });
    setSessionsToTransfer(Math.max(1, availableBalance));
    setTargetClassId("");
    setTransferNotes("");
  };

  const handleExecuteTransfer = () => {
    if (
      !transferModal.enrollment ||
      !targetClassId ||
      sessionsToTransfer < 1 ||
      sessionsToTransfer > transferModal.maxSessions
    ) {
      toast.error(t("invalidTransferError"));
      return;
    }

    startTransition(async () => {
      const res = await transferEnrollmentCredit(
        { success: false, error: false, message: "" },
        {
          fromEnrollmentId: transferModal.enrollment!.id,
          toClassId: Number(targetClassId),
          studentId: transferModal.enrollment!.studentId,
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

  // Open Modification Records modal (combined chronological payments, cashback, virements, transfers)
  const handleOpenModificationRecords = (item: any) => {
    const s = item.student;
    const records: CombinedRecord[] = [];

    // Identify the student's most recent active cycle for class tuition
    const activeTuitionVouchers = item.tuitionVouchers.filter((v: any) => {
      const totalRefunded = v.refunds?.reduce((sum: number, r: any) => sum + Number(r.amount), 0) || 0;
      const rem = Number(v.remainingBalance ?? (Number(v.amount) - totalRefunded));
      return !v.isVoided && rem > 0;
    });

    const sortedActiveCycles = [...activeTuitionVouchers].sort((a, b) => {
      const timeDiff = new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime();
      if (timeDiff !== 0) return timeDiff;
      return b.id - a.id;
    });
    const mostRecentActiveCycle = sortedActiveCycles[0] || null;

    // Remaining unconsumed sessions for this student in this class
    const unconsumedInCycle = item.refundableSessions ?? Math.max(0, Math.min(4, item.netSessions));

    // Add vouchers
    item.studentVouchers.forEach((v: any) => {
      if (v.isRefund) {
        records.push({
          id: `voucher-${v.id}`,
          type: "CASHBACK",
          title: formatVoucherDisplay(v, {
            branchName: classData.branch.name,
            levelName: (classData as any).level?.name,
          }),
          subtitle: t("recordTypeCashback"),
          amount: -Number(v.amount),
          date: v.issuedAt,
          user: v.issuedBy,
          badgeVariant: "danger",
          details: t("recordTypeCashback"),
          rawVoucher: v,
          canRefund: false,
          maxRefundable: 0,
          unconsumedInCycle: 0,
        });
        return;
      }

      const isVirement = Boolean(v.isPartial || v.completesVoucherId);
      const totalRefunded = v.refunds?.reduce((sum: number, r: any) => sum + Number(r.amount), 0) || 0;
      const rem = Number(v.remainingBalance ?? (Number(v.amount) - totalRefunded));
      const isVoidedOrRefunded = v.isVoided || rem <= 0;

      let maxRefundable = 0;
      let canRefund = false;
      let recordUnconsumedInCycle: number | undefined = undefined;

      if (v.paymentType === "INSCRIPTION") {
        const hasNeverAttended = (item.attendedSessions ?? 0) === 0;
        maxRefundable = hasNeverAttended ? rem : 0;
        canRefund = !v.isRefund && !isVoidedOrRefunded && rem > 0 && hasNeverAttended;
        recordUnconsumedInCycle = undefined;
      } else if (v.paymentType === "FORMATION") {
        maxRefundable = rem;
        canRefund = !v.isRefund && !isVoidedOrRefunded && rem > 0;
        recordUnconsumedInCycle = undefined;
      } else {
        const isMostRecentCycle = Boolean(mostRecentActiveCycle && mostRecentActiveCycle.id === v.id);
        const pricePerSession = Number(v.amount) / 4;
        const effectiveCap =
          (item.effectiveLessonPrice ?? 0) > 0
            ? (item.refundableAmount ?? 0)
            : Math.round(unconsumedInCycle * pricePerSession);
        maxRefundable = Math.min(rem, effectiveCap);
        canRefund =
          !v.isRefund &&
          !item.isWaivedSibling &&
          isMostRecentCycle &&
          !isVoidedOrRefunded &&
          maxRefundable > 0 &&
          v.paymentType === "TUITION_4SESSION";
        recordUnconsumedInCycle = unconsumedInCycle;
      }

      records.push({
        id: `voucher-${v.id}`,
        type: isVirement ? "VIREMENT" : "PAYMENT",
        title: formatVoucherDisplay(v, {
          branchName: classData.branch.name,
          levelName: (classData as any).level?.name,
        }),
        subtitle: v.paymentType,
        amount: Number(v.amount),
        date: v.issuedAt,
        user: v.issuedBy,
        badgeVariant: isVoidedOrRefunded ? "danger" : isVirement ? "warning" : "success",
        details: isVoidedOrRefunded
          ? t("fullRefundedVoided")
          : totalRefunded > 0
          ? t("partiallyRefunded")
          : t("activeVoucher"),
        rawVoucher: v,
        canRefund,
        maxRefundable,
        unconsumedInCycle: recordUnconsumedInCycle,
      });

      // Add legacy cashbacks / refunds linked to this voucher only if not already represented as a separate refund voucher
      if (v.refunds && v.refunds.length > 0) {
        const hasRefundVouchers = item.studentVouchers.some((sv: any) => sv.refundForVoucherId === v.id);
        if (!hasRefundVouchers) {
          v.refunds.forEach((r: any) => {
            records.push({
              id: `refund-${r.id}`,
              type: "CASHBACK",
              title: `${t("recordTypeCashback")} (${formatVoucherDisplay(v, {
                branchName: classData.branch.name,
                levelName: (classData as any).level?.name,
              })})`,
              subtitle: r.reason,
              amount: -Number(r.amount),
              date: r.refundedAt,
              user: r.refundedBy,
              badgeVariant: "danger",
              details: r.reason,
            });
          });
        }
      }

      // Add audit edits
      if (v.edits && v.edits.length > 0) {
        v.edits.forEach((e: any) => {
          records.push({
            id: `edit-${e.id}`,
            type: "EDIT",
            title: t("editAuditFieldChanged", {
              field: e.fieldName,
              oldVal: e.oldValue,
              newVal: e.newValue,
            }),
            subtitle: e.reason || "",
            date: e.editedAt,
            user: e.editedBy,
            badgeVariant: "neutral",
            details: e.reason,
          });
        });
      }
    });

    // Add transfers
    if (item.enrollment.transfersFrom && item.enrollment.transfersFrom.length > 0) {
      item.enrollment.transfersFrom.forEach((tf: any) => {
        records.push({
          id: `transfer-from-${tf.id}`,
          type: "TRANSFER",
          title: t("recordTypeTransfer"),
          subtitle: tf.notes || "",
          sessions: -tf.transferredSessions,
          date: tf.transferredAt,
          user: tf.transferredBy,
          badgeVariant: "warning",
          details: tf.notes,
        });
      });
    }

    if (item.enrollment.transfersTo && item.enrollment.transfersTo.length > 0) {
      item.enrollment.transfersTo.forEach((tt: any) => {
        const tagPrefix = `[TRF-#${tt.id}]`;
        const transferRefunds = item.studentVouchers
          .filter((v: any) => v.isRefund)
          .flatMap((v: any) => v.refunds || [])
          .filter((r: any) => typeof r.reason === "string" && r.reason.startsWith(tagPrefix));
        const totalRefunded = transferRefunds.reduce((sum: number, r: any) => sum + Number(r.amount), 0);
        const origAmount =
          Number(tt.transferredAmount) > 0
            ? Number(tt.transferredAmount)
            : Math.round(tt.transferredSessions * (Number(classData.pricePerCycle) / 4));
        const remTransferAmount = Math.max(0, origAmount - totalRefunded);
        const sessionRate =
          tt.transferredSessions > 0
            ? origAmount / tt.transferredSessions
            : Number(classData.pricePerCycle) / 4;
        const refundedSessionsApprox = sessionRate > 0 ? Math.round(totalRefunded / sessionRate) : 0;
        const remainingTransferSessions = Math.max(0, tt.transferredSessions - refundedSessionsApprox);
        const unconsumedTransferSessions = Math.max(
          0,
          Math.min(remainingTransferSessions, Math.max(0, item.netSessions))
        );
        const maxRefundableTransfer = Math.min(
          remTransferAmount,
          Math.round(unconsumedTransferSessions * sessionRate)
        );
        const canRefundTransfer =
          !item.isWaivedSibling && remTransferAmount > 0 && maxRefundableTransfer > 0;

        records.push({
          id: `transfer-to-${tt.id}`,
          type: "TRANSFER",
          title: `${t("recordTypeTransfer")} #TRF-${tt.id}`,
          subtitle: tt.notes || "",
          amount: origAmount,
          sessions: +tt.transferredSessions,
          date: tt.transferredAt,
          user: tt.transferredBy,
          badgeVariant: remTransferAmount <= 0 ? "danger" : "primary",
          details: tt.notes,
          rawTransfer: { ...tt, _origAmount: origAmount, _remAmount: remTransferAmount },
          canRefund: canRefundTransfer,
          maxRefundable: maxRefundableTransfer,
          unconsumedInCycle: unconsumedTransferSessions,
        });
      });
    }

    // Sort chronologically descending
    records.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    setModificationModal({
      isOpen: true,
      studentName: s.name,
      student: s,
      records,
    });
  };

  // Filter tabs definition
  const filterTabs: FilterTabItem[] = [
    { id: "ALL", label: t("allStudentsCount", { count: totalCount }) },
    { id: "UNPAID_ONLY", label: t("unpaidOnly"), count: unpaidCount },
    { id: "EXPIRING_ONLY", label: t("expiringOneLeft"), count: expiringCount },
    { id: "PAID_ONLY", label: t("paidGoodStanding"), count: paidCount },
    { id: "SIBLING_WAIVED_ONLY", label: t("siblingWaived"), count: siblingWaivedCount },
  ];

  // DataTable columns definition
  // §7.8: Removed "consumed lessons", "autre branche", and separate "tuition cycles" column
  const columns: Column<typeof processedStudents[0]>[] = [
    {
      header: "#",
      accessor: "number",
      align: "center",
      className: "w-12 text-center font-mono font-bold text-muted",
    },
    {
      header: t("studentPhone"),
      accessor: "student",
      className: "min-w-[170px]",
    },
    {
      header: t("consumedLessons"),
      accessor: "consumedLessons",
      align: "center",
      className: "min-w-[110px] text-center",
    },
    {
      header: t("inscriptionFee"),
      accessor: "inscriptionFee",
      align: "center",
      className: "min-w-[140px] text-center",
    },
    ...(classData.hasBooks || classBooks.length > 0
      ? [
          {
            header: activeTrimester?.label
              ? `${t("bookFee")} (${activeTrimester.label})`
              : t("bookFee"),
            accessor: "bookFee",
            align: "center" as const,
            className: "min-w-[130px] text-center",
          },
        ]
      : []),
    {
      header: t("remainingBalance"),
      accessor: "remainingBalance",
      align: "center",
      className: "min-w-[100px] text-center",
    },
    {
      header: t("status"),
      accessor: "status",
      align: "center",
      className: "min-w-[120px] text-center",
    },
    {
      header: t("actions"),
      accessor: "actions",
      align: "center",
      className: "min-w-[210px] text-center",
    },
  ];

  const renderRow = (item: typeof processedStudents[0], index: number) => {
    const s = item.student;
    const isTransferred =
      item.enrollment.status === "TRANSFERRED" ||
      (item.enrollment.transfersFrom &&
        item.enrollment.transfersFrom.length > 0 &&
        item.enrollment.status !== "ACTIVE");

    return (
      <tr
        key={`${s.id}-${index}`}
        className={`hover:bg-surface-subtle/50 transition-colors ${
          isTransferred
            ? "bg-pink-50/70 hover:bg-pink-100/70"
            : item.status === "UNPAID"
            ? "bg-danger-light/20"
            : ""
        }`}
      >
        {/* 1. Global Student ID */}
        <td className="py-3 px-3 text-center font-mono font-bold text-muted">
          #{s.globalNumber ?? (index + 1)}
        </td>

        {/* 2. Student Name & Phone */}
        <td className="py-3 px-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Link
              href={`/list/students/${s.id}`}
              className="font-bold text-gray-900 hover:text-primary hover:underline transition-colors"
            >
              {s.name}
            </Link>
            {isTransferred && (
              <Badge variant="neutral" size="sm" className="bg-pink-100 text-pink-700 border-pink-300 font-bold">
                {locale === "ar" ? "محول" : "Transféré"}
              </Badge>
            )}
            {((item.enrollment as any)?.payerStatus || (s as any)?.payerStatus) === "NON_PAYER" && (
              <Badge variant="success" size="sm">
                {locale === "ar" ? "معفى" : "Non-payeur"}
              </Badge>
            )}
            {((item.enrollment as any)?.payerStatus || (s as any)?.payerStatus) === "SCHOOL_FEES_ONLY" && (
              <Badge variant="warning" size="sm">
                {locale === "ar" ? "مستحقات المدرسة فقط" : "Frais école"}
              </Badge>
            )}
            {item.transferredIn > 0 && (
              <Badge
                variant="secondary"
                size="sm"
                className="bg-purple-100 text-purple-900 border-purple-300 font-semibold shadow-2xs inline-flex items-center gap-1 cursor-help"
                title={
                  item.enrollment.transfersTo?.map((t: any) => {
                    const fromName = t.fromEnrollment?.class?.name;
                    return fromName
                      ? `${t.transferredSessions} ${locale === "ar" ? "حصص منقولة من" : "séances transférées depuis"} ${fromName}`
                      : `${t.transferredSessions} ${locale === "ar" ? "حصص منقولة" : "séances transférées"}`;
                  }).join(" • ") || (locale === "ar" ? "رصيد منقول" : "Crédit transféré")
                }
              >
                <ArrowRightLeft className="w-3 h-3 text-purple-600 shrink-0" />
                <span>
                  {locale === "ar"
                    ? `تحويل (+${item.transferredIn})`
                    : `Transféré (+${item.transferredIn})`}
                </span>
              </Badge>
            )}
          </div>
          <div className="text-[11px] text-muted font-mono mt-0.5">
            {s.phone || t("noPhone")}
          </div>
        </td>

        {/* 3. Consumed Lessons */}
        <td className="py-3 px-3 text-center">
          <Badge variant="neutral" size="sm">
            {t("sessionsCount", { count: item.attendedSessions })}
          </Badge>
        </td>

        {/* 4. Inscription Fee Badge (§7.8: paid / not paid / waived via 3rd enrollment) */}
        <td className="py-3 px-3 text-center">
          {item.isInscriptionPaid ? (
            <Badge variant="success" size="sm" withDot>
              {t("inscriptionPaid")}
            </Badge>
          ) : item.isOwnerWaived ? (
            <Badge variant="warning" size="sm" withDot title={locale === "ar" ? "معفى من طرف المالك" : "Exonéré par le gérant"}>
              {locale === "ar" ? "معفى (المالك)" : "Exonéré (Gérant)"}
            </Badge>
          ) : item.is3GroupsWaived ? (
            <Badge variant="secondary" size="sm" withDot>
              {t("inscriptionWaived3rd")}
            </Badge>
          ) : item.isNonPayerInscWaived || item.isNonPayer ? (
            <Badge variant="success" size="sm" withDot>
              {locale === "ar" ? "معفى" : "Exonéré"}
            </Badge>
          ) : (
            <Badge variant="danger" size="sm" withDot>
              {t("inscriptionNotPaid")}
            </Badge>
          )}
        </td>

        {/* 5. Book Fee (if applicable) */}
        {(classData.hasBooks || classBooks.length > 0) && (
          <td className="py-3 px-3 text-center">
            <BookStatusBadge
              status={item.bookStatus}
              receivedCount={item.bookReceivedCount}
              totalBooks={item.totalBooks}
              details={item.bookDetails}
            />
          </td>
        )}

        {/* 6. Session Credit / Monetary Balance */}
        <td className="py-3 px-3 text-center">
          {item.status === "NON_PAYER" || item.status === "SIBLING_WAIVED" ? (
            <Badge variant={item.status === "NON_PAYER" ? "success" : "secondary"} size="sm">
              {item.status === "NON_PAYER"
                ? (locale === "ar" ? "معفى" : "Exonéré")
                : (locale === "ar" ? "أخ دافع" : "Remise fratrie")}
            </Badge>
          ) : item.isFormation ? (
            <div className="flex flex-col items-center gap-0.5">
              <Badge
                variant={
                  item.isFormationPaidInFull
                    ? "success"
                    : item.isFormationPartiallyPaid
                    ? "warning"
                    : "danger"
                }
                size="sm"
              >
                {item.isFormationPaidInFull
                  ? (locale === "ar" ? "خالص" : "Payé en totalité")
                  : item.isFormationPartiallyPaid
                  ? (locale === "ar"
                      ? `متبقي ${item.formationRemaining.toLocaleString("ar-DZ")} دج`
                      : `Reste ${item.formationRemaining.toLocaleString("fr-DZ")} DZD`)
                  : (locale === "ar"
                      ? `غير مدفوع (${item.formationPrice.toLocaleString("ar-DZ")} دج)`
                      : `Non payé (${item.formationPrice.toLocaleString("fr-DZ")} DZD)`)}
              </Badge>
              {item.totalPaidFormation > 0 && !item.isFormationPaidInFull && (
                <span className="text-[10px] text-muted font-medium">
                  {locale === "ar"
                    ? `مدفوع: ${item.totalPaidFormation.toLocaleString("ar-DZ")} دج`
                    : `Payé: ${item.totalPaidFormation.toLocaleString("fr-DZ")} DZD`}
                </span>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-0.5">
              <Badge
                variant={
                  item.netSessions >= 2
                    ? "success"
                    : item.netSessions === 1
                    ? "warning"
                    : "danger"
                }
                size="sm"
              >
                {t("sessionsCount", {
                  count: item.netSessions,
                })}
              </Badge>
              {item.transferableSessions > item.netSessions && (
                <span
                  className="inline-flex items-center gap-1 text-[10px] text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded font-medium mt-0.5"
                  title={
                    locale === "ar"
                      ? `${item.transferableSessions} حصص قابلة للتحويل (تشمل حصص الغياب المفتوح)`
                      : `${item.transferableSessions} séances transférables (inclut les absences ouvertes)`
                  }
                >
                  {item.transferableSessions} {locale === "ar" ? "قابلة للتحويل" : "transférables"}
                </span>
              )}
              {item.isSchoolFeesOnly && (
                <span className="text-[10px] text-amber-700 font-medium">
                  {locale === "ar" ? "حصة المدرسة" : "Part école"}
                </span>
              )}
              {item.hasPayerSibling && (
                <span className="text-[10px] text-muted font-medium">
                  {locale === "ar" ? "أخ دافع" : "Remise fratrie"}
                </span>
              )}
            </div>
          )}
          {item.transferredIn > 0 && !item.isFormation && (
            <span
              className="block text-[10px] text-purple-700 font-medium mt-0.5"
              title={
                item.enrollment.transfersTo?.map((t: any) =>
                  t.fromEnrollment?.class?.name
                    ? `+${t.transferredSessions} (${t.fromEnrollment.class.name})`
                    : `+${t.transferredSessions}`
                ).join(", ")
              }
            >
              +{item.transferredIn} {locale === "ar" ? "محولة" : "transférées"}
            </span>
          )}
        </td>

        {/* 7. Status Badge */}
        <td className="py-3 px-3 text-center">
          {isTransferred ? (
            <Badge variant="neutral" size="sm" withDot className="bg-pink-100 text-pink-700 border-pink-300 font-bold">
              {locale === "ar" ? "محول" : "Transféré"}
            </Badge>
          ) : item.status === "PAID" ? (
            <Badge variant="success" size="sm" withDot>
              {item.isFormation ? (locale === "ar" ? "خالص" : "Payé") : t("paid")}
            </Badge>
          ) : item.status === "EXPIRING" ? (
            <Badge variant="warning" size="sm" withDot>
              {item.isFormation ? (locale === "ar" ? "دفع جزئي" : "Paiement partiel") : t("expiringOneLeft")}
            </Badge>
          ) : item.status === "UNPAID" ? (
            <Badge variant="danger" size="sm" withDot>
              {t("unpaid")}
            </Badge>
          ) : item.status === "SIBLING_WAIVED" ? (
            <Badge variant="secondary" size="sm" withDot>
              {t("siblingWaived")}
            </Badge>
          ) : item.status === "NON_PAYER" ? (
            <Badge variant="success" size="sm" withDot>
              {locale === "ar" ? "معفى من الرسوم" : "Non-payeur"}
            </Badge>
          ) : null}
        </td>

        {/* 8. Actions */}
        <td className="py-3 px-3 text-center">
          <div className="flex items-center justify-center gap-1.5 flex-wrap">
            {!isTransferred && (
              <Button
                variant="primary"
                size="sm"
                onClick={() =>
                  setVoucherModal({
                    isOpen: true,
                    student: s,
                    type: "create",
                  })
                }
                title={t("newVoucherTooltip")}
              >
                {t("voucherShort")}
              </Button>
            )}
            {!isTransferred && (item.transferableSessions ?? item.netRefundableSessions ?? item.netSessions) > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleOpenTransfer(item)}
                title={t("transferTooltip")}
              >
                {t("transfer")}
              </Button>
            )}
            {/* Modification Records button (§7.8 & §7.17: solid high-contrast variant) */}
            <Button
              variant="dark"
              size="sm"
              onClick={() => handleOpenModificationRecords(item)}
              title={t("modificationRecords")}
            >
              {t("modificationRecords")}
            </Button>
            {!isTransferred && item.latestVoucher && (
              <PrintTicketButton
                voucher={{
                  ...item.latestVoucher,
                  student: s,
                  class: classData,
                }}
              />
            )}
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div className="space-y-6 font-sans">
      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Card className="p-4 text-center border-border/80">
          <p className="text-xs text-muted font-medium">{t("totalEnrolled")}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{totalCount}</p>
        </Card>
        <Card className="p-4 text-center border-success-soft bg-success-light/30">
          <p className="text-xs text-success-text font-medium flex items-center justify-center gap-1">
            <span className="w-2 h-2 rounded-full bg-success"></span> {t("paidGoodStanding")}
          </p>
          <p className="text-2xl font-bold text-success-text mt-1">{paidCount}</p>
        </Card>
        <Card className="p-4 text-center border-warning-soft bg-warning-light/30">
          <p className="text-xs text-warning-text font-medium flex items-center justify-center gap-1">
            <span className="w-2 h-2 rounded-full bg-warning"></span> {t("expiringOneLeft")}
          </p>
          <p className="text-2xl font-bold text-warning-text mt-1">{expiringCount}</p>
        </Card>
        <Card className="p-4 text-center border-danger-soft bg-danger-light/30">
          <p className="text-xs text-danger-text font-medium flex items-center justify-center gap-1">
            <span className="w-2 h-2 rounded-full bg-danger"></span> {t("unpaidDue")}
          </p>
          <p className="text-2xl font-bold text-danger-text mt-1">{unpaidCount}</p>
        </Card>
        <Card className="p-4 text-center border-secondary-soft bg-secondary-light/30 col-span-2 sm:col-span-1">
          <p className="text-xs text-secondary-hover font-medium flex items-center justify-center gap-1">
            <span className="w-2 h-2 rounded-full bg-secondary"></span> {t("siblingWaived")}
          </p>
          <p className="text-2xl font-bold text-secondary-hover mt-1">{siblingWaivedCount}</p>
        </Card>
      </div>

      {/* Shared Filter Tabs & Search Controls */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-surface p-4 rounded-xl border border-border/80 shadow-xs">
        <div className="flex items-center gap-2 flex-grow max-w-md">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="w-full border border-border rounded-lg px-3 py-2 text-xs bg-surface focus:ring-2 focus:ring-primary focus:outline-none"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              className="text-xs text-muted hover:text-gray-900"
            >
              {t("clearSearch")}
            </button>
          )}
        </div>

        {/* Shared FilterTabs component from design system */}
        <FilterTabs
          tabs={filterTabs}
          activeTab={filterType}
          onTabChange={(tabId) => setFilterType(tabId as FilterType)}
        />

        {/* View Mode Toggle for Mobile */}
        <div className="flex md:hidden items-center justify-between gap-2 border-t border-border pt-2 w-full">
          <span className="text-xs text-muted font-medium">{t("viewMode")}</span>
          <div className="flex items-center gap-1 bg-surface-muted p-1 rounded-lg">
            <button
              type="button"
              onClick={() => setMobileView("cards")}
              className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${
                mobileView === "cards"
                  ? "bg-primary text-white shadow-xs"
                  : "text-muted hover:text-gray-900"
              }`}
            >
              {t("viewCards")}
            </button>
            <button
              type="button"
              onClick={() => setMobileView("table")}
              className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${
                mobileView === "table"
                  ? "bg-primary text-white shadow-xs"
                  : "text-muted hover:text-gray-900"
              }`}
            >
              {t("viewTable")}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Cards View */}
      {mobileView === "cards" && (
        <div className="md:hidden space-y-3">
          {filteredStudents.length > 0 ? (
            filteredStudents.map((item, index) => {
              const s = item.student;
              const isTransferred =
                item.enrollment.status === "TRANSFERRED" ||
                (item.enrollment.transfersFrom &&
                  item.enrollment.transfersFrom.length > 0 &&
                  item.enrollment.status !== "ACTIVE");

              return (
                <Card
                  key={`${s.id}-${index}`}
                  className={`p-4 border shadow-xs space-y-3 ${
                    isTransferred
                      ? "bg-pink-50/70 border-pink-200"
                      : item.status === "UNPAID"
                      ? "border-danger-soft bg-danger-light/10"
                      : "border-border"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-mono text-muted font-bold bg-surface-muted px-1.5 py-0.5 rounded border border-border">
                          #{s.globalNumber ?? (index + 1)}
                        </span>
                        <Link
                          href={`/list/students/${s.id}`}
                          className="font-bold text-gray-900 text-sm hover:text-primary hover:underline transition-colors"
                        >
                          {s.name}
                        </Link>
                        {isTransferred && (
                          <Badge variant="neutral" size="sm" className="bg-pink-100 text-pink-700 border-pink-300 font-bold">
                            {locale === "ar" ? "محول" : "Transféré"}
                          </Badge>
                        )}
                        {item.transferredIn > 0 && (
                          <Badge
                            variant="secondary"
                            size="sm"
                            className="bg-purple-100 text-purple-900 border-purple-300 font-semibold shadow-2xs inline-flex items-center gap-1"
                          >
                            <ArrowRightLeft className="w-3 h-3 text-purple-600 shrink-0" />
                            <span>
                              {locale === "ar"
                                ? `تحويل (+${item.transferredIn})`
                                : `Transféré (+${item.transferredIn})`}
                            </span>
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted font-mono mt-0.5">
                        {s.phone ? (
                          <a href={`tel:${s.phone}`} className="text-primary hover:underline inline-flex items-center gap-1">
                            <Phone className="w-3 h-3 shrink-0" />
                            <span>{s.phone}</span>
                          </a>
                        ) : (
                          t("noPhone")
                        )}
                      </div>
                    </div>
                    {isTransferred ? (
                      <Badge variant="neutral" size="sm" withDot className="bg-pink-100 text-pink-700 border-pink-300 font-bold">
                        {locale === "ar" ? "محول" : "Transféré"}
                      </Badge>
                    ) : item.status === "PAID" ? (
                      <Badge variant="success" size="sm" withDot>
                        {item.isFormation ? (locale === "ar" ? "خالص" : "Payé") : t("paid")}
                      </Badge>
                    ) : item.status === "EXPIRING" ? (
                      <Badge variant="warning" size="sm" withDot>
                        {item.isFormation ? (locale === "ar" ? "دفع جزئي" : "Paiement partiel") : t("expiringOneLeft")}
                      </Badge>
                    ) : item.status === "UNPAID" ? (
                      <Badge variant="danger" size="sm" withDot>
                        {t("unpaid")}
                      </Badge>
                    ) : item.status === "SIBLING_WAIVED" ? (
                      <Badge variant="secondary" size="sm" withDot>
                        {t("siblingWaived")}
                      </Badge>
                    ) : item.status === "NON_PAYER" ? (
                      <Badge variant="success" size="sm" withDot>
                        {locale === "ar" ? "معفى من الرسوم" : "Non-payeur"}
                      </Badge>
                    ) : null}
                  </div>

                  {/* Metrics Row without Consumed Lessons */}
                  <div className="grid grid-cols-2 gap-2 bg-surface-muted p-2.5 rounded-lg text-center text-xs">
                    <div>
                      <span className="text-[10px] text-muted block mb-0.5">{t("remainingBalance")}</span>
                      {item.status === "NON_PAYER" || item.status === "SIBLING_WAIVED" ? (
                        <Badge variant={item.status === "NON_PAYER" ? "success" : "secondary"} size="sm">
                          {item.status === "NON_PAYER"
                            ? (locale === "ar" ? "معفى" : "Exonéré")
                            : (locale === "ar" ? "أخ دافع" : "Remise fratrie")}
                        </Badge>
                      ) : item.isFormation ? (
                        <div className="flex flex-col items-center gap-0.5">
                          <Badge
                            variant={
                              item.isFormationPaidInFull
                                ? "success"
                                : item.isFormationPartiallyPaid
                                ? "warning"
                                : "danger"
                            }
                            size="sm"
                          >
                            {item.isFormationPaidInFull
                              ? (locale === "ar" ? "خالص" : "Payé en totalité")
                              : item.isFormationPartiallyPaid
                              ? (locale === "ar"
                                  ? `متبقي ${item.formationRemaining.toLocaleString("ar-DZ")} دج`
                                  : `Reste ${item.formationRemaining.toLocaleString("fr-DZ")} DZD`)
                              : (locale === "ar"
                                  ? `غير مدفوع (${item.formationPrice.toLocaleString("ar-DZ")} دج)`
                                  : `Non payé (${item.formationPrice.toLocaleString("fr-DZ")} DZD)`)}
                          </Badge>
                          {item.totalPaidFormation > 0 && !item.isFormationPaidInFull && (
                            <span className="text-[10px] text-muted font-medium">
                              {locale === "ar"
                                ? `مدفوع: ${item.totalPaidFormation.toLocaleString("ar-DZ")} دج`
                                : `Payé: ${item.totalPaidFormation.toLocaleString("fr-DZ")} DZD`}
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-0.5">
                          <Badge
                            variant={
                              item.netSessions >= 2
                                ? "success"
                                : item.netSessions === 1
                                ? "warning"
                                : "danger"
                            }
                            size="sm"
                          >
                            {t("sessionsCount", { count: item.netSessions })}
                          </Badge>
                          {item.isSchoolFeesOnly && (
                            <span className="text-[10px] text-amber-700 font-medium">
                              {locale === "ar" ? "حصة المدرسة" : "Part école"}
                            </span>
                          )}
                          {item.hasPayerSibling && (
                            <span className="text-[10px] text-muted font-medium">
                              {locale === "ar" ? "أخ دافع" : "Remise fratrie"}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <div>
                      <span className="text-[10px] text-muted block mb-0.5">{t("inscriptionFee")}</span>
                      {item.isInscriptionPaid ? (
                        <Badge variant="success" size="sm" withDot>
                          {t("inscriptionPaid")}
                        </Badge>
                      ) : item.isOwnerWaived ? (
                        <Badge variant="warning" size="sm" withDot title={locale === "ar" ? "معفى من طرف المالك" : "Exonéré par le gérant"}>
                          {locale === "ar" ? "معفى (المالك)" : "Exonéré (Gérant)"}
                        </Badge>
                      ) : item.is3GroupsWaived ? (
                        <Badge variant="secondary" size="sm" withDot>
                          {t("inscriptionWaived3rd")}
                        </Badge>
                      ) : item.isNonPayerInscWaived || item.isNonPayer ? (
                        <Badge variant="success" size="sm" withDot>
                          {locale === "ar" ? "معفى" : "Exonéré"}
                        </Badge>
                      ) : (
                        <Badge variant="danger" size="sm" withDot>
                          {t("inscriptionNotPaid")}
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Consumed Lessons & Book Badges */}
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    <Badge variant="neutral" size="sm">
                      {t("consumedLessons")}: {t("sessionsCount", { count: item.attendedSessions })}
                    </Badge>
                    {(classData.hasBooks || classBooks.length > 0) && (
                      <BookStatusBadge
                        status={item.bookStatus}
                        receivedCount={item.bookReceivedCount}
                        totalBooks={item.totalBooks}
                        details={item.bookDetails}
                      />
                    )}
                  </div>

                  {/* Mobile Actions */}
                  <div className="flex items-center gap-1.5 pt-2 border-t border-border flex-wrap">
                    {!isTransferred && (
                      <Button
                        variant="primary"
                        size="sm"
                        className="flex-1"
                        onClick={() =>
                          setVoucherModal({
                            isOpen: true,
                            student: s,
                            type: "create",
                          })
                        }
                      >
                        {t("voucherShort")}
                      </Button>
                    )}
                    {!isTransferred && (item.transferableSessions ?? item.netRefundableSessions ?? item.netSessions) > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenTransfer(item)}
                      >
                        {t("transfer")}
                      </Button>
                    )}
                    <Button
                      variant="dark"
                      size="sm"
                      onClick={() => handleOpenModificationRecords(item)}
                    >
                      {t("modificationRecords")}
                    </Button>
                    {item.latestVoucher && (
                      <PrintTicketButton
                        voucher={{
                          ...item.latestVoucher,
                          student: s,
                          class: classData,
                        }}
                      />
                    )}
                  </div>
                </Card>
              );
            })
          ) : (
            <Card className="text-center py-8 text-muted text-xs">
              {t("noStudentsMatch")}
            </Card>
          )}
        </div>
      )}

      {/* Main Table View using Shared DataTable */}
      <div className={mobileView === "cards" ? "hidden md:block" : "block"}>
        <DataTable
          columns={columns}
          data={filteredStudents}
          renderRow={renderRow}
          emptyTitle={t("noStudentsMatch")}
          emptyDescription=""
        />
      </div>

      {/* MODAL 1: Issue or Edit Voucher */}
      {mounted && voucherModal.isOpen && voucherModal.student && createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-surface rounded-2xl shadow-xl relative w-full max-w-md max-h-[92vh] overflow-y-auto border border-border">
            <button
              type="button"
              onClick={() => setVoucherModal({ isOpen: false, type: "create" })}
              className="absolute top-4 end-4 text-muted hover:text-gray-900 hover:bg-surface-subtle z-10 p-1.5 rounded-lg transition-colors cursor-pointer"
              aria-label={tCommon("close")}
            >
              <X className="w-5 h-5" />
            </button>
            <PaymentForm
              student={voucherModal.student}
              classData={classData}
              setOpen={(open) => setVoucherModal({ ...voucherModal, isOpen: open })}
              type={voucherModal.type}
              data={voucherModal.voucher}
              defaultInscriptionFee={configuredInscriptionFee}
            />
          </div>
        </div>,
        document.body
      )}

      {/* MODAL 2: Group Credit Transfer (§2.6 & §7.17: rebuilt with shared form components) */}
      {mounted && transferModal.isOpen && transferModal.enrollment && createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-surface rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-border animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-border bg-surface-subtle">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <ArrowRightLeft className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-section-title font-bold text-gray-900">
                    {t("transferModalTitle")}
                  </h3>
                  <p className="text-xs text-muted mt-0.5">
                    {t("transferModalDesc", {
                      fromClass: classData.name,
                      student: transferModal.enrollment.student.name,
                    })}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setTransferModal({ isOpen: false, maxSessions: 0 })}
                className="p-1.5 rounded-lg text-muted hover:text-gray-900 hover:bg-surface transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleExecuteTransfer();
              }}
              className="p-6 flex flex-col gap-4"
            >
              <div className="bg-primary-light/50 p-3 rounded-lg border border-primary-soft text-xs flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-muted">{t("transferAvailableBalance")}</span>
                  <strong className="text-primary font-bold font-mono text-sm">
                    {t("sessionsCount", { count: transferModal.maxSessions })}
                  </strong>
                </div>
                {Boolean(transferModal.openEndedHeldSessions && transferModal.openEndedHeldSessions > 0) && (
                  <p className="text-[11px] text-blue-800 bg-blue-100/60 p-2 rounded border border-blue-200 leading-relaxed font-medium">
                    {locale === "ar"
                      ? `يشمل الرصيد المتاح ${transferModal.openEndedHeldSessions} حصة غياب في نهاية المسار قابلة للاسترجاع والتحويل دون خصم من رصيد التلميذ.`
                      : `Inclut ${transferModal.openEndedHeldSessions} séance(s) d'absence ouverte de fin de parcours, remboursable(s) et transférable(s) sans pénalité.`}
                  </p>
                )}
              </div>

              <FormField label={t("targetClassLabel")} required>
                <SearchableGroupSelect
                  options={availableClassesForTransfer
                    .filter((c) => {
                      if (c.id === classData.id) return false;
                      const isSrcFormation = Boolean(classData.isFormation || (classData as any).formationLevelId);
                      const isTargetFormation = Boolean(c.isFormation || c.formationLevelId);
                      if (isSrcFormation !== isTargetFormation) return false;
                      if (isSrcFormation) {
                        return (
                          classData.formationLevelId != null &&
                          c.formationLevelId != null &&
                          c.formationLevelId === classData.formationLevelId
                        );
                      }
                      return (
                        classData.levelId != null &&
                        c.levelId != null &&
                        c.levelId === classData.levelId
                      );
                    })
                    .map((c) => ({
                      id: c.id,
                      name: c.name,
                      secondaryLabel: c.branch.name,
                    }))}
                  value={targetClassId}
                  onChange={(val) => setTargetClassId(val ? Number(val) : "")}
                  placeholder={t("selectTargetClass")}
                  searchPlaceholder={locale === "ar" ? "بحث عن فوج..." : "Rechercher un groupe..."}
                  required
                />
              </FormField>

              <FormField label={t("sessionsToTransferLabel")} required>
                <div className="relative flex items-center">
                  <Input
                    type="number"
                    min="1"
                    max={Math.max(1, transferModal.maxSessions)}
                    value={sessionsToTransfer}
                    onChange={(e) => setSessionsToTransfer(Number(e.target.value))}
                    required
                    className="font-mono pe-16"
                  />
                  <button
                    type="button"
                    onClick={() => setSessionsToTransfer(Math.max(1, transferModal.maxSessions))}
                    className="absolute end-1.5 px-2.5 py-1 text-xs font-bold rounded-md bg-primary text-white hover:bg-primary-dark transition-colors cursor-pointer shadow-2xs"
                    title={locale === "ar" ? "تحديد كامل الرصيد المتاح" : "Définir le maximum disponible"}
                  >
                    MAX
                  </button>
                </div>
              </FormField>

              <FormField label={t("transferNotesLabel")}>
                <Input
                  type="text"
                  placeholder={t("transferNotesPlaceholder")}
                  value={transferNotes}
                  onChange={(e) => setTransferNotes(e.target.value)}
                />
              </FormField>

              <div className="pt-4 border-t border-border flex justify-end gap-3 mt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="md"
                  onClick={() => setTransferModal({ isOpen: false, maxSessions: 0 })}
                  disabled={isPending}
                >
                  {t("cancel")}
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  isLoading={isPending}
                  disabled={isPending || !targetClassId || sessionsToTransfer < 1}
                >
                  {isPending ? t("transferring") : t("confirmTransfer")}
                </Button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* MODAL 3: Combined Modification Records (Payments, Cashback, Virements, Transfers) */}
      {mounted && modificationModal.isOpen && createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-surface rounded-2xl shadow-xl w-full max-w-xl max-h-[90vh] overflow-hidden border border-border animate-in fade-in zoom-in-95 duration-200 flex flex-col font-sans">
            {/* Header: bidirectional flex layout for RTL and LTR */}
            <div className="flex items-start justify-between gap-4 p-5 border-b border-border bg-surface-subtle">
              <div className="space-y-0.5 min-w-0">
                <h3 className="text-section-title font-bold text-gray-900 truncate">
                  {t("modificationRecordsTitle", { name: modificationModal.studentName })}
                </h3>
                <p className="text-xs text-muted">
                  {t("gridSubtitle")}
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setModificationModal({ isOpen: false, studentName: "", student: null, records: [] })
                }
                className="p-1.5 rounded-lg text-muted hover:text-gray-900 hover:bg-surface transition-colors cursor-pointer shrink-0"
                aria-label={tCommon("close")}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-3 pe-2">
              {modificationModal.records.length > 0 ? (
                modificationModal.records.map((record) => (
                  <div
                    key={record.id}
                    className={`p-3.5 border rounded-xl space-y-2 transition-all ${
                      record.type === "CASHBACK"
                        ? "bg-danger-light/25 border-danger-soft"
                        : record.type === "VIREMENT"
                        ? "bg-warning-light/25 border-warning-soft"
                        : record.type === "TRANSFER"
                        ? "bg-primary-light/25 border-primary-soft"
                        : "bg-surface border-border"
                    }`}
                  >
                    <div className="flex justify-between items-start gap-2">
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant={record.badgeVariant} size="sm">
                            {record.type === "PAYMENT"
                              ? t("recordTypePayment")
                              : record.type === "VIREMENT"
                              ? t("recordTypeVirement")
                              : record.type === "CASHBACK"
                              ? t("recordTypeCashback")
                              : record.type === "TRANSFER"
                              ? t("recordTypeTransfer")
                              : "Audit"}
                          </Badge>
                          <span className="font-semibold text-gray-900 text-sm">
                            {record.title}
                          </span>
                        </div>
                        {record.subtitle && (
                          <p className="text-xs text-muted">{record.subtitle}</p>
                        )}
                      </div>

                      {/* Amount or Sessions Badge */}
                      {record.amount !== undefined && (
                        <span
                          className={`font-mono font-bold text-sm shrink-0 ${
                            record.amount < 0 ? "text-danger-text" : "text-success-text"
                          }`}
                        >
                          {record.amount > 0 ? `+${record.amount.toLocaleString()} DZD` : `${record.amount.toLocaleString()} DZD`}
                        </span>
                      )}
                      {record.sessions !== undefined && (
                        <span className="font-mono font-bold text-xs text-primary shrink-0">
                          {record.sessions > 0 ? `+${record.sessions}` : record.sessions} {t("sessionsCount", { count: "" }).trim()}
                        </span>
                      )}
                    </div>

                    <div className="text-muted text-xs flex justify-between items-center pt-1.5 border-t border-border/60">
                      <span>{record.user ? t("byUser", { user: record.user }) : ""}</span>
                      <span>{new Date(record.date).toLocaleString(locale)}</span>
                    </div>

                    {/* Action: Cashback / Refund on the most recent active paid cycle or unstarted inscription (§7.8) */}
                    {record.canRefund && (
                      <div className="pt-2 border-t border-border/80 flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-xs text-muted">
                          {record.unconsumedInCycle !== undefined
                            ? t("cashbackCapInfo", {
                                count: record.unconsumedInCycle ?? 0,
                                amount: (record.maxRefundable ?? 0).toLocaleString(),
                              })
                            : `${t("availableForRefund")}: ${(record.maxRefundable ?? 0).toLocaleString()} DZD`}
                        </span>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() =>
                            record.rawTransfer
                              ? handleOpenTransferRefund(
                                  record.rawTransfer,
                                  modificationModal.studentName,
                                  record.rawTransfer._remAmount,
                                  record.maxRefundable!,
                                  record.unconsumedInCycle ?? 0
                                )
                              : handleOpenRefund(
                                  record.rawVoucher,
                                  modificationModal.studentName,
                                  record.maxRefundable!,
                                  record.unconsumedInCycle
                                )
                          }
                        >
                          {t("refundBtn")}
                        </Button>
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-muted text-center py-8 text-sm">{t("noTransactions")}</p>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* MODAL 4: Process Refund with Cashback Cap */}
      {mounted && refundModal.isOpen && (refundModal.voucher || refundModal.transfer) && createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-surface rounded-2xl shadow-xl relative w-full max-w-md max-h-[92vh] overflow-y-auto p-5 font-sans border border-border">
            <div className="flex items-start justify-between gap-4 border-b border-border pb-3">
              <div>
                <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <span className="text-danger-text font-mono text-sm" dir="ltr">
                    {t("refundModalHeading", {
                      voucher: refundModal.voucher
                        ? formatVoucherDisplay(refundModal.voucher, {
                            branchName: classData.branch.name,
                            levelName: (classData as any).level?.name,
                          })
                        : `#TRF-${refundModal.transfer.id}`,
                    })}
                  </span>
                </h3>
                <p className="text-xs text-muted mt-1">
                  {t("refundStudentAndType", {
                    name: refundModal.studentName,
                    type: refundModal.voucher ? refundModal.voucher.paymentType : t("recordTypeTransfer"),
                  })}
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setRefundModal({
                    isOpen: false,
                    studentName: "",
                    remainingBalance: 0,
                    maxRefundable: 0,
                    unconsumedSessions: 0,
                  })
                }
                className="p-1.5 rounded-lg text-muted hover:text-gray-900 hover:bg-surface-subtle transition-colors shrink-0 cursor-pointer"
                aria-label={tCommon("close")}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 space-y-4 text-xs">
              {/* Cashback Cap Banner */}
              <div className="bg-primary-light/40 border border-primary-soft p-3 rounded-xl space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-muted">{t("originalVoucherAmount")}</span>
                  <span className="font-bold font-mono">
                    {Number(
                      refundModal.voucher
                        ? refundModal.voucher.amount
                        : refundModal.transfer._origAmount ?? refundModal.transfer.transferredAmount
                    ).toLocaleString()}{" "}
                    DZD
                  </span>
                </div>
                <div className="flex justify-between text-success-text font-bold">
                  <span>{t("availableForRefund")}</span>
                  <span className="text-sm font-mono">
                    {refundModal.maxRefundable.toLocaleString()} DZD
                  </span>
                </div>
                {refundModal.unconsumedSessions !== undefined && (
                  <p className="text-[11px] text-muted border-t border-border/60 pt-1">
                    {t("cashbackCapInfo", {
                      count: refundModal.unconsumedSessions,
                      amount: refundModal.maxRefundable.toLocaleString(),
                    })}
                  </p>
                )}
              </div>

              {/* Fast Presets */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setRefundAmount(refundModal.maxRefundable)}
                  className={`flex-1 py-1.5 px-2 rounded-lg border text-xs font-semibold transition-colors ${
                    Number(refundAmount) === refundModal.maxRefundable
                      ? "bg-danger text-white border-danger shadow-xs"
                      : "bg-surface-subtle text-gray-700 hover:bg-surface-muted"
                  }`}
                >
                  {t("fullRefundButton", {
                    balance: refundModal.maxRefundable.toLocaleString(),
                  })}
                </button>
                <button
                  type="button"
                  onClick={() => setRefundAmount(Math.round(refundModal.maxRefundable / 2))}
                  className="py-1.5 px-3 rounded-lg border border-border text-xs font-semibold bg-surface-subtle text-gray-700 hover:bg-surface-muted"
                >
                  50%
                </button>
              </div>

              {/* Amount input */}
              <FormField label={t("refundAmountLabel")} required>
                <Input
                  type="number"
                  min="1"
                  max={refundModal.maxRefundable}
                  step="any"
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(Number(e.target.value))}
                  required
                  className="font-mono text-base font-bold text-danger-text"
                />
              </FormField>

              {/* Reason input */}
              <FormField label={t("refundReasonLabel")} required>
                <Input
                  type="text"
                  placeholder={t("refundReasonPlaceholder")}
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  required
                />
              </FormField>

              <div className="pt-4 border-t border-border flex justify-end gap-2">
                <Button
                  variant="danger"
                  size="sm"
                  onClick={handleExecuteRefund}
                  disabled={
                    isRefundPending ||
                    !refundAmount ||
                    Number(refundAmount) <= 0 ||
                    Number(refundAmount) > refundModal.maxRefundable ||
                    !refundReason ||
                    refundReason.trim().length < 3
                  }
                >
                  {isRefundPending ? t("processingRefund") : t("confirmRefundButton")}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setRefundModal({
                      isOpen: false,
                      studentName: "",
                      remainingBalance: 0,
                      maxRefundable: 0,
                      unconsumedSessions: 0,
                    })
                  }
                  disabled={isRefundPending}
                >
                  {t("cancel")}
                </Button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

import FormContainer from "@/components/FormContainer";
import Timetable from "@/components/Timetable";
import prisma from "@/lib/prisma";
import { getAuthRole, getAuthSession, getActiveBranchId } from "@/lib/auth";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import StudentAttendanceCard from "@/components/StudentAttendanceCard";
import StudentPaymentDetails from "@/components/StudentPaymentDetails";
import BackButton from "@/components/BackButton";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { DataTable, Column } from "@/components/ui/DataTable";
import { StudentAvatar } from "@/components/ui/UserAvatar";
import { serializeForClient } from "@/lib/utils";
import { getTranslations, getLocale } from "next-intl/server";
import { canUserAccessBranch } from "@/lib/settings";
import { computeStudentSessionFee, computeStudentConsumedSessions, computeStudentCreditAndSessions } from "@/lib/studentBilling";
import StudentPayerStatusControl from "@/components/students/StudentPayerStatusControl";
import { getFixedInscriptionFeeAction } from "@/lib/configurationActions";
import {
  Calendar,
  Building2,
  Users,
  GraduationCap,
  Phone,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  ShieldAlert,
  MapPin,
  User,
} from "lucide-react";

function formatLessonDate(date: Date | string, locale: string) {
  const d = new Date(date);
  if (isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-DZ" : "fr-DZ", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

function formatLessonTime(start: Date | string, end: Date | string) {
  const s = new Date(start);
  const e = new Date(end);
  const fmt = (d: Date) =>
    d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${fmt(s)} - ${fmt(e)}`;
}

const formatDZD = (num: number, locale: string) => `${Number(num || 0).toLocaleString(locale === "ar" ? "ar-DZ" : "fr-DZ")} DZD`;

const SingleStudentPage = async (
    props: {
      params: Promise<{ id: string; locale?: string }>;
    }
) => {
    const params = await props.params;
    const { id } = params;
    const t = await getTranslations("studentProfile");
    const tCommon = await getTranslations("common");
    const locale = await getLocale();
    const role = await getAuthRole();
    const session = await getAuthSession();
    const activeBranchId = await getActiveBranchId();

    const [rawStudent, studentPaymentData, availableClasses, configuredInscriptionFee] = await Promise.all([
      prisma.$queryRaw<any[]>`
        SELECT s.*, b.name as "branchName"
        FROM "Student" s
        LEFT JOIN "Branch" b ON b.id = s."registeredBranchId"
        WHERE s.id = ${id}
        LIMIT 1
      `,
      prisma.student.findUnique({
        where: { id },
        include: {
          registeredBranch: true,
          parentPhoneNumbers: true,
          family: {
            include: {
              payerStudent: true,
              students: true,
            },
          },
          enrollments: {
            include: {
              class: {
                include: {
                  branch: true,
                  level: true,
                  FormationLevel: {
                    include: {
                      Language: true,
                    },
                  },
                  teacherClassRates: true,
                  teacher: {
                    include: {
                      TeacherPayRate: {
                        orderBy: { effectiveFrom: "desc" },
                        take: 1,
                      },
                    },
                  },
                },
              },
              transfersFrom: {
                include: {
                  toEnrollment: {
                    include: {
                      class: {
                        include: { branch: true },
                      },
                    },
                  },
                },
                orderBy: { transferredAt: "desc" },
              },
              transfersTo: {
                include: {
                  fromEnrollment: {
                    include: {
                      class: {
                        include: { branch: true },
                      },
                    },
                  },
                },
                orderBy: { transferredAt: "desc" },
              },
            },
            orderBy: { enrolledAt: "asc" },
          },
          vouchers: {
            include: {
              series: {
                include: {
                  level: true,
                  issuingBranch: true,
                  targetBranch: true,
                },
              },
              class: {
                include: {
                  branch: true,
                  level: true,
                },
              },
              edits: {
                orderBy: { editedAt: "desc" },
              },
              refunds: {
                orderBy: { refundedAt: "desc" },
              },
            },
            orderBy: { issuedAt: "desc" },
          },
          attendances: {
            include: {
              lesson: {
                select: { id: true, isFree: true, isTeacherAbsent: true, classId: true, startsAt: true },
              },
            },
          },
        },
      }),
      prisma.class.findMany({
        select: {
          id: true,
          name: true,
          branch: { select: { name: true } },
        },
        orderBy: [{ branchId: "asc" }, { name: "asc" }],
      }),
      getFixedInscriptionFeeAction(),
    ]);

    if (!rawStudent || rawStudent.length === 0) {
      return notFound();
    }
    const s = rawStudent[0];

    // Sibling discount check (§2.4)
    const isSiblingDiscount = Boolean(
      studentPaymentData?.family?.payerStudentId &&
      studentPaymentData.family.payerStudentId !== id
    );
    const siblingDiscountPct = isSiblingDiscount
      ? Number((studentPaymentData?.family as any)?.discountPercentage ?? 50)
      : 0;
    const isSiblingWaived100 = siblingDiscountPct >= 100;

    const isFamilyPayer = Boolean(
      studentPaymentData?.family?.payerStudentId &&
      studentPaymentData.family.payerStudentId === id
    );

    const canEditStatus = Boolean(
      session.isOwner || session.isBranchAdmin || session.isOwnerOrAdmin
    );

    // Group metrics & remaining session count per enrolled group across all branches (§1.0 & Rule 3)
    const groupSummaries = (studentPaymentData?.enrollments || []).map((enr) => {
      const c = enr.class;
      const isFormation = Boolean(c.isFormation || (c as any).FormationLevel || (c as any).formationLevelId);
      const classVouchers = (studentPaymentData?.vouchers || []).filter(
        (v) => !v.isVoided && !v.isRefund && (v.classId === c.id || v.class?.id === c.id)
      );

      // Formation Level metrics
      const formationVouchers = classVouchers.filter((v) => v.paymentType === "FORMATION");
      const tuitionVouchers = classVouchers.filter((v) => v.paymentType === "TUITION_4SESSION");
      const formationLevelPrice = Number((c as any).FormationLevel?.lumpSumPrice ?? c.pricePerCycle ?? 0);
      let totalPaidFormation = 0;
      formationVouchers.forEach((v) => {
        const vAmount = Number(v.amount || 0);
        const vRefunded = (v as any).refunds?.reduce((sum: number, r: any) => sum + Number(r.amount || 0), 0) || 0;
        totalPaidFormation += Math.max(0, vAmount - vRefunded);
      });
      if (totalPaidFormation === 0 && isFormation && tuitionVouchers.length > 0) {
        tuitionVouchers.forEach((v) => {
          const vAmount = Number(v.amount || 0);
          const vRefunded = (v as any).refunds?.reduce((sum: number, r: any) => sum + Number(r.amount || 0), 0) || 0;
          totalPaidFormation += Math.max(0, vAmount - vRefunded);
        });
      }
      const isLevelPaid = isFormation && totalPaidFormation >= formationLevelPrice && formationLevelPrice > 0;
      const isLevelPartiallyPaid = isFormation && totalPaidFormation > 0 && totalPaidFormation < formationLevelPrice;
      const levelRemainingBalance = Math.max(0, formationLevelPrice - totalPaidFormation);

      const enrStatus = enr.payerStatus || "NORMAL";
      const creditMetrics = computeStudentCreditAndSessions({
        pricePerCycle: Number(c?.pricePerCycle || 0),
        isFormation,
        payerStatus: enrStatus,
        siblingDiscountPercentage: siblingDiscountPct,
        isSiblingWaived: isSiblingWaived100,
        tuitionVouchers,
        transfersIn: enr.transfersTo,
        transfersOut: enr.transfersFrom,
        creditResetOffset: (enr as any).creditResetOffset,
        attendances: (studentPaymentData?.attendances || []).filter(
          (att: any) => att.lesson && att.lesson.classId === c.id && !att.lesson.isFree
        ),
      });

      const purchasedSessions = creditMetrics.purchasedSessions;
      const transferredIn = creditMetrics.transferredIn;
      const transferredOut = creditMetrics.transferredOut;
      const attendedSessions = creditMetrics.attendedSessions;
      const netSessions = creditMetrics.netSessions;

      const teacherClassOverride = (c.teacherClassRates as any[])?.find(
        (tcr: any) => tcr.teacherId === c.teacherId
      )?.percentage;
      const teacherPercentage = teacherClassOverride != null
        ? Number(teacherClassOverride)
        : (c.teacher as any)?.TeacherPayRate?.[0]?.percentageOfSessionFee
          ? Number((c.teacher as any).TeacherPayRate[0].percentageOfSessionFee)
          : null;

      const feeCalc = computeStudentSessionFee({
        payerStatus: enrStatus,
        pricePerCycle: Number(c.pricePerCycle || 0),
        teacherPercentage,
        isSiblingWaived: isSiblingWaived100,
        siblingDiscountPercentage: siblingDiscountPct,
      });

      return {
        enrollmentId: enr.id,
        classId: c.id,
        className: c.name,
        branchId: c.branchId,
        branchName: c.branch.name,
        levelName: c.level?.name || null,
        isFormation,
        formationLevelName: (c as any).FormationLevel?.name || null,
        formationLanguageName: (c as any).FormationLevel?.Language?.name || null,
        formationLevelPrice,
        totalPaidFormation,
        isLevelPaid,
        isLevelPartiallyPaid,
        levelRemainingBalance,
        teacherName: c.teacher?.name || null,
        netSessions,
        isSiblingWaived: isSiblingWaived100,
        isNonPayer: enrStatus === "NON_PAYER",
        payerStatus: enrStatus,
        status: (enr as any).status || "ACTIVE",
        studentSessionFee: feeCalc.studentSessionFee,
        studentCycleFee: feeCalc.studentCycleFee,
        schoolPercentage: feeCalc.schoolPercentage,
        teacherPercentage: feeCalc.teacherPercentage,
      };
    });

    // Separate active and transferred/unenrolled groups
    const activeGroupSummaries = groupSummaries.filter((g) => g.status === "ACTIVE");
    const inactiveGroupSummaries = groupSummaries.filter((g) => g.status !== "ACTIVE");

    // SORTING RULE (§1.0 / Payment-Renewal Signal - Rule 4):
    // Active non-formation groups with 1 session left appear FIRST.
    // Secondary sort: exhausted/unpaid (<= 0), then paid (> 1), then by class name.
    const sortedActiveGroupSummaries = [...activeGroupSummaries].sort((a, b) => {
      const aIsOne = !a.isFormation && a.netSessions === 1;
      const bIsOne = !b.isFormation && b.netSessions === 1;
      if (aIsOne && !bIsOne) return -1;
      if (!aIsOne && bIsOne) return 1;

      const aIsUnpaid = a.isFormation ? !a.isLevelPaid : a.netSessions <= 0;
      const bIsUnpaid = b.isFormation ? !b.isLevelPaid : b.netSessions <= 0;
      if (aIsUnpaid && !bIsUnpaid) return -1;
      if (!aIsUnpaid && bIsUnpaid) return 1;

      return a.className.localeCompare(b.className);
    });

    const sortedGroupSummaries = [...sortedActiveGroupSummaries, ...inactiveGroupSummaries];

    const expiringGroupsCount = sortedActiveGroupSummaries.filter((g) => !g.isFormation && g.netSessions === 1).length;

    const classIds = (studentPaymentData?.enrollments || [])
      .filter((e) => (e as any).status === "ACTIVE" || !(e as any).status)
      .map((e) => e.classId);

    // UPCOMING LESSONS ACROSS THE WHOLE SCHOOL (§1.0 - Rule 2):
    // Queries lessons in any enrolled group across all 3 branches starting from now
    const now = new Date();
    let upcomingLessons: any[] = [];
    if (classIds.length > 0) {
      upcomingLessons = await prisma.lesson.findMany({
        where: {
          classId: { in: classIds },
          startsAt: { gte: now },
        },
        include: {
          class: true,
          classroom: true,
          branch: true,
          teacher: true,
        },
        orderBy: { startsAt: "asc" },
        take: 15,
      });
    }

    // Lessons for Timetable with branchName included
    let rawLessons: any[] = [];
    if (classIds.length > 0) {
      rawLessons = await prisma.$queryRaw<any[]>`
        SELECT l.*, c.name as "className", t.name as "teacherName", cr.name as "classroomName", b.name as "branchName"
        FROM "Lesson" l
        LEFT JOIN "Class" c ON c.id = l."classId"
        LEFT JOIN "Teacher" t ON t.id = l."teacherId"
        LEFT JOIN "Classroom" cr ON cr.id = l."classroomId"
        LEFT JOIN "Branch" b ON b.id = l."branchId"
        WHERE l."classId" = ANY(${classIds})
        ORDER BY l."startsAt" ASC
      `;
    }

    const dayNames = [
      "SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"
    ];

    const lessons = rawLessons.map((r) => {
      const d = new Date(r.startsAt);
      const dayIndex = isNaN(d.getDay()) ? 0 : d.getDay();
      return {
        id: r.id,
        name: r.className || (locale === "ar" ? "درس" : "Cours"),
        day: dayNames[dayIndex],
        startTime: r.startsAt,
        endTime: r.endsAt,
        startsAt: r.startsAt,
        endsAt: r.endsAt,
        classId: r.classId,
        teacherId: r.teacherId,
        classroomId: r.classroomId,
        branchId: r.branchId,
        branchName: r.branchName || (locale === "ar" ? "الفرع" : "Branche"),
        isExtra: r.isExtra || false,
        isCatchUp: r.isCatchUp || false,
        isFree: r.isFree || false,
        isTeacherAbsent: Boolean(r.isTeacherAbsent),
        extraFee: r.extraFee != null ? Number(r.extraFee) : null,
        subject: { id: r.classId || 1, name: r.className || (locale === "ar" ? "مادة" : "Matière") },
        class: { id: r.classId, name: r.className || (locale === "ar" ? "قسم" : "Classe") },
        teacher: { id: r.teacherId, name: r.teacherName || (locale === "ar" ? "أستاذ" : "Enseignant"), surname: "" },
        classroom: r.classroomId ? { id: r.classroomId, name: r.classroomName || (locale === "ar" ? "قاعة" : "Salle") } : null,
      };
    });

    const parentPhoneNumbers = (studentPaymentData?.parentPhoneNumbers || []).map((p: any) => p.phone);
    const studentLevelId = studentPaymentData?.enrollments?.find((e: any) => e.class?.levelId)?.class?.levelId;

    const student = {
      id: s.id,
      globalNumber: s.globalNumber,
      name: s.name,
      surname: "",
      phone: s.phone || t("notAvailable"),
      address: s.address || t("branchPrefix", { branch: s.branchName || s.registeredBranchId || "ECOLE" }),
      parentPhoneNumbers,
      birthday: s.birthday ? new Date(s.birthday) : new Date(2008, 0, 1),
      sex: s.sex || "MALE",
      familyId: s.familyId,
      parent: s.familyId ? { name: t("familyPrefix", { id: s.familyId }), surname: "" } : null,
      classes: sortedActiveGroupSummaries.map((g) => ({ id: g.classId, name: g.className })),
      gradeId: studentLevelId || undefined,
      registeredBranchId: s.registeredBranchId,
    };

    const upcomingLessonColumns: Column[] = [
      { header: t("colDateTime"), accessor: "startsAt" },
      { header: t("colClass"), accessor: "className" },
      { header: t("colBranch"), accessor: "branchName" },
      { header: t("colClassroom"), accessor: "classroomName" },
      { header: t("colTeacher"), accessor: "teacherName" },
      { header: t("colLessonType"), accessor: "type", align: "center" },
    ];

    const lessonActions = {};
    const relatedDataForForms = {};

    return (
      <div className="flex-1 p-4 md:p-6 flex flex-col gap-6 font-sans">
        <BackButton />

        {/* TOP AT-A-GLANCE PAYMENT-RENEWAL SIGNAL BANNER (Rule 4) */}
        {expiringGroupsCount > 0 && (
          <div className="p-4 bg-amber-50/90 border border-amber-300 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
              <div>
                <h4 className="text-sm font-bold text-amber-950">
                  {t("renewalSignalTitle")}
                </h4>
                <p className="text-xs text-amber-900 mt-0.5">
                  {t("renewalSignalDesc", { count: expiringGroupsCount })}
                </p>
              </div>
            </div>
            <Badge variant="warning" size="md" withDot className="font-bold shrink-0">
              {t("groupsRequireRenewal", { count: expiringGroupsCount })}
            </Badge>
          </div>
        )}

        {/* SECTION 1: CORE INFO & ENROLLED GROUPS (ACROSS ALL 3 BRANCHES - Rule 1 & Rule 3) */}
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Core Profile Card */}
          <Card className="p-6 flex-1 flex flex-col md:flex-row items-center gap-6 border-border/80 shadow-xs">
            <div className="shrink-0">
              <StudentAvatar
                gender={student.sex}
                alt={`${student.surname ? `${student.surname} ${student.name}` : student.name}`}
                size={100}
                className="border-4 border-surface shadow-md"
              />
            </div>
            <div className="grow text-center md:text-start">
              <div className="flex items-center justify-center md:justify-start gap-4 mb-2">
                <h1 className="text-page-title font-bold text-gray-900">
                  {student.surname ? `${student.surname} ${student.name}` : student.name}
                </h1>
                <FormContainer table="student" type="update" data={student} />
              </div>

              {/* Permanent Global ID & Home Branch (§2.10 & §1.0) */}
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 mb-3">
                <Badge variant="primary" size="sm" className="font-mono font-bold">
                  #{s.globalNumber}
                </Badge>
                <span className="text-xs text-muted">
                  {t("globalIdDesc")}
                </span>
                <Badge variant="secondary" size="sm">
                  <Building2 className="w-3 h-3 text-secondary" />
                  <span>{t("registeredBranch", { branch: s.branchName || "ECOLE" })}</span>
                </Badge>
                {isFamilyPayer && (
                  <Badge variant="neutral" size="sm">
                    <ShieldCheck className="w-3 h-3 text-success" />
                    <span>{t("familyPayer")}</span>
                  </Badge>
                )}
                {isSiblingDiscount && (
                  <Badge variant="warning" size="sm" withDot>
                    <ShieldCheck className="w-3 h-3 text-warning" />
                    <span>
                      {locale === "ar"
                        ? `خصم إخوة (${siblingDiscountPct}%)`
                        : `Remise fratrie (${siblingDiscountPct}%)`}
                    </span>
                  </Badge>
                )}

                {/* At-a-glance Suspended Badges per group */}
                {groupSummaries.filter((g) => g.status === "SUSPENDED").map((g) => (
                  <Badge key={`susp-${g.enrollmentId}`} variant="danger" size="sm" withDot className="font-bold">
                    <span>{locale === "ar" ? "معلّق" : "Suspendu"}: {g.className}</span>
                  </Badge>
                ))}

                {/* At-a-glance Student Payer Status Badges per group (§7.18) */}
                {groupSummaries.filter((g) => g.status !== "SUSPENDED" && g.payerStatus === "NON_PAYER").map((g) => (
                  <Badge key={`np-${g.enrollmentId}`} variant="success" size="sm" withDot className="font-bold">
                    <Sparkles className="w-3 h-3 text-success" />
                    <span>{t("badgeNonPayer")}: {g.className}</span>
                  </Badge>
                ))}
                {groupSummaries.filter((g) => g.payerStatus === "SCHOOL_FEES_ONLY").map((g) => (
                  <Badge key={`sf-${g.enrollmentId}`} variant="warning" size="sm" withDot className="font-bold">
                    <ShieldAlert className="w-3 h-3 text-warning" />
                    <span>{t("badgeSchoolFeesOnly")}: {g.className}</span>
                  </Badge>
                ))}
                {groupSummaries.every((g) => g.payerStatus === "NORMAL") && (
                  <Badge variant="neutral" size="sm">
                    <span>{t("badgeNormal")}</span>
                  </Badge>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2 bg-surface-subtle p-2.5 rounded-lg border border-border">
                  <Phone className="w-4 h-4 text-muted shrink-0" />
                  <span className="text-gray-700 text-xs font-mono" dir="ltr">
                    {student.phone || t("notAvailable")}
                  </span>
                </div>
                <div className="flex items-center gap-2 bg-surface-subtle p-2.5 rounded-lg border border-border">
                  <Calendar className="w-4 h-4 text-muted shrink-0" />
                  <span className="text-gray-700 text-xs">
                    {new Intl.DateTimeFormat(locale === "ar" ? "ar-DZ" : "fr-DZ").format(student.birthday)}
                  </span>
                </div>
                <div className="flex items-center gap-2 bg-surface-subtle p-2.5 rounded-lg border border-border sm:col-span-2">
                  <Users className="w-4 h-4 text-muted shrink-0" />
                  <span className="text-gray-700 text-xs">
                    {student.parent ? (student.parent.surname ? `${student.parent.surname} ${student.parent.name}` : student.parent.name) : t("unassigned")}
                  </span>
                </div>
              </div>

              {/* Parent Phone Numbers List (§7.2) */}
              <div className="mt-4 pt-3 border-t border-border">
                <span className="text-xs font-semibold text-gray-700 block mb-2">
                  {t("parentPhoneNumbers")}
                </span>
                {parentPhoneNumbers.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {parentPhoneNumbers.map((phoneVal: string, idx: number) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1.5 bg-surface-subtle px-3 py-1.5 rounded-lg border border-border text-xs font-mono"
                        dir="ltr"
                      >
                        <Phone className="w-3.5 h-3.5 text-primary shrink-0" />
                        <a href={`tel:${phoneVal}`} className="text-primary hover:underline font-semibold">
                          {phoneVal}
                        </a>
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-xs text-muted italic">
                    {t("noParentPhoneNumbers")}
                  </span>
                )}
              </div>

              {/* Student Payer Status Toggle Action Buttons (§7.18) */}
              <StudentPayerStatusControl
                studentId={id}
                enrolledGroups={groupSummaries.map((g) => ({
                  enrollmentId: g.enrollmentId,
                  classId: g.classId,
                  className: g.className,
                  branchName: g.branchName,
                  payerStatus: g.payerStatus,
                  status: g.status,
                }))}
                currentStatus={s.payerStatus || "NORMAL"}
                canEdit={canEditStatus}
              />
            </div>
          </Card>

          {/* Enrolled Groups Across ALL 3 Branches with 1-Session-Left Highlighted First */}
          <div className="flex-1 flex flex-col gap-4">
            <Card className="p-5 flex-1 border-border/80 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-border/70">
                  <div className="flex items-center gap-2">
                    <GraduationCap className="w-4 h-4 text-primary" />
                    <h2 className="text-section-title font-bold text-gray-900">
                      {t("enrolledGroupsTitle")}
                    </h2>
                  </div>
                  <Badge variant="primary" size="sm">
                    {t("enrolledGroupsCount", { count: sortedActiveGroupSummaries.length })}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted mb-3">
                  {t("enrolledGroupsSub")}
                </p>

                <div className="space-y-2 max-h-[190px] overflow-y-auto pe-1">
                  {sortedGroupSummaries.length > 0 ? (
                    sortedGroupSummaries.map((g) => {
                      const isSuspended = g.status === "SUSPENDED";
                      const isTransferred = g.status === "TRANSFERRED";
                      const isUnenrolled = g.status === "UNENROLLED";
                      const isOne = g.status === "ACTIVE" && g.netSessions === 1;
                      const isUnpaid = g.status === "ACTIVE" && g.netSessions <= 0;
                      const isPaid = g.status === "ACTIVE" && g.netSessions > 1;

                      return (
                        <div
                          key={g.enrollmentId}
                          className={`p-2.5 rounded-lg border transition-all flex items-center justify-between gap-2 text-xs ${
                            isSuspended
                              ? "border-rose-300 bg-rose-50/60"
                              : isTransferred || isUnenrolled
                              ? "border-dashed border-gray-300 bg-gray-50/60 opacity-80"
                              : isOne
                              ? "border-amber-400 bg-amber-50/70 ring-1 ring-amber-300"
                              : isUnpaid
                              ? "border-red-200 bg-red-50/40"
                              : "border-border bg-surface-subtle"
                          }`}
                        >
                          <div className="flex flex-col">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-gray-900">{g.className}</span>
                              <Badge variant="secondary" size="sm">
                                <Building2 className="w-3 h-3 inline me-1" />
                                {g.branchName}
                              </Badge>
                              {g.levelName && !g.isFormation && (
                                <Badge variant="neutral" size="sm">
                                  {g.levelName}
                                </Badge>
                              )}
                              {g.isFormation && g.formationLevelName && (
                                <Badge variant="primary" size="sm">
                                  {g.formationLanguageName ? `${g.formationLanguageName} • ${g.formationLevelName}` : g.formationLevelName}
                                </Badge>
                              )}
                              {g.payerStatus === "NON_PAYER" && (
                                <Badge variant="success" size="sm">
                                  {t("badgeNonPayer")}
                                </Badge>
                              )}
                              {g.payerStatus === "SCHOOL_FEES_ONLY" && (
                                <Badge variant="warning" size="sm">
                                  {t("schoolShareOnly", { percent: g.schoolPercentage })}
                                </Badge>
                              )}
                            </div>
                            {g.teacherName && (
                              <span className="text-[11px] text-muted mt-0.5">
                                {t("teacherLabel", { name: g.teacherName })}
                              </span>
                            )}
                          </div>

                          {/* Status badge with distinct visual flag for 1-session left / transferred */}
                          <div className="shrink-0 flex items-center gap-1.5">
                            {isSuspended ? (
                              <Badge variant="danger" size="sm" withDot className="font-bold">
                                {locale === "ar" ? "معلّق" : "Suspendu"}
                              </Badge>
                            ) : isTransferred ? (
                              <Badge variant="secondary" size="sm" withDot>
                                {locale === "ar" ? "رصيد منقول" : "Transféré"}
                              </Badge>
                            ) : isUnenrolled ? (
                              <Badge variant="neutral" size="sm" withDot>
                                {locale === "ar" ? "ملغى التسجيل" : "Désinscrit"}
                              </Badge>
                            ) : g.isFormation ? (
                              g.isLevelPaid ? (
                                <Badge variant="success" size="sm" withDot>
                                  {locale === "ar" ? "المستوى خالص بالكامل" : "Niveau payé"}
                                </Badge>
                              ) : g.isLevelPartiallyPaid ? (
                                <Badge variant="warning" size="sm" withDot>
                                  {locale === "ar"
                                    ? `دفع جزئي (متبقي ${g.levelRemainingBalance.toLocaleString()} د.ج)`
                                    : `Partiel (reste ${g.levelRemainingBalance.toLocaleString()} DZD)`}
                                </Badge>
                              ) : (
                                <Badge variant="danger" size="sm" withDot>
                                  {locale === "ar" ? "المستوى غير مدفوع" : "Niveau non payé"}
                                </Badge>
                              )
                            ) : g.payerStatus === "NON_PAYER" ? (
                              <Badge variant="success" size="sm" withDot>
                                {t("badgeNonPayer")}
                              </Badge>
                            ) : g.isSiblingWaived ? (
                              <Badge variant="neutral" size="sm" withDot>
                                {t("statusSiblingWaived")}
                              </Badge>
                            ) : isOne ? (
                              <Badge variant="warning" size="sm" withDot className="font-bold shadow-xs">
                                {t("statusOneSessionLeft")}
                              </Badge>
                            ) : isPaid ? (
                              <Badge variant="success" size="sm" withDot>
                                {t("statusPaid", { count: g.netSessions })}
                              </Badge>
                            ) : isUnpaid ? (
                              <Badge variant="danger" size="sm" withDot>
                                {t("statusUnpaid", { count: g.netSessions })}
                              </Badge>
                            ) : null}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <span className="text-xs text-muted block py-4 text-center">
                      {t("noEnrolledGroups")}
                    </span>
                  )}
                </div>
              </div>

              {/* Attendance card widget */}
              <div className="pt-3 mt-3 border-t border-border/70 flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-muted">
                  <CheckCircle2 className="w-4 h-4 text-success" />
                  <span>{t("attendanceRate")}</span>
                </div>
                <Suspense fallback={<p className="text-xs text-muted">{t("loadingAttendance")}</p>}>
                  <StudentAttendanceCard id={student.id} />
                </Suspense>
              </div>
            </Card>
          </div>
        </div>

        {/* SECTION 2: UPCOMING LESSONS ACROSS THE WHOLE SCHOOL (Rule 2) */}
        <Card className="border-border/80 shadow-xs">
          <CardHeader className="pb-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-primary" />
                  <span>{t("upcomingLessonsTitle")}</span>
                </CardTitle>
                <CardDescription className="mt-1">
                  {t("upcomingLessonsDesc")}
                </CardDescription>
              </div>
              <Badge variant="primary" size="md">
                {t("upcomingLessonsCount", { count: upcomingLessons.length })}
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="pt-2">
            <DataTable
              columns={upcomingLessonColumns}
              data={upcomingLessons}
              emptyTitle={t("noUpcomingLessons")}
              emptyDescription={t("noUpcomingLessonsDesc")}
              renderRow={(lesson) => (
                <tr
                  key={lesson.id}
                  className="border-b border-border/60 hover:bg-surface-subtle/80 transition-colors text-table-body"
                >
                  <td className="p-3.5 font-medium text-gray-800">
                    <div className="flex flex-col">
                      <span className="font-semibold">{formatLessonDate(lesson.startsAt, locale)}</span>
                      <span className="text-xs text-muted font-mono" dir="ltr">
                        {formatLessonTime(lesson.startsAt, lesson.endsAt)}
                      </span>
                    </div>
                  </td>
                  <td className="p-3.5 font-semibold text-gray-900">
                    {lesson.class.name}
                  </td>
                  <td className="p-3.5">
                    <Badge variant="secondary" size="sm">
                      <Building2 className="w-3 h-3 inline me-1" />
                      {lesson.branch.name}
                    </Badge>
                  </td>
                  <td className="p-3.5 text-gray-700">
                    <span className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-muted shrink-0" />
                      {lesson.classroom?.name || t("noClassroom")}
                    </span>
                  </td>
                  <td className="p-3.5 text-gray-700">
                    <span className="flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-muted shrink-0" />
                      {lesson.teacher?.name || t("unspecified")}
                    </span>
                  </td>
                  <td className="p-3.5 text-center">
                    {lesson.isFree ? (
                      <Badge variant="success" size="sm">{t("typeFree")}</Badge>
                    ) : lesson.isExtra ? (
                      <Badge variant="warning" size="sm">
                        {t("typeExtra")}
                      </Badge>
                    ) : lesson.isCatchUp ? (
                      <Badge variant="secondary" size="sm">{t("typeCatchUp")}</Badge>
                    ) : (
                      <Badge variant="primary" size="sm">{t("typeRegular")}</Badge>
                    )}
                  </td>
                </tr>
              )}
            />
          </CardContent>
        </Card>

        {/* SECTION 3: STUDENT PAYMENT TRACKING & SCOPED VOUCHERS (§1.2, §1.0 & §2.6) */}
        {studentPaymentData && (
          <StudentPaymentDetails
            student={{
              ...serializeForClient(studentPaymentData),
              payerStatus: s.payerStatus || "NORMAL",
            } as any}
            isOwner={session.isOwner}
            activeBranchId={activeBranchId}
            availableClassesForTransfer={serializeForClient(availableClasses) as any}
            configuredInscriptionFee={configuredInscriptionFee}
          />
        )}

        {/* SECTION 4: WEEKLY TIMETABLE (CROSS-BRANCH) */}
        <Card className="p-6 border-border/80 shadow-xs">
          <div className="flex items-center justify-between gap-2 mb-4">
            <div>
              <h2 className="text-section-title font-bold text-gray-900">
                {t("timetableTitle")}
              </h2>
              <p className="text-xs text-muted mt-0.5">
                {t("timetableDesc")}
              </p>
            </div>
            <Badge variant="secondary" size="sm">
              {t("weeklyLessonsCount", { count: lessons.length })}
            </Badge>
          </div>
          <Timetable
            lessons={lessons as any}
            actions={lessonActions}
            relatedDataForForms={relatedDataForForms}
            userRole={role!}
          />
        </Card>
      </div>
    );
};

export default SingleStudentPage;

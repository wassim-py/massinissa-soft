import prisma from "@/lib/prisma";
import { notFound } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { PayslipTicket, PayslipPrintData } from "@/components/printable/PayslipTicket";
import { SchoolShareTicket, SchoolSharePrintData } from "@/components/printable/SchoolShareTicket";
import PrintPayslipButton from "@/components/PrintPayslipButton";
import PrintSchoolShareButton from "@/components/PrintSchoolShareButton";
import Link from "next/link";
import { calculateTeacherPayroll } from "@/lib/payroll";

import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { getLocale } from "next-intl/server";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PayslipDetailPage(props: PageProps) {
  const session = await getAuthSession();
  const locale = await getLocale();

  if (!session.can("view", "finance") || !session.isOwner) {
    return (
      <Card className="p-8 text-center max-w-md mx-auto my-8 border-danger-soft">
        <div className="flex flex-col items-center gap-3">
          <Badge variant="danger" size="md" withDot>
            {locale === "ar" ? "وصول غير مصرح" : "Accès non autorisé"}
          </Badge>
          <p className="text-table-body text-muted">
            {locale === "ar"
              ? "كشوف الرواتب مخصصة لمالك المؤسسة فقط."
              : "Les fiches de paie sont réservées au propriétaire de l'établissement."}
          </p>
        </div>
      </Card>
    );
  }

  const params = await props.params;
  const searchParams = props.searchParams ? await props.searchParams : {};
  const payslipId = Number(params.id);

  if (isNaN(payslipId)) {
    return notFound();
  }

  const payslip = await prisma.payslip.findUnique({
    where: { id: payslipId },
    include: {
      PayrollRun: true,
      PayslipBranchLine: {
        include: { Branch: true },
      },
    },
  });

  if (!payslip) {
    return notFound();
  }

  const isSchoolSharePayslip = payslip.personType === "SCHOOL_SHARE";
  const activeView = searchParams?.view === "school" || isSchoolSharePayslip ? "school" : "teacher";

  // Fetch teacher
  const teacher = await prisma.teacher.findUnique({
    where: { id: payslip.personId },
  });

  // Fetch photocopy details in this period
  const photocopyCharges = await prisma.photocopyCharge.findMany({
    where: {
      teacherId: payslip.personId,
      date: {
        gte: payslip.PayrollRun.periodStart,
        lte: payslip.PayrollRun.periodEnd,
      },
    },
    include: { Branch: true },
    orderBy: { date: "asc" },
  });

  // Fetch salary advances in this period
  const salaryAdvances = await prisma.salaryAdvance.findMany({
    where: {
      personId: payslip.personId,
      date: {
        gte: payslip.PayrollRun.periodStart,
        lte: payslip.PayrollRun.periodEnd,
      },
    },
    orderBy: { date: "asc" },
  });

  // Fetch detailed sessions via calculateTeacherPayroll or database fallback
  const payrollCalc = await calculateTeacherPayroll(
    payslip.personId,
    payslip.PayrollRun.periodStart,
    payslip.PayrollRun.periodEnd
  );

  let sessionItems: Array<NonNullable<PayslipPrintData["sessions"]>[number] & { schoolCut?: number; lessonTuition?: number }> = [];
  if (payrollCalc?.sessionDetails && payrollCalc.sessionDetails.length > 0) {
    sessionItems = payrollCalc.sessionDetails.map((s) => ({
      lessonId: s.lessonId,
      startsAt: s.startsAt,
      className: s.className,
      branchName: s.branchName,
      presentCount: s.presentCount,
      payingCount: s.payingCount,
      sessionPrice: s.sessionPrice,
      teacherCut: s.teacherCut,
      schoolCut: s.schoolCut,
      lessonAmount: s.lessonAmount,
      lessonTuition: (s as any).lessonTuition,
      isFree: s.isFree,
      isExtra: s.isExtra,
      isCatchUp: s.isCatchUp,
      isTeacherAbsent: s.isTeacherAbsent,
    }));
  } else {
    const rawLessons = await prisma.lesson.findMany({
      where: {
        teacherId: payslip.personId,
        startsAt: {
          gte: payslip.PayrollRun.periodStart,
          lte: payslip.PayrollRun.periodEnd,
        },
      },
      include: {
        branch: true,
        class: true,
        attendances: true,
      },
      orderBy: { startsAt: "asc" },
    });

    sessionItems = rawLessons.map((l) => ({
      lessonId: l.id,
      startsAt: l.startsAt,
      className: l.class?.name || "Classe",
      branchName: l.branch.name,
      presentCount: l.attendances.filter((a) => a.status === "PRESENT").length,
      lessonAmount: 0,
      isFree: l.isFree,
      isExtra: l.isExtra,
      isCatchUp: l.isCatchUp,
      isTeacherAbsent: l.isTeacherAbsent,
    }));
  }

  const freeSessionsCount = sessionItems.filter((s) => s.isFree && !s.isTeacherAbsent).length;
  const teacherAbsencesCount = payrollCalc?.teacherAbsencesCount ?? sessionItems.filter((s) => s.isTeacherAbsent).length;

  const printData: PayslipPrintData = {
    id: payslip.id,
    periodStart: payslip.PayrollRun.periodStart,
    periodEnd: payslip.PayrollRun.periodEnd,
    status: payslip.PayrollRun.status,
    teacher: {
      id: payslip.personId,
      name: teacher?.name || payslip.personId,
      phone: (teacher as any)?.phone || null,
    },
    sessionsCount: payslip.sessionsCount || sessionItems.filter((s) => !s.isTeacherAbsent).length,
    freeSessionsCount,
    teacherAbsencesCount,
    grossAmount: Number(payslip.grossAmount),
    bookRevenue: payrollCalc?.bookRevenue || 0,
    bookRevenueDetails: payrollCalc?.bookRevenueDetails || [],
    advances: Number(payslip.advances),
    photocopyDeductions: Number(payslip.photocopyDeductions),
    netAmount: Number(payslip.netAmount),
    branchLines: payslip.PayslipBranchLine.map((bl) => {
      const branchCalc = payrollCalc?.branchBreakdown.find((b) => b.branchId === bl.branchId);
      const branchFree = branchCalc?.freeSessionsCount ?? sessionItems.filter((s) => s.branchName === bl.Branch.name && s.isFree).length;
      return {
        branchId: bl.branchId,
        branchName: bl.Branch.name,
        sessionsCount: bl.sessionsCount,
        freeSessionsCount: branchFree,
        amount: Number(bl.amount),
      };
    }),
    sessions: sessionItems,
    photocopyDetails: photocopyCharges.map((pc) => ({
      branchName: pc.Branch.name,
      pages: pc.pages,
      costAmount: Number(pc.costAmount),
      date: pc.date,
    })),
  };

  const schoolSharePrintData: SchoolSharePrintData = {
    id: payslip.id,
    payrollRunId: payslip.payrollRunId,
    periodStart: payslip.PayrollRun.periodStart,
    periodEnd: payslip.PayrollRun.periodEnd,
    status: payslip.PayrollRun.status,
    teacher: {
      id: payslip.personId,
      name: teacher?.name || payslip.personId,
      phone: (teacher as any)?.phone || null,
    },
    sessionsCount: payslip.sessionsCount || payrollCalc?.totalSessions || sessionItems.filter((s) => !s.isTeacherAbsent).length,
    totalTuitionGross: payrollCalc?.totalTuitionGross || 0,
    teacherGross: payrollCalc?.grossAmount || (isSchoolSharePayslip ? 0 : Number(payslip.grossAmount)),
    schoolGross: isSchoolSharePayslip
      ? Number(payslip.grossAmount)
      : (payrollCalc?.schoolGrossAmount ?? Math.max(0, (payrollCalc?.totalTuitionGross || 0) - (payrollCalc?.grossAmount || 0))),
    photocopyRecovered: Number(payslip.photocopyDeductions),
    schoolNet: isSchoolSharePayslip
      ? Number(payslip.netAmount)
      : (payrollCalc?.schoolNetAmount ?? 0),
    branchLines: (payrollCalc?.branchSchoolBreakdown || []).map((b) => ({
      branchId: b.branchId,
      branchName: b.branchName,
      sessionsCount: b.sessionsCount,
      tuitionAmount: b.tuitionAmount,
      teacherAmount: b.teacherAmount,
      schoolAmount: b.schoolAmount,
    })),
    sessions: sessionItems.map((s) => ({
      lessonId: s.lessonId,
      startsAt: s.startsAt,
      className: s.className,
      branchName: s.branchName,
      presentCount: s.presentCount,
      payingCount: s.payingCount,
      sessionPrice: s.sessionPrice,
      teacherCut: s.teacherCut,
      schoolCut: s.schoolCut || 0,
      lessonAmount: s.lessonAmount,
      lessonTuition: s.lessonTuition || 0,
      isFree: s.isFree,
      isExtra: s.isExtra,
      isCatchUp: s.isCatchUp,
      isTeacherAbsent: s.isTeacherAbsent,
    })),
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Top Header Actions */}
      <Card className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 p-4 border-border/80 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <Link
            href="/list/finance?section=payroll&tab=runs"
            className="flex items-center gap-1.5 text-xs font-bold text-gray-700 hover:text-primary bg-surface-subtle border border-border px-3 py-2 rounded-lg transition-colors"
          >
            {locale === "ar" ? "← العودة لقائمة الرواتب والمالية" : "← Retour aux finances & paie"}
          </Link>
          <div className="flex items-center gap-2">
            <span className="text-section-title font-bold text-gray-900">
              {activeView === "school"
                ? (locale === "ar" ? `حصة المؤسسة #${payslip.id}` : `Part École sur l'enseignant #${payslip.id}`)
                : (locale === "ar" ? `معاينة قسيمة الراتب #${payslip.id}` : `Aperçu de la fiche de paie #${payslip.id}`)}
            </span>
            {teacher?.name && (
              <Badge variant="neutral" size="sm">
                {teacher.name}
              </Badge>
            )}
          </div>
        </div>

        {/* View Switcher & Action Buttons */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center p-1 bg-surface-subtle border border-border rounded-xl">
            <Link
              href={`/list/finance/payslips/${payslip.id}?view=teacher`}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeView === "teacher"
                  ? "bg-white text-gray-900 shadow-xs border border-border"
                  : "text-muted hover:text-gray-900"
              }`}
            >
              {locale === "ar" ? "قسيمة الأستاذ" : "Fiche Enseignant"}
            </Link>
            <Link
              href={`/list/finance/payslips/${payslip.id}?view=school`}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeView === "school"
                  ? "bg-white text-emerald-800 shadow-xs border border-border"
                  : "text-muted hover:text-emerald-800"
              }`}
            >
              {locale === "ar" ? "حصة المؤسسة" : "Part de l'École"}
            </Link>
          </div>

          {activeView === "school" ? (
            <PrintSchoolShareButton
              data={schoolSharePrintData}
              label={locale === "ar" ? "طباعة حصة المؤسسة" : "Imprimer la part école"}
            />
          ) : (
            <PrintPayslipButton
              data={printData}
              label={locale === "ar" ? "طباعة قسيمة الراتب" : "Imprimer la fiche de paie"}
            />
          )}
        </div>
      </Card>

      {/* Document Preview */}
      <Card className="p-6 sm:p-10 max-w-4xl mx-auto w-full shadow-lg border-border/80">
        {activeView === "school" ? (
          <SchoolShareTicket data={schoolSharePrintData} locale={locale} />
        ) : (
          <PayslipTicket data={printData} />
        )}
      </Card>
    </div>
  );
}

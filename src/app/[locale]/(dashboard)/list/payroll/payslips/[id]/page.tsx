import BackButton from "@/components/BackButton";
import prisma from "@/lib/prisma";
import { notFound } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { PayslipTicket, PayslipPrintData } from "@/components/printable/PayslipTicket";
import PrintPayslipButton from "@/components/PrintPayslipButton";
import Link from "next/link";

import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { getLocale } from "next-intl/server";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PayslipDetailPage(props: PageProps) {
  const session = await getAuthSession();
  const locale = await getLocale();

  if (!session.can("view", "payroll")) {
    return (
      <Card className="p-8 text-center max-w-md mx-auto my-8">
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
    sessionsCount: payslip.sessionsCount || 0,
    grossAmount: Number(payslip.grossAmount),
    advances: Number(payslip.advances),
    photocopyDeductions: Number(payslip.photocopyDeductions),
    netAmount: Number(payslip.netAmount),
    branchLines: payslip.PayslipBranchLine.map((bl) => ({
      branchId: bl.branchId,
      branchName: bl.Branch.name,
      sessionsCount: bl.sessionsCount,
      amount: Number(bl.amount),
    })),
    photocopyDetails: photocopyCharges.map((pc) => ({
      branchName: pc.Branch.name,
      pages: pc.pages,
      costAmount: Number(pc.costAmount),
      date: pc.date,
    })),
  };

  return (
    <div className="bg-surface-muted min-h-screen p-4 sm:p-6 flex flex-col gap-6">
      {/* Top Header Actions */}
      <Card className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 p-4">
        <div className="flex items-center gap-3">
          <Link
            href="/list/finance?section=payroll&tab=payslips"
            className="flex items-center gap-1.5 text-xs font-bold text-gray-700 hover:text-primary bg-surface-subtle border border-border px-3 py-2 rounded-lg transition-colors"
          >
            {locale === "ar" ? "← العودة لقائمة الرواتب والمالية" : "← Retour aux finances & paie"}
          </Link>
          <div className="flex items-center gap-2">
            <span className="text-section-title font-bold text-gray-900">
              {locale === "ar" ? `معاينة قسيمة الراتب #${payslip.id}` : `Aperçu de la fiche de paie #${payslip.id}`}
            </span>
            {teacher?.name && (
              <Badge variant="neutral" size="sm">
                {teacher.name}
              </Badge>
            )}
          </div>
        </div>

        <PrintPayslipButton
          data={printData}
          label={locale === "ar" ? "طباعة قسيمة الراتب الموحدة" : "Imprimer la fiche de paie consolidée"}
        />
      </Card>

      {/* Payslip Document Preview */}
      <Card className="p-6 sm:p-10 max-w-4xl mx-auto w-full shadow-lg">
        <PayslipTicket data={printData} />
      </Card>
    </div>
  );
}

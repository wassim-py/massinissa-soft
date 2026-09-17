import prisma from "@/lib/prisma";
import { notFound } from "next/navigation";
import { getAuthRole } from "@/lib/auth";
import Image from "next/image";
import WorkshopRoster from "@/components/WorkshopRoster";
import FormContainer from "@/components/FormContainer";
import WorkshopSchedule from "@/components/WorkshopSchedule";
import BackButton from "@/components/BackButton";
import ExportButton from "@/components/ExportButton";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import Link from "next/link";
import { CalendarCheck } from "lucide-react";
import { getTranslations, getLocale } from "next-intl/server";

const WorkshopDetailsPage = async (props: { params: Promise<{ id: string }> }) => {
    const params = await props.params;
    const role = await getAuthRole();
    const t = await getTranslations("workshops");
    const locale = await getLocale();

    const workshopId = parseInt(params.id, 10);
    if (isNaN(workshopId)) {
        notFound();
    }

    let workshop: any = null;

    try {
      const rawWs = await prisma.$queryRaw<any[]>`
        SELECT w.*, b.name as "branchName"
        FROM "Workshop" w
        LEFT JOIN "Branch" b ON b.id = w."branchId"
        WHERE w.id = ${workshopId} LIMIT 1
      `;
      if (rawWs.length > 0) {
        const w = rawWs[0];
        const rawSessions = await prisma.$queryRaw<any[]>`
          SELECT ws.*, 
            (SELECT json_agg(wa.*) FROM "WorkshopAttendance" wa WHERE wa."sessionId" = ws.id) as "attendances"
          FROM "WorkshopSession" ws
          WHERE ws."workshopId" = ${workshopId}
          ORDER BY ws."startsAt" ASC
        `;
        const rawParticipants = await prisma.$queryRaw<any[]>`
          SELECT wp.*, s.name, s.phone
          FROM "WorkshopParticipant" wp
          LEFT JOIN "Student" s ON s.id = wp."studentId"
          WHERE wp."workshopId" = ${workshopId}
          ORDER BY s.name ASC
        `;

        // Fetch real vouchers issued for this workshop
        const workshopVouchers = await prisma.voucher.findMany({
          where: {
            workshopId: workshopId,
            paymentType: "WORKSHOP",
          },
          include: {
            refunds: true,
            series: {
              include: {
                issuingBranch: true,
                targetBranch: true,
              },
            },
          },
          orderBy: { issuedAt: "desc" },
        });

        // Group vouchers by studentId
        const vouchersByStudent = new Map<string, typeof workshopVouchers>();
        for (const v of workshopVouchers) {
          const list = vouchersByStudent.get(v.studentId) || [];
          list.push(v);
          vouchersByStudent.set(v.studentId, list);
        }

        workshop = {
          id: w.id,
          title: w.title,
          description: w.description || "",
          teacherName: w.guestTeacher || t("unspecified"),
          price: Number(w.totalPrice || 0),
          branchId: w.branchId,
          branch: { id: w.branchId, name: w.branchName },
          sessions: rawSessions.map((s) => ({
            id: s.id,
            startTime: s.startsAt,
            endTime: s.endsAt,
            attendances: s.attendances || [],
          })),
          participants: rawParticipants.map((p) => {
            const studentVouchers = vouchersByStudent.get(p.studentId) || [];
            const voucherPayments = studentVouchers.map((v) => ({
              id: v.id,
              number: v.number,
              amount: Number(v.amount),
              date: v.issuedAt,
              isVoided: v.isVoided,
              issuingBranchId: v.issuingBranchId,
              targetBranchId: v.targetBranchId,
              paymentType: "WORKSHOP",
              series: v.series ? {
                id: v.series.id,
                issuingBranch: v.series.issuingBranch ? { name: v.series.issuingBranch.name } : null,
                targetBranch: v.series.targetBranch ? { name: v.series.targetBranch.name } : null,
              } : null,
              refunds: v.refunds.map((r) => ({ id: r.id, amount: Number(r.amount) })),
            }));

            // If no vouchers recorded yet but legacy totalPaid exists, provide fallback
            const payments = voucherPayments.length > 0 
              ? voucherPayments 
              : (Number(p.totalPaid || 0) > 0 ? [{
                  id: 1,
                  number: 1,
                  amount: Number(p.totalPaid || 0),
                  date: new Date(),
                  refunds: p.totalRefunded ? [{ id: 1, amount: Number(p.totalRefunded) }] : [],
                }] : []);

            return {
              id: p.id,
              studentId: p.studentId,
              name: p.name || `${t("student")} #${p.studentId}`,
              phone: p.phone || "-",
              gender: p.gender || "MALE",
              chairNumber: p.chairNumber ?? null,
              totalPaid: Number(p.totalPaid || 0),
              totalRefunded: Number(p.totalRefunded || 0),
              status: p.status,
              payments,
              attendances: [],
            };
          }),
        };
      }
    } catch (err) {
      console.error("Error fetching workshop details:", err);
    }

    if (!workshop) {
      notFound();
    }

    return (
      <div className="p-4 md:p-6 space-y-6">
        <BackButton />
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
              <h1 className="text-page-title font-bold text-gray-900">{workshop.title}</h1>
              <p className="text-gray-500 mt-1 text-sm">
                  {t("taughtBy")} <span className="font-semibold text-gray-800">{workshop.teacherName}</span>
              </p>
          </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Link
            href={`/list/attendance/workshop/${workshop.id}`}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary-dark transition-colors shadow-xs"
          >
            <CalendarCheck className="w-4 h-4" />
            <span>{locale === "ar" ? "سجل الحضور والغياب" : "Consulter les présences"}</span>
          </Link>
          <ExportButton
            type="workshop_details"
            options={{ workshopId: workshop.id }}
          />
        </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
              <WorkshopRoster workshop={workshop as any} participants={workshop.participants as any} />
          </div>

          <div className="space-y-6">
              <Card className="p-6 space-y-4">
                  <h3 className="text-section-title font-bold text-gray-900">{t("details")}</h3>
                  <div className="space-y-3 text-sm">
                      <div className="flex justify-between items-center">
                          <span className="text-gray-500">{t("price")}:</span>
                          <Badge variant="primary" size="sm">
                            {workshop.price.toLocaleString(locale === "ar" ? "ar-DZ" : "fr-DZ")} DZD
                          </Badge>
                      </div>
                      <div className="pt-2 border-t border-border">
                          <p className="text-gray-500 mb-1 text-xs font-semibold">{t("description")}:</p>
                          <p className="text-gray-700 text-sm leading-relaxed">{workshop.description || t("noDescription")}</p>
                      </div>
                  </div>
              </Card>
              <WorkshopSchedule 
                  workshop={workshop}
                  sessions={workshop.sessions}
                  participants={workshop.participants}
              />
          </div>
        </div>
      </div>
    );
};

export default WorkshopDetailsPage;

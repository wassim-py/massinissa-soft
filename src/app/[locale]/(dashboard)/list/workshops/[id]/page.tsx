import prisma from "@/lib/prisma";
import { notFound } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { canUserAccessBranch } from "@/lib/settings";
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
    const session = await getAuthSession();
    const t = await getTranslations("workshops");
    const locale = await getLocale();

    const workshopId = parseInt(params.id, 10);
    if (isNaN(workshopId)) {
        notFound();
    }

    let workshop: any = null;
    const isAdminOrOwner = session.isOwner || session.isOwnerOrAdmin;

    try {
      const ws = await prisma.workshop.findUnique({
        where: { id: workshopId },
        include: {
          Branch: { select: { id: true, name: true } },
          teacher: { select: { id: true, name: true } },
          sessions: {
            include: isAdminOrOwner ? { attendances: true } : undefined,
            orderBy: { startsAt: "asc" },
          },
          ...(isAdminOrOwner
            ? {
                participants: {
                  include: {
                    Student: { select: { id: true, name: true, phone: true } },
                  },
                  orderBy: [{ chairNumber: "asc" }, { id: "asc" }],
                },
              }
            : {}),
        },
      });

      if (ws) {
        const workshopVouchers = isAdminOrOwner
          ? await prisma.voucher.findMany({
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
            })
          : [];

        const vouchersByStudent = new Map<string, typeof workshopVouchers>();
        for (const v of workshopVouchers) {
          const list = vouchersByStudent.get(v.studentId) || [];
          list.push(v);
          vouchersByStudent.set(v.studentId, list);
        }

        workshop = {
          id: ws.id,
          title: ws.title,
          description: ws.description || "",
          teacherId: ws.teacherId || "",
          teacherName: ws.teacher?.name || ws.guestTeacher || "",
          displayTeacherName: ws.teacher?.name || ws.guestTeacher || t("unspecified"),
          price: Number(ws.totalPrice || 0),
          branchId: ws.branchId,
          branch: ws.Branch ? { id: ws.Branch.id, name: ws.Branch.name } : { id: ws.branchId, name: undefined },
          sessions: ws.sessions.map((s: any) => ({
            id: s.id,
            startTime: s.startsAt,
            endTime: s.endsAt,
            attendances: s.attendances || [],
          })),
          participants: isAdminOrOwner
            ? ((ws as any).participants || []).map((p: any) => {
                const studentVouchers = vouchersByStudent.get(p.studentId) || [];
                const voucherPayments = studentVouchers.map((v) => ({
                  id: v.id,
                  number: v.number,
                  amount: Number(v.amount),
                  date: v.issuedAt,
                  isVoided: v.isVoided,
                  isPartial: v.isPartial,
                  isRefund: v.isRefund,
                  status: v.status,
                  refundForVoucherId: v.refundForVoucherId,
                  remainingBalance:
                    v.remainingBalance !== null && v.remainingBalance !== undefined
                      ? Number(v.remainingBalance)
                      : undefined,
                  issuingBranchId: v.issuingBranchId,
                  targetBranchId: v.targetBranchId,
                  paymentType: v.paymentType || "WORKSHOP",
                  isFallback: false,
                  series: v.series
                    ? {
                        id: v.series.id,
                        issuingBranch: v.series.issuingBranch ? { name: v.series.issuingBranch.name } : null,
                        targetBranch: v.series.targetBranch ? { name: v.series.targetBranch.name } : null,
                      }
                    : null,
                  refunds: v.refunds.map((r) => ({ id: r.id, amount: Number(r.amount) })),
                }));

                // If no vouchers recorded yet but legacy totalPaid exists, provide fallback flagged with isFallback: true
                const payments =
                  voucherPayments.length > 0
                    ? voucherPayments
                    : Number(p.totalPaid || 0) > 0
                    ? [
                        {
                          id: p.id,
                          number: p.id,
                          amount: Number(p.totalPaid || 0),
                          date: p.createdAt || new Date(),
                          isFallback: true,
                          refunds: Number(p.totalRefunded || 0) > 0 ? [{ id: p.id, amount: Number(p.totalRefunded) }] : [],
                        },
                      ]
                    : [];

                return {
                  id: p.id,
                  studentId: p.studentId,
                  name: p.Student?.name || `${t("student")} #${p.studentId}`,
                  phone: p.Student?.phone || "-",
                  gender: p.gender || "MALE",
                  chairNumber: p.chairNumber ?? null,
                  totalPaid: Number(p.totalPaid || 0),
                  totalRefunded: Number(p.totalRefunded || 0),
                  status: p.status,
                  payments,
                  attendances: [],
                };
              })
            : [],
        };
      }
    } catch (err) {
      console.error("Error fetching workshop details:", err);
    }

    if (!workshop) {
      notFound();
    }

    const canManageBranch =
      session.isOwner ||
      (isAdminOrOwner && canUserAccessBranch(session.rawRole, session.branchIds, workshop.branchId));

    return (
      <div className="p-4 md:p-6 space-y-6">
        <BackButton />
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-page-title font-bold text-gray-900">{workshop.title}</h1>
                {workshop.branch?.name && (
                  <Badge variant="secondary" size="sm">
                    {workshop.branch.name}
                  </Badge>
                )}
              </div>
              <p className="text-gray-500 mt-1 text-sm">
                  {t("taughtBy")} <span className="font-semibold text-gray-800">{workshop.displayTeacherName}</span>
              </p>
          </div>
          {isAdminOrOwner && (
            <div className="flex items-center gap-3 flex-wrap">
              {canManageBranch && (
                <>
                  <FormContainer
                    table="workshop"
                    type="update"
                    id={workshop.id}
                    data={workshop}
                  />
                  <Link
                    href={`/list/attendance/workshop/${workshop.id}`}
                    className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary-dark transition-colors shadow-xs"
                  >
                    <CalendarCheck className="w-4 h-4" />
                    <span>{locale === "ar" ? "سجل الحضور والغياب" : "Consulter les présences"}</span>
                  </Link>
                </>
              )}
              {session.isOwner && (
                <ExportButton
                  type="workshop_details"
                  options={{ workshopId: workshop.id }}
                />
              )}
            </div>
          )}
        </div>

        <div className={`grid grid-cols-1 ${isAdminOrOwner ? "lg:grid-cols-3" : "lg:grid-cols-2"} gap-6`}>
          {isAdminOrOwner && (
            <div className="lg:col-span-2">
              <WorkshopRoster
                workshop={workshop as any}
                participants={workshop.participants as any}
                canManageBranch={canManageBranch}
                canRecordPayment={isAdminOrOwner}
              />
            </div>
          )}

          <div className={`space-y-6 ${!isAdminOrOwner ? "lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6 space-y-0" : ""}`}>
              <Card className="p-6 space-y-4">
                  <h3 className="text-section-title font-bold text-gray-900">{t("details")}</h3>
                  <div className="space-y-3 text-sm">
                      {workshop.branch?.name && (
                        <div className="flex justify-between items-center">
                          <span className="text-gray-500">{t("branch")}:</span>
                          <Badge variant="secondary" size="sm">
                            {workshop.branch.name}
                          </Badge>
                        </div>
                      )}
                      <div className="flex justify-between items-center">
                          <span className="text-gray-500">{t("price")}:</span>
                          <Badge variant="primary" size="sm">
                            {workshop.price.toLocaleString(locale === "ar" ? "ar-DZ" : "fr-DZ")} DZD
                          </Badge>
                      </div>
                      {workshop.description && (
                        <div className="pt-2 border-t border-border">
                            <p className="text-gray-500 mb-1 text-xs font-semibold">{t("description")}:</p>
                            <p className="text-gray-700 text-sm leading-relaxed">{workshop.description}</p>
                        </div>
                      )}
                  </div>
              </Card>
              <WorkshopSchedule 
                  workshop={workshop}
                  sessions={workshop.sessions}
                  participants={workshop.participants}
                  canTakeAttendance={canManageBranch}
              />
          </div>
        </div>
      </div>
    );
};

export default WorkshopDetailsPage;

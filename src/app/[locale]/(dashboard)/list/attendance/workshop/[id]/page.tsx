import prisma from "@/lib/prisma";
import { notFound } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { canUserAccessBranch } from "@/lib/settings";
import BackButton from "@/components/BackButton";
import ExportButton from "@/components/ExportButton";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { getTranslations, getLocale } from "next-intl/server";
import WorkshopAttendanceGrid from "@/components/workshops/WorkshopAttendanceGrid";
import { Sparkles, Users, Calendar, Award, ArrowLeft, ArrowRight } from "lucide-react";

export default async function WorkshopAttendancePage(props: {
  params: Promise<{ id: string }>;
}) {
  const params = await props.params;
  const session = await getAuthSession();
  const t = await getTranslations("workshops");
  const tAtt = await getTranslations("attendance");
  const locale = await getLocale();

  const workshopId = parseInt(params.id, 10);
  if (isNaN(workshopId)) {
    notFound();
  }

  // 1. Fetch workshop basic data for access verification
  const workshopHeader = await prisma.workshop.findUnique({
    where: { id: workshopId },
    select: { id: true, title: true, branchId: true },
  });

  if (!workshopHeader) {
    notFound();
  }

  // 2. Branch access check outside try/catch to avoid eslint error-boundary warning
  if (!session.isOwner && !canUserAccessBranch(session.rawRole, session.branchIds, workshopHeader.branchId)) {
    return (
      <Card className="p-8 text-center max-w-md mx-auto my-8 border-border shadow-xs font-sans">
        <div className="flex flex-col items-center gap-3">
          <Badge variant="danger" size="md" withDot>
            {locale === "ar" ? "وصول غير مصرح" : "Accès non autorisé"}
          </Badge>
          <p className="text-table-body text-gray-800 font-medium">
            {locale === "ar"
              ? "لا يمكنك الاطلاع على سجل حضور ورشة تابعة لفرع آخر."
              : "Vous ne pouvez pas consulter le registre de présence d'un atelier appartenant à un autre siège."}
          </p>
          <div className="mt-2">
            <BackButton />
          </div>
        </div>
      </Card>
    );
  }

  // 3. Fetch full workshop data with sessions, attendances, and participants
  const workshop = await prisma.workshop.findUnique({
    where: { id: workshopId },
    include: {
      Branch: { select: { id: true, name: true } },
      sessions: {
        include: {
          attendances: true,
        },
        orderBy: { startsAt: "asc" },
      },
      participants: {
        include: {
          Student: { select: { id: true, name: true, phone: true } },
        },
        orderBy: [
          { chairNumber: "asc" },
          { id: "asc" },
        ],
      },
    },
  });

  if (!workshop) {
    notFound();
  }

  // Assign fallback chair numbers if any participant doesn't have one
  let boyCounter = 0;
  let girlCounter = 0;
  const processedParticipants = [];
  for (const p of workshop.participants) {
    const isGirl = p.gender === "FEMALE";
    let num = p.chairNumber;
    if (!num) {
      if (isGirl) {
        girlCounter += 1;
        num = girlCounter;
      } else {
        boyCounter += 1;
        num = boyCounter;
      }
    }
    processedParticipants.push({
      id: p.id,
      studentId: p.studentId,
      chairNumber: num,
      gender: p.gender,
      name: p.Student?.name || `${t("student")} #${p.id}`,
      phone: p.Student?.phone || null,
    });
  }

  // Sort by chair number
  processedParticipants.sort((a, b) => {
    const chairA = a.chairNumber ?? 0;
    const chairB = b.chairNumber ?? 0;
    if (chairA !== chairB) return chairA - chairB;
    return a.gender === "MALE" ? -1 : 1;
  });

  const totalParticipants = processedParticipants.length;
  const boysCount = processedParticipants.filter((p) => p.gender === "MALE").length;
  const girlsCount = processedParticipants.filter((p) => p.gender === "FEMALE").length;
  const totalSessions = workshop.sessions.length;

  // Calculate overall attendance rate
  let totalPresences = 0;
  let totalPossible = totalParticipants * totalSessions;
  for (const s of workshop.sessions) {
    for (const a of s.attendances) {
      if (a.status === "PRESENT") totalPresences++;
    }
  }

  const globalAttendanceRate = totalPossible > 0 ? Math.round((totalPresences / totalPossible) * 100) : 0;

  const canManage = session.isOwnerOrAdmin || session.role === "admin";

  return (
    <Card className="flex-1 w-full border-border/80 shadow-xs font-sans">
      <CardContent className="p-4 sm:p-5 md:p-6 space-y-6">
        <div className="flex items-center justify-between gap-4">
          <BackButton />
          <Link
            href={`/list/workshops/${workshop.id}`}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline"
          >
            <span>{tAtt("backToWorkshop")}</span>
            {locale === "ar" ? <ArrowLeft className="w-3.5 h-3.5" /> : <ArrowRight className="w-3.5 h-3.5" />}
          </Link>
        </div>

        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-border/70 pb-4">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-page-title font-bold text-gray-900">
                {tAtt("workshopAttendanceTitle")}: {workshop.title}
              </h1>
              <Badge variant="warning" size="sm">
                {tAtt("workshopBadge")}
              </Badge>
              {workshop.Branch && (
                <Badge variant="neutral" size="sm">
                  {workshop.Branch.name}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted mt-1">
              {t("taughtBy")}{" "}
              <span className="font-semibold text-gray-800">
                {workshop.guestTeacher || t("unspecified")}
              </span>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <ExportButton
              type="workshop_attendance"
              options={{ workshopId: workshop.id }}
            />
          </div>
        </div>

        {/* Summary Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="p-4 border-border/70 bg-surface-subtle/50">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted font-medium">{t("roster")}</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{totalParticipants}</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                <Users className="w-5 h-5" />
              </div>
            </div>
            <div className="flex items-center gap-2 mt-2 text-[11px] text-muted">
              <span>{boysCount} {t("boy")}</span>
              <span>•</span>
              <span>{girlsCount} {t("girl")}</span>
            </div>
          </Card>

          <Card className="p-4 border-border/70 bg-surface-subtle/50">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted font-medium">{t("scheduleTitle")}</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{totalSessions}</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-secondary/10 text-secondary flex items-center justify-center">
                <Calendar className="w-5 h-5" />
              </div>
            </div>
            <p className="text-[11px] text-muted mt-2">
              {locale === "ar" ? "حصص مبرمجة في الدورة" : "Séances planifiées"}
            </p>
          </Card>

          <Card className="p-4 border-border/70 bg-surface-subtle/50">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted font-medium">{tAtt("attendanceRate")}</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{globalAttendanceRate}%</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-success/10 text-success flex items-center justify-center">
                <Award className="w-5 h-5" />
              </div>
            </div>
            <p className="text-[11px] text-muted mt-2">
              {totalPresences} / {totalPossible} {locale === "ar" ? "حضور مسجل" : "présences enregistrées"}
            </p>
          </Card>

          <Card className="p-4 border-border/70 bg-surface-subtle/50 flex flex-col justify-between">
            <div>
              <p className="text-xs text-muted font-medium">{t("price")}</p>
              <p className="text-xl font-bold text-gray-900 mt-1 font-mono">
                {Number(workshop.totalPrice || 0).toLocaleString(locale === "ar" ? "ar-DZ" : "fr-DZ")} DZD
              </p>
            </div>
            <div className="mt-2">
              <Link
                href={`/list/workshops/${workshop.id}`}
                className="text-xs font-bold text-primary hover:underline inline-flex items-center gap-1"
              >
                <span>{locale === "ar" ? "إدارة المشاركين والمدفوعات ←" : "Gérer les participants →"}</span>
              </Link>
            </div>
          </Card>
        </div>

        {/* The Attendance Sheet Grid */}
        <WorkshopAttendanceGrid
          workshop={{
            id: workshop.id,
            title: workshop.title,
            branchId: workshop.branchId,
          }}
          sessions={workshop.sessions.map((s) => ({
            id: s.id,
            startsAt: s.startsAt,
            endsAt: s.endsAt,
            attendances: s.attendances.map((a) => ({
              id: a.id,
              sessionId: a.sessionId,
              studentId: a.studentId,
              status: a.status,
            })),
          }))}
          participants={processedParticipants}
          canManageAttendance={canManage}
        />
      </CardContent>
    </Card>
  );
}

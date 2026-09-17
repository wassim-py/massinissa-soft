import prisma from "@/lib/prisma";
import { Link } from "@/i18n/navigation";
import { getTranslations, getLocale } from "next-intl/server";
import { getActiveBranchId, getAuthRole, getAuthSession } from "@/lib/auth";
import { Badge } from "@/components/ui/Badge";
import FormContainer from "@/components/FormContainer";
import DashboardAnnouncementItem from "./announcements/DashboardAnnouncementItem";

interface AnnouncementsProps {
  branchId?: number;
}

const Announcements = async ({ branchId }: AnnouncementsProps = {}) => {
  const session = await getAuthSession().catch(() => null);
  const isOwner = session?.isOwner ?? false;
  const role = session?.role ?? (await getAuthRole().catch(() => null));
  const userBranchIds = session?.branchIds ?? [];
  const activeBranchId = branchId ?? (await getActiveBranchId().catch(() => null));

  let data: Array<{
    id: number;
    title: string;
    description: string;
    date: Date;
    isPinned: boolean;
    authorBranchId: number | null;
    authorBranchName: string | null;
    branchId: number | null;
    targetBranchName: string | null;
    expiresAt: Date | null;
    isNew: boolean;
  }> = [];

  try {
    if (isOwner) {
      data = await prisma.$queryRaw<
        Array<{
          id: number;
          title: string;
          description: string;
          date: Date;
          isPinned: boolean;
          authorBranchId: number | null;
          authorBranchName: string | null;
          branchId: number | null;
          targetBranchName: string | null;
          expiresAt: Date | null;
          isNew: boolean;
        }>
      >`
        SELECT a.id, a.title, a.description, a."createdAt" as date, a.pinned as "isPinned",
               a."authorBranchId", ab.name as "authorBranchName",
               a."branchId", tb.name as "targetBranchName",
               a."expiresAt",
               (a."createdAt" > NOW() - INTERVAL '24 HOURS') as "isNew"
        FROM "Announcement" a
        LEFT JOIN "Branch" ab ON ab.id = a."authorBranchId"
        LEFT JOIN "Branch" tb ON tb.id = a."branchId"
        WHERE (a."expiresAt" IS NULL OR a."expiresAt" > NOW())
        ORDER BY a.pinned DESC, a."createdAt" DESC
        LIMIT 3
      `.catch(() => []);
    } else if (activeBranchId) {
      data = await prisma.$queryRaw<
        Array<{
          id: number;
          title: string;
          description: string;
          date: Date;
          isPinned: boolean;
          authorBranchId: number | null;
          authorBranchName: string | null;
          branchId: number | null;
          targetBranchName: string | null;
          expiresAt: Date | null;
          isNew: boolean;
        }>
      >`
        SELECT a.id, a.title, a.description, a."createdAt" as date, a.pinned as "isPinned",
               a."authorBranchId", ab.name as "authorBranchName",
               a."branchId", tb.name as "targetBranchName",
               a."expiresAt",
               (a."createdAt" > NOW() - INTERVAL '24 HOURS') as "isNew"
        FROM "Announcement" a
        LEFT JOIN "Branch" ab ON ab.id = a."authorBranchId"
        LEFT JOIN "Branch" tb ON tb.id = a."branchId"
        WHERE (a."branchId" = ${activeBranchId} OR a."branchId" IS NULL OR a."authorBranchId" = ${activeBranchId})
          AND (a."expiresAt" IS NULL OR a."expiresAt" > NOW())
        ORDER BY a.pinned DESC, a."createdAt" DESC
        LIMIT 3
      `.catch(() => []);
    } else {
      data = await prisma.$queryRaw<
        Array<{
          id: number;
          title: string;
          description: string;
          date: Date;
          isPinned: boolean;
          authorBranchId: number | null;
          authorBranchName: string | null;
          branchId: number | null;
          targetBranchName: string | null;
          expiresAt: Date | null;
          isNew: boolean;
        }>
      >`
        SELECT a.id, a.title, a.description, a."createdAt" as date, a.pinned as "isPinned",
               a."authorBranchId", ab.name as "authorBranchName",
               a."branchId", tb.name as "targetBranchName",
               a."expiresAt",
               (a."createdAt" > NOW() - INTERVAL '24 HOURS') as "isNew"
        FROM "Announcement" a
        LEFT JOIN "Branch" ab ON ab.id = a."authorBranchId"
        LEFT JOIN "Branch" tb ON tb.id = a."branchId"
        WHERE (a."expiresAt" IS NULL OR a."expiresAt" > NOW())
        ORDER BY a.pinned DESC, a."createdAt" DESC
        LIMIT 3
      `.catch(() => []);
    }
  } catch {
    data = [];
  }

  const t = await getTranslations("dashboard.announcements");
  const locale = await getLocale();
  const dateLocale = locale === "ar" ? "ar-DZ-u-nu-latn" : "fr-FR";

  const bgColors = [
    "bg-wsmSkyLight",
    "bg-wsmPurpleLight",
    "bg-wsmYellowLight",
  ];

  return (
    <div className="bg-white p-4 rounded-xl border border-border shadow-sm text-gray-800">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-800">{t("title")}</h1>
        <Link href="/list/announcements">
          <span className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
            {t("viewAll")}
          </span>
        </Link>
      </div>
      <div className="flex flex-col gap-4 mt-4">
        {data.length === 0 && (
          <p className="text-sm text-gray-500 text-center py-4">
            {t("noAnnouncements")}
          </p>
        )}
        {data.map((item, index) => {
          const bgColor = bgColors[index % bgColors.length];
          const authorLabel = item.authorBranchName
            ? t("authorBranch", { branch: item.authorBranchName })
            : t("authorGeneral");
          const targetLabel = item.targetBranchName
            ? t("targetBranchBadge", { branch: item.targetBranchName })
            : t("targetAllBadge");

          const canModify =
            role === "admin" &&
            (isOwner ||
              (item.authorBranchId &&
                userBranchIds.includes(item.authorBranchId)));

          const formattedDate = new Intl.DateTimeFormat(dateLocale, {
            day: "numeric",
            month: "short",
            year: "numeric",
          }).format(item.date);

          const formattedExpiry = item.expiresAt
            ? new Intl.DateTimeFormat(dateLocale, {
                day: "numeric",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              }).format(new Date(item.expiresAt))
            : null;

          const expiresAtBadgeLabel = formattedExpiry
            ? t("expiresAtBadge", { date: formattedExpiry })
            : null;

          const actions = canModify ? (
            <div className="flex items-center gap-1">
              <FormContainer
                table="announcement"
                type="update"
                data={{
                  id: item.id,
                  title: item.title,
                  description: item.description,
                  isPinned: item.isPinned,
                  branchId: item.branchId,
                  expiresAt: item.expiresAt,
                }}
              />
              <FormContainer
                table="announcement"
                type="delete"
                id={item.id}
              />
            </div>
          ) : null;

          return (
            <DashboardAnnouncementItem
              key={item.id}
              item={item}
              bgColor={bgColor}
              authorLabel={authorLabel}
              targetLabel={targetLabel}
              newBadgeLabel={t("newBadge")}
              formattedDate={formattedDate}
              formattedExpiry={formattedExpiry}
              expiresAtBadgeLabel={expiresAtBadgeLabel}
              publishedAtTitle={t("publishedAt", { date: formattedDate })}
              actions={actions}
            />
          );
        })}
      </div>
    </div>
  );
};

export default Announcements;

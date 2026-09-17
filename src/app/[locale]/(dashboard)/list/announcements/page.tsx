import FormContainer from "@/components/FormContainer";
import prisma from "@/lib/prisma";
import { getAuthRole, getAuthSession, getActiveBranchId } from "@/lib/auth";
import Image from "next/image";
import PageHeader from "@/components/PageHeader";
import Pagination from "@/components/Pagination";
import { ITEM_PER_PAGE } from "@/lib/settings";
import { Card, CardContent } from "@/components/ui/Card";
import { getTranslations, getLocale } from "next-intl/server";
import MarkAnnouncementsRead from "@/components/announcements/MarkAnnouncementsRead";
import AnnouncementCardItem from "@/components/announcements/AnnouncementCardItem";

const AnnouncementListPage = async (
  props: {
    searchParams: Promise<{ search?: string; page?: string }>;
  }
) => {
  const searchParams = await props.searchParams;
  const session = await getAuthSession();
  const activeBranchId = await getActiveBranchId();
  const role = await getAuthRole();
  const t = await getTranslations("announcements");
  const locale = await getLocale();
  const { search, page } = searchParams;
  const pageNum = page ? parseInt(page, 10) : 1;
  const p = isNaN(pageNum) || pageNum < 1 ? 1 : pageNum;

  let pinnedAnnouncements: any[] = [];
  let regularAnnouncements: any[] = [];
  let totalCount = 0;

  try {
    let rawAnnouncements: any[] = [];

    // Branch scoping: per §1.7 & §7.10:
    // Owner sees all announcements.
    // Branch admin/user sees announcements targeted to their branch, whole school, OR authored by their branch.
    if (session.isOwner) {
      if (search) {
        const countRes = await prisma.$queryRaw<Array<{ count: string | number | bigint }>>`
          SELECT count(*) FROM "Announcement" a
          WHERE (a."expiresAt" IS NULL OR a."expiresAt" > NOW())
            AND (a.title ILIKE ${'%' + search + '%'} OR a.description ILIKE ${'%' + search + '%'})
        `;
        totalCount = Number(countRes[0]?.count || 0);

        rawAnnouncements = await prisma.$queryRaw<any[]>`
          SELECT a.id, a.title, a.description, a."createdAt", a."expiresAt", a."branchId", a."authorBranchId", a.pinned,
                 ab.name as "authorBranchName", tb.name as "targetBranchName",
                 (a."createdAt" > NOW() - INTERVAL '24 HOURS') as "isNew"
          FROM "Announcement" a
          LEFT JOIN "Branch" ab ON ab.id = a."authorBranchId"
          LEFT JOIN "Branch" tb ON tb.id = a."branchId"
          WHERE (a."expiresAt" IS NULL OR a."expiresAt" > NOW())
            AND (a.title ILIKE ${'%' + search + '%'} OR a.description ILIKE ${'%' + search + '%'})
          ORDER BY a.pinned DESC, a."createdAt" DESC
          LIMIT ${ITEM_PER_PAGE} OFFSET ${ITEM_PER_PAGE * (p - 1)}
        `;
      } else {
        const countRes = await prisma.$queryRaw<Array<{ count: string | number | bigint }>>`
          SELECT count(*) FROM "Announcement" a
          WHERE (a."expiresAt" IS NULL OR a."expiresAt" > NOW())
        `;
        totalCount = Number(countRes[0]?.count || 0);

        rawAnnouncements = await prisma.$queryRaw<any[]>`
          SELECT a.id, a.title, a.description, a."createdAt", a."expiresAt", a."branchId", a."authorBranchId", a.pinned,
                 ab.name as "authorBranchName", tb.name as "targetBranchName",
                 (a."createdAt" > NOW() - INTERVAL '24 HOURS') as "isNew"
          FROM "Announcement" a
          LEFT JOIN "Branch" ab ON ab.id = a."authorBranchId"
          LEFT JOIN "Branch" tb ON tb.id = a."branchId"
          WHERE (a."expiresAt" IS NULL OR a."expiresAt" > NOW())
          ORDER BY a.pinned DESC, a."createdAt" DESC
          LIMIT ${ITEM_PER_PAGE} OFFSET ${ITEM_PER_PAGE * (p - 1)}
        `;
      }
    } else {
      if (search) {
        const countRes = await prisma.$queryRaw<Array<{ count: string | number | bigint }>>`
          SELECT count(*) FROM "Announcement" a
          WHERE (a."expiresAt" IS NULL OR a."expiresAt" > NOW())
            AND (a."branchId" = ${activeBranchId} OR a."branchId" IS NULL OR a."authorBranchId" = ${activeBranchId})
            AND (a.title ILIKE ${'%' + search + '%'} OR a.description ILIKE ${'%' + search + '%'})
        `;
        totalCount = Number(countRes[0]?.count || 0);

        rawAnnouncements = await prisma.$queryRaw<any[]>`
          SELECT a.id, a.title, a.description, a."createdAt", a."expiresAt", a."branchId", a."authorBranchId", a.pinned,
                 ab.name as "authorBranchName", tb.name as "targetBranchName",
                 (a."createdAt" > NOW() - INTERVAL '24 HOURS') as "isNew"
          FROM "Announcement" a
          LEFT JOIN "Branch" ab ON ab.id = a."authorBranchId"
          LEFT JOIN "Branch" tb ON tb.id = a."branchId"
          WHERE (a."expiresAt" IS NULL OR a."expiresAt" > NOW())
            AND (a."branchId" = ${activeBranchId} OR a."branchId" IS NULL OR a."authorBranchId" = ${activeBranchId})
            AND (a.title ILIKE ${'%' + search + '%'} OR a.description ILIKE ${'%' + search + '%'})
          ORDER BY a.pinned DESC, a."createdAt" DESC
          LIMIT ${ITEM_PER_PAGE} OFFSET ${ITEM_PER_PAGE * (p - 1)}
        `;
      } else {
        const countRes = await prisma.$queryRaw<Array<{ count: string | number | bigint }>>`
          SELECT count(*) FROM "Announcement" a
          WHERE (a."expiresAt" IS NULL OR a."expiresAt" > NOW())
            AND (a."branchId" = ${activeBranchId} OR a."branchId" IS NULL OR a."authorBranchId" = ${activeBranchId})
        `;
        totalCount = Number(countRes[0]?.count || 0);

        rawAnnouncements = await prisma.$queryRaw<any[]>`
          SELECT a.id, a.title, a.description, a."createdAt", a."expiresAt", a."branchId", a."authorBranchId", a.pinned,
                 ab.name as "authorBranchName", tb.name as "targetBranchName",
                 (a."createdAt" > NOW() - INTERVAL '24 HOURS') as "isNew"
          FROM "Announcement" a
          LEFT JOIN "Branch" ab ON ab.id = a."authorBranchId"
          LEFT JOIN "Branch" tb ON tb.id = a."branchId"
          WHERE (a."expiresAt" IS NULL OR a."expiresAt" > NOW())
            AND (a."branchId" = ${activeBranchId} OR a."branchId" IS NULL OR a."authorBranchId" = ${activeBranchId})
          ORDER BY a.pinned DESC, a."createdAt" DESC
          LIMIT ${ITEM_PER_PAGE} OFFSET ${ITEM_PER_PAGE * (p - 1)}
        `;
      }
    }

    const formatted = rawAnnouncements.map((a) => ({
      id: a.id,
      title: a.title,
      description: a.description,
      date: a.createdAt || new Date(),
      expiresAt: a.expiresAt ? new Date(a.expiresAt) : null,
      branchId: a.branchId,
      authorBranchId: a.authorBranchId,
      authorBranchName: a.authorBranchName,
      targetBranchName: a.targetBranchName,
      isPinned: a.pinned || false,
      isNew: Boolean(a.isNew),
    }));

    pinnedAnnouncements = formatted.filter((a) => a.isPinned);
    regularAnnouncements = formatted.filter((a) => !a.isPinned);
  } catch (err) {
    console.error("Error fetching announcements:", err);
  }

  const totalAnnouncements =
    pinnedAnnouncements.length + regularAnnouncements.length;

  const dateLocale = locale === "ar" ? "ar-DZ-u-nu-latn" : "fr-FR";
  const renderAnnouncementCard = (announcement: any, isPinned = false) => {
    const authorLabel = announcement.authorBranchName
      ? t("authorBranch", { branch: announcement.authorBranchName })
      : t("authorGeneral");

    const targetLabel = announcement.targetBranchName
      ? t("targetBranchBadge", { branch: announcement.targetBranchName })
      : t("targetAllBadge");

    const formattedExpiry = announcement.expiresAt
      ? new Intl.DateTimeFormat(dateLocale, {
          day: "numeric",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }).format(new Date(announcement.expiresAt))
      : null;

    const formattedDate = new Intl.DateTimeFormat(dateLocale, {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(announcement.date));

    const expiresAtBadgeLabel = formattedExpiry
      ? t("expiresAtBadge", { date: formattedExpiry })
      : null;

    const canModify =
      role === "admin" &&
      (session.isOwner ||
        (announcement.authorBranchId &&
          session.branchIds.includes(announcement.authorBranchId)));

    const actions = canModify ? (
      <div className="flex items-center gap-2">
        <FormContainer
          table="announcement"
          type="update"
          data={announcement}
        />
        <FormContainer
          table="announcement"
          type="delete"
          id={announcement.id}
        />
      </div>
    ) : null;

    return (
      <AnnouncementCardItem
        key={announcement.id}
        announcement={announcement}
        isPinned={isPinned}
        authorLabel={authorLabel}
        targetLabel={targetLabel}
        formattedExpiry={formattedExpiry}
        expiresAtBadgeLabel={expiresAtBadgeLabel}
        publishedAtLabel={t("publishedAt", { date: formattedDate })}
        newBadgeLabel={t("newBadge")}
        actions={actions}
      />
    );
  };

  return (
    <Card className="flex-1 w-full border-border/80 shadow-xs">
      <CardContent className="p-4 sm:p-5 md:p-6">
        <MarkAnnouncementsRead />
        <PageHeader
          title={t("title")}
          searchPlaceholder={t("searchPlaceholder")}
          createAction={
            role === "admin" ? { table: "announcement", type: "create" } : null
          }
        />

        {totalAnnouncements === 0 ? (
          <div className="text-center py-16 px-4 border-2 border-dashed border-border rounded-xl mt-6">
            <Image
              src="/announcement.png"
              alt="No announcements"
              width={56}
              height={56}
              className="mx-auto opacity-40 mb-3"
            />
            <h2 className="text-card-title font-semibold text-gray-800">
              {t("noAnnouncements")}
            </h2>
            <p className="text-form-helper text-muted mt-1">
              {search
                ? t("searchNoMatch", { query: search })
                : t("noAnnouncementsDesc")}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mt-6">
            {pinnedAnnouncements.map((announcement) => renderAnnouncementCard(announcement, true))}
            {regularAnnouncements.map((announcement) => renderAnnouncementCard(announcement, false))}
          </div>
        )}

        <div className="mt-6 flex justify-center">
          <Pagination count={totalCount} />
        </div>
      </CardContent>
    </Card>
  );
};

export default AnnouncementListPage;

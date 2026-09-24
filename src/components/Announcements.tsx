import prisma from "@/lib/prisma";
import { getActiveBranchId, getAuthRole, getAuthSession } from "@/lib/auth";
import DashboardAnnouncementsLive from "./announcements/DashboardAnnouncementsLive";

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
      if (activeBranchId) {
        data = await prisma.$queryRaw<typeof data>`
          SELECT a.id, a.title, a.description, a."createdAt" as date, a.pinned as "isPinned",
                 a."authorBranchId", ab.name as "authorBranchName",
                 a."branchId", tb.name as "targetBranchName",
                 a."expiresAt",
                 (a."createdAt" > NOW() - INTERVAL '72 HOURS') as "isNew"
          FROM "Announcement" a
          LEFT JOIN "Branch" ab ON ab.id = a."authorBranchId"
          LEFT JOIN "Branch" tb ON tb.id = a."branchId"
          WHERE (a."expiresAt" IS NULL OR a."expiresAt" > NOW())
            AND (a."branchId" = ${activeBranchId} OR a."branchId" IS NULL OR a."authorBranchId" = ${activeBranchId})
          ORDER BY a.pinned DESC, a."createdAt" DESC
          LIMIT 3
        `.catch(() => []);
      } else {
        data = await prisma.$queryRaw<typeof data>`
          SELECT a.id, a.title, a.description, a."createdAt" as date, a.pinned as "isPinned",
                 a."authorBranchId", ab.name as "authorBranchName",
                 a."branchId", tb.name as "targetBranchName",
                 a."expiresAt",
                 (a."createdAt" > NOW() - INTERVAL '72 HOURS') as "isNew"
          FROM "Announcement" a
          LEFT JOIN "Branch" ab ON ab.id = a."authorBranchId"
          LEFT JOIN "Branch" tb ON tb.id = a."branchId"
          WHERE (a."expiresAt" IS NULL OR a."expiresAt" > NOW())
          ORDER BY a.pinned DESC, a."createdAt" DESC
          LIMIT 3
        `.catch(() => []);
      }
    } else if (activeBranchId) {
      data = await prisma.$queryRaw<typeof data>`
        SELECT a.id, a.title, a.description, a."createdAt" as date, a.pinned as "isPinned",
               a."authorBranchId", ab.name as "authorBranchName",
               a."branchId", tb.name as "targetBranchName",
               a."expiresAt",
               (a."createdAt" > NOW() - INTERVAL '72 HOURS') as "isNew"
        FROM "Announcement" a
        LEFT JOIN "Branch" ab ON ab.id = a."authorBranchId"
        LEFT JOIN "Branch" tb ON tb.id = a."branchId"
        WHERE (a."branchId" = ${activeBranchId} OR a."branchId" IS NULL OR a."authorBranchId" = ${activeBranchId})
          AND (a."expiresAt" IS NULL OR a."expiresAt" > NOW())
        ORDER BY a.pinned DESC, a."createdAt" DESC
        LIMIT 3
      `.catch(() => []);
    } else {
      data = await prisma.$queryRaw<typeof data>`
        SELECT a.id, a.title, a.description, a."createdAt" as date, a.pinned as "isPinned",
               a."authorBranchId", ab.name as "authorBranchName",
               a."branchId", tb.name as "targetBranchName",
               a."expiresAt",
               (a."createdAt" > NOW() - INTERVAL '72 HOURS') as "isNew"
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

  return (
    <DashboardAnnouncementsLive
      initialData={data}
      branchId={branchId}
      isOwner={isOwner}
      role={role}
      userBranchIds={userBranchIds}
      activeBranchId={activeBranchId}
    />
  );
};

export default Announcements;

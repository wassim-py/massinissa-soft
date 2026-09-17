import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthSession, getActiveBranchId } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await getAuthSession().catch(() => null);
    if (!session || !session.userId) {
      return NextResponse.json({ announcements: [], unreadCount: 0, latestId: 0 });
    }

    const { searchParams } = new URL(req.url);
    const sinceId = parseInt(searchParams.get("sinceId") || "0", 10) || 0;
    const lastReadId = parseInt(searchParams.get("lastReadId") || "0", 10) || 0;
    const activeBranchId = await getActiveBranchId().catch(() => null);

    let newAnnouncements: Array<{
      id: number;
      title: string;
      description: string;
      date: Date;
      isPinned: boolean;
      authorBranchId: number | null;
      authorBranchName: string | null;
      branchId: number | null;
      targetBranchName: string | null;
    }> = [];

    let unreadCount = 0;
    let latestId = 0;
    let topAnnouncementIds: number[] = [];

    if (session.isOwner) {
      // Owner sees all announcements regardless of targeting
      const latest = await prisma.$queryRaw<Array<{ max_id: number | null }>>`
        SELECT MAX(id) as max_id
        FROM "Announcement"
        WHERE ("expiresAt" IS NULL OR "expiresAt" > NOW())
      `.catch(() => [{ max_id: null }]);

      latestId = latest[0]?.max_id || 0;

      if (sinceId > 0) {
        newAnnouncements = await prisma.$queryRaw<typeof newAnnouncements>`
          SELECT a.id, a.title, a.description, a."createdAt" as date, a.pinned as "isPinned",
                 a."authorBranchId", ab.name as "authorBranchName",
                 a."branchId", tb.name as "targetBranchName"
          FROM "Announcement" a
          LEFT JOIN "Branch" ab ON ab.id = a."authorBranchId"
          LEFT JOIN "Branch" tb ON tb.id = a."branchId"
          WHERE a.id > ${sinceId}
            AND (a."expiresAt" IS NULL OR a."expiresAt" > NOW())
          ORDER BY a.id ASC
          LIMIT 10
        `.catch(() => []);
      }

      const unread = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint as count
        FROM "Announcement"
        WHERE id > ${lastReadId}
          AND ("expiresAt" IS NULL OR "expiresAt" > NOW())
      `.catch(() => [{ count: BigInt(0) }]);

      unreadCount = Number(unread[0]?.count || 0);

      const topAnnouncements = await prisma.$queryRaw<Array<{ id: number }>>`
        SELECT a.id
        FROM "Announcement" a
        WHERE (a."expiresAt" IS NULL OR a."expiresAt" > NOW())
        ORDER BY a.pinned DESC, a."createdAt" DESC
        LIMIT 3
      `.catch(() => []);

      topAnnouncementIds = topAnnouncements.map((item) => item.id);
    } else {
      // Branch admin / user sees targeted to branch, whole school, or authored by branch
      const latest = await prisma.$queryRaw<Array<{ max_id: number | null }>>`
        SELECT MAX(id) as max_id
        FROM "Announcement"
        WHERE ("expiresAt" IS NULL OR "expiresAt" > NOW())
          AND ("branchId" = ${activeBranchId} OR "branchId" IS NULL OR "authorBranchId" = ${activeBranchId})
      `.catch(() => [{ max_id: null }]);

      latestId = latest[0]?.max_id || 0;

      if (sinceId > 0) {
        newAnnouncements = await prisma.$queryRaw<typeof newAnnouncements>`
          SELECT a.id, a.title, a.description, a."createdAt" as date, a.pinned as "isPinned",
                 a."authorBranchId", ab.name as "authorBranchName",
                 a."branchId", tb.name as "targetBranchName"
          FROM "Announcement" a
          LEFT JOIN "Branch" ab ON ab.id = a."authorBranchId"
          LEFT JOIN "Branch" tb ON tb.id = a."branchId"
          WHERE a.id > ${sinceId}
            AND (a."expiresAt" IS NULL OR a."expiresAt" > NOW())
            AND (a."branchId" = ${activeBranchId} OR "branchId" IS NULL OR "authorBranchId" = ${activeBranchId})
          ORDER BY a.id ASC
          LIMIT 10
        `.catch(() => []);
      }

      const unread = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint as count
        FROM "Announcement"
        WHERE id > ${lastReadId}
          AND ("expiresAt" IS NULL OR "expiresAt" > NOW())
          AND ("branchId" = ${activeBranchId} OR "branchId" IS NULL OR "authorBranchId" = ${activeBranchId})
      `.catch(() => [{ count: BigInt(0) }]);

      unreadCount = Number(unread[0]?.count || 0);

      const topAnnouncements = await prisma.$queryRaw<Array<{ id: number }>>`
        SELECT a.id
        FROM "Announcement" a
        WHERE (a."expiresAt" IS NULL OR a."expiresAt" > NOW())
          AND (a."branchId" = ${activeBranchId} OR "branchId" IS NULL OR "authorBranchId" = ${activeBranchId})
        ORDER BY a.pinned DESC, a."createdAt" DESC
        LIMIT 3
      `.catch(() => []);

      topAnnouncementIds = topAnnouncements.map((item) => item.id);
    }

    return NextResponse.json({
      announcements: newAnnouncements,
      unreadCount,
      latestId,
      topAnnouncementIds,
    });
  } catch (err) {
    console.error("Error in check-new announcements API:", err);
    return NextResponse.json({ announcements: [], unreadCount: 0, latestId: 0 }, { status: 500 });
  }
}

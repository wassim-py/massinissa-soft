import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthSession, getActiveBranchId } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0",
  "Pragma": "no-cache",
  "Expires": "0",
  "Surrogate-Control": "no-store",
};

export async function GET(req: NextRequest) {
  try {
    const session = await getAuthSession().catch(() => null);
    if (!session || !session.userId) {
      return NextResponse.json(
        {
          recentNewAnnouncements: [],
          dashboardAnnouncements: [],
          newAnnouncementIds: [],
          topAnnouncementIds: [],
          unreadCount: 0,
          latestId: 0,
          userId: null,
          timestamp: Date.now(),
        },
        { headers: NO_CACHE_HEADERS }
      );
    }

    const activeBranchId = await getActiveBranchId().catch(() => null);
    const branchParam = req.nextUrl.searchParams.get("branchId");
    const parsedBranchParam = branchParam ? parseInt(branchParam, 10) : null;
    const requestedBranchId =
      parsedBranchParam !== null && !isNaN(parsedBranchParam)
        ? parsedBranchParam
        : null;

    let recentNewAnnouncements: Array<{
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

    let rawTopAnnouncements: Array<{
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

    let latestId = 0;

    if (session.isOwner) {
      const latest = await prisma.$queryRaw<Array<{ max_id: number | null }>>`
        SELECT MAX(id) as max_id
        FROM "Announcement"
        WHERE ("expiresAt" IS NULL OR "expiresAt" > NOW())
      `.catch(() => [{ max_id: null }]);

      latestId = latest[0]?.max_id || 0;

      // All active announcements created within the last 72 hours (the "NEW" window)
      recentNewAnnouncements = await prisma.$queryRaw<typeof recentNewAnnouncements>`
        SELECT a.id, a.title, a.description, a."createdAt" as date, a.pinned as "isPinned",
               a."authorBranchId", ab.name as "authorBranchName",
               a."branchId", tb.name as "targetBranchName"
        FROM "Announcement" a
        LEFT JOIN "Branch" ab ON ab.id = a."authorBranchId"
        LEFT JOIN "Branch" tb ON tb.id = a."branchId"
        WHERE (a."expiresAt" IS NULL OR a."expiresAt" > NOW())
          AND a."createdAt" > NOW() - INTERVAL '72 HOURS'
        ORDER BY a.pinned DESC, a."createdAt" DESC
        LIMIT 50
      `.catch(() => []);

      // Top announcements for dashboard live syncing (filtered by requested branch if set)
      if (requestedBranchId) {
        rawTopAnnouncements = await prisma.$queryRaw<typeof rawTopAnnouncements>`
          SELECT a.id, a.title, a.description, a."createdAt" as date, a.pinned as "isPinned",
                 a."authorBranchId", ab.name as "authorBranchName",
                 a."branchId", tb.name as "targetBranchName",
                 a."expiresAt",
                 (a."createdAt" > NOW() - INTERVAL '72 HOURS') as "isNew"
          FROM "Announcement" a
          LEFT JOIN "Branch" ab ON ab.id = a."authorBranchId"
          LEFT JOIN "Branch" tb ON tb.id = a."branchId"
          WHERE (a."expiresAt" IS NULL OR a."expiresAt" > NOW())
            AND (a."branchId" = ${requestedBranchId} OR a."branchId" IS NULL OR a."authorBranchId" = ${requestedBranchId})
          ORDER BY a.pinned DESC, a."createdAt" DESC
          LIMIT 5
        `.catch(() => []);
      } else {
        rawTopAnnouncements = await prisma.$queryRaw<typeof rawTopAnnouncements>`
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
          LIMIT 5
        `.catch(() => []);
      }
    } else {
      const targetBranchId = requestedBranchId || activeBranchId;
      const latest = await prisma.$queryRaw<Array<{ max_id: number | null }>>`
        SELECT MAX(id) as max_id
        FROM "Announcement"
        WHERE ("expiresAt" IS NULL OR "expiresAt" > NOW())
          AND ("branchId" = ${targetBranchId} OR "branchId" IS NULL OR "authorBranchId" = ${targetBranchId})
      `.catch(() => [{ max_id: null }]);

      latestId = latest[0]?.max_id || 0;

      // Active announcements in the last 72 hours targeted to branch or whole school
      recentNewAnnouncements = await prisma.$queryRaw<typeof recentNewAnnouncements>`
        SELECT a.id, a.title, a.description, a."createdAt" as date, a.pinned as "isPinned",
               a."authorBranchId", ab.name as "authorBranchName",
               a."branchId", tb.name as "targetBranchName"
        FROM "Announcement" a
        LEFT JOIN "Branch" ab ON ab.id = a."authorBranchId"
        LEFT JOIN "Branch" tb ON tb.id = a."branchId"
        WHERE (a."expiresAt" IS NULL OR a."expiresAt" > NOW())
          AND a."createdAt" > NOW() - INTERVAL '72 HOURS'
          AND ("branchId" = ${targetBranchId} OR "branchId" IS NULL OR "authorBranchId" = ${targetBranchId})
        ORDER BY a.pinned DESC, a."createdAt" DESC
        LIMIT 50
      `.catch(() => []);

      rawTopAnnouncements = await prisma.$queryRaw<typeof rawTopAnnouncements>`
        SELECT a.id, a.title, a.description, a."createdAt" as date, a.pinned as "isPinned",
               a."authorBranchId", ab.name as "authorBranchName",
               a."branchId", tb.name as "targetBranchName",
               a."expiresAt",
               (a."createdAt" > NOW() - INTERVAL '72 HOURS') as "isNew"
        FROM "Announcement" a
        LEFT JOIN "Branch" ab ON ab.id = a."authorBranchId"
        LEFT JOIN "Branch" tb ON tb.id = a."branchId"
        WHERE (a."expiresAt" IS NULL OR a."expiresAt" > NOW())
          AND ("branchId" = ${targetBranchId} OR "branchId" IS NULL OR "authorBranchId" = ${targetBranchId})
        ORDER BY a.pinned DESC, a."createdAt" DESC
        LIMIT 5
      `.catch(() => []);
    }

    const newAnnouncementIds = recentNewAnnouncements.map((a) => a.id);
    const topAnnouncementIds = rawTopAnnouncements.map((item) => item.id);
    const dashboardAnnouncements = rawTopAnnouncements.slice(0, 3);

    return NextResponse.json(
      {
        recentNewAnnouncements,
        dashboardAnnouncements,
        newAnnouncementIds,
        topAnnouncementIds,
        unreadCount: newAnnouncementIds.length,
        latestId,
        userId: session.userId,
        timestamp: Date.now(),
      },
      { headers: NO_CACHE_HEADERS }
    );
  } catch (err) {
    console.error("Error in check-new announcements API:", err);
    return NextResponse.json(
      {
        recentNewAnnouncements: [],
        dashboardAnnouncements: [],
        newAnnouncementIds: [],
        topAnnouncementIds: [],
        unreadCount: 0,
        latestId: 0,
        userId: null,
        timestamp: Date.now(),
      },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}

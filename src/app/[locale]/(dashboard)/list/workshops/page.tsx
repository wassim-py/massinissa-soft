import FormContainer from "@/components/FormContainer";
import PageHeader from "@/components/PageHeader";
import Pagination from "@/components/Pagination";
import prisma from "@/lib/prisma";
import { ITEM_PER_PAGE, canUserAccessBranch } from "@/lib/settings";
import { getAuthSession } from "@/lib/auth";
import Image from "next/image";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { FilterTabs } from "@/components/ui/FilterTabs";
import { getTranslations, getLocale } from "next-intl/server";

const WorkshopListPage = async (
  props: {
    searchParams: Promise<{ [key: string]: string | undefined }>;
  }
) => {
  const searchParams = await props.searchParams;
  const session = await getAuthSession();
  const t = await getTranslations("workshops");
  const locale = await getLocale();
  const { page, search, branchId: branchParam } = searchParams;
  const parsedPage = page ? parseInt(page, 10) : 1;
  const p = Number.isNaN(parsedPage) || parsedPage < 1 ? 1 : parsedPage;

  const selectedBranchId =
    session.isOwner && branchParam && !isNaN(parseInt(branchParam, 10))
      ? parseInt(branchParam, 10)
      : null;

  let workshops: any[] = [];
  let branches: Array<{ id: number; name: string }> = [];
  let count = 0;

  try {
    const whereClause: any = {
      ...(selectedBranchId ? { branchId: selectedBranchId } : {}),
      ...(search?.trim()
        ? {
            OR: [
              { title: { contains: search.trim(), mode: "insensitive" } },
              { guestTeacher: { contains: search.trim(), mode: "insensitive" } },
              { teacher: { name: { contains: search.trim(), mode: "insensitive" } } },
            ],
          }
        : {}),
    };

    const [rawWorkshops, totalCount, branchList] = await Promise.all([
      prisma.workshop.findMany({
        where: whereClause,
        include: {
          Branch: { select: { id: true, name: true } },
          teacher: { select: { id: true, name: true } },
          sessions: {
            select: { id: true, startsAt: true, endsAt: true },
            orderBy: { startsAt: "asc" },
          },
          _count: {
            select: {
              sessions: true,
              participants: {
                where: { status: { notIn: ["SUSPENDED", "REFUNDED", "INACTIVE"] } },
              },
            },
          },
        },
        orderBy: { id: "desc" },
        take: ITEM_PER_PAGE,
        skip: ITEM_PER_PAGE * (p - 1),
      }),
      prisma.workshop.count({ where: whereClause }),
      session.isOwner
        ? prisma.branch.findMany({
            select: { id: true, name: true },
            orderBy: { id: "asc" },
          })
        : Promise.resolve([]),
    ]);

    count = totalCount;
    branches = branchList;

    workshops = rawWorkshops.map((w) => ({
      id: w.id,
      title: w.title,
      description: w.description || "",
      price: Number(w.totalPrice || 0),
      teacherId: w.teacherId || "",
      teacherName: w.teacher?.name || w.guestTeacher || "",
      displayTeacherName: w.teacher?.name || w.guestTeacher || t("unspecified"),
      branchId: w.branchId,
      branchName: w.Branch?.name || (locale === "ar" ? `الفرع ${w.branchId}` : `Siège ${w.branchId}`),
      sessions: w.sessions.map((s) => ({
        id: s.id,
        startTime: s.startsAt,
        endTime: s.endsAt,
      })),
      _count: {
        sessions: w._count.sessions,
        participants: w._count.participants,
      },
    }));
  } catch (err) {
    console.error("Error fetching workshops:", err);
    workshops = [];
    count = 0;
  }

  const buildBranchHref = (bId: string | number) => {
    const qs = new URLSearchParams();
    if (bId !== "all") qs.set("branchId", String(bId));
    if (search?.trim()) qs.set("search", search.trim());
    const str = qs.toString();
    return `/${locale}/list/workshops${str ? `?${str}` : ""}`;
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <PageHeader
        title={t("title")}
        searchPlaceholder={t("searchPlaceholder")}
        createAction={
          session.isOwnerOrAdmin ? { table: "workshop", type: "create" } : null
        }
      />

      {session.isOwner && branches.length > 0 && (
        <FilterTabs
          activeTab={selectedBranchId ?? "all"}
          tabs={[
            {
              id: "all",
              label: locale === "ar" ? "جميع الفروع" : "Tous les sièges",
              href: buildBranchHref("all"),
            },
            ...branches.map((b) => ({
              id: b.id,
              label: b.name,
              href: buildBranchHref(b.id),
            })),
          ]}
        />
      )}

      {workshops.length > 0 ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
            {workshops.map((workshop) => {
              const canManageWorkshop =
                session.isOwner ||
                (session.isOwnerOrAdmin &&
                  canUserAccessBranch(session.rawRole, session.branchIds, workshop.branchId));

              return (
                <Card
                  key={workshop.id}
                  className="flex flex-col hover:border-primary/40 transition-colors overflow-hidden"
                >
                  <Link
                    href={`/list/workshops/${workshop.id}`}
                    prefetch={false}
                    className="block p-6 flex-grow hover:bg-surface-subtle transition-colors"
                  >
                    <div className="flex items-center justify-between gap-4 mb-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="bg-primary/10 p-3 rounded-full shrink-0">
                          <Image
                            src="/lesson.png"
                            alt="workshop icon"
                            width={24}
                            height={24}
                          />
                        </div>
                        <h2 className="text-card-title font-bold text-gray-900 truncate">
                          {workshop.title}
                        </h2>
                      </div>
                      <Badge variant="primary" size="sm" className="shrink-0">
                        {workshop.price.toLocaleString(locale === "ar" ? "ar-DZ" : "fr-DZ")} DZD
                      </Badge>
                    </div>
                    {workshop.description && (
                      <p className="text-sm text-gray-600 mb-4 overflow-hidden line-clamp-2">
                        {workshop.description}
                      </p>
                    )}
                    <div className="text-xs space-y-2 text-gray-600 border-t border-border pt-4">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-500">{t("branch")}:</span>
                        <Badge variant="secondary" size="sm">
                          {workshop.branchName}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-500">{t("teacher")}:</span>
                        <span className="font-semibold text-gray-800">{workshop.displayTeacherName}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-500">{t("scheduleTitle")}:</span>
                        <Badge variant="neutral" size="sm">
                          {t("sessionsCount", { count: workshop._count.sessions })}
                        </Badge>
                      </div>
                      {session.isOwnerOrAdmin && (
                        <div className="flex items-center justify-between">
                          <span className="text-gray-500">{t("roster")}:</span>
                          <Badge variant="secondary" size="sm">
                            {t("participantsCount", { count: workshop._count.participants })}
                          </Badge>
                        </div>
                      )}
                    </div>
                  </Link>
                  {canManageWorkshop && (
                    <div className="border-t border-border p-3 bg-surface-subtle flex items-center justify-between gap-2">
                      <Link
                        href={`/list/attendance/workshop/${workshop.id}`}
                        prefetch={false}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                      >
                        <Image src="/attendance.png" alt="" width={14} height={14} />
                        <span>{locale === "ar" ? "الحضور" : "Présences"}</span>
                      </Link>
                      <div className="flex items-center gap-2">
                        <FormContainer
                          table="workshop"
                          type="update"
                          id={workshop.id}
                          data={workshop}
                        />
                        <FormContainer
                          table="workshop"
                          type="delete"
                          id={workshop.id}
                        />
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
          <Pagination count={count} />
        </>
      ) : (
        <Card className="text-center py-16 px-4 border-dashed mt-6">
          <Image src="/workshop.png" alt="No workshops" width={64} height={64} className="mx-auto opacity-50" />
          <h2 className="text-xl font-semibold text-gray-700 mt-4">
            {t("noWorkshops")}
          </h2>
          <p className="text-gray-500 mt-2 text-sm">
            {t("noWorkshopsDesc")}
          </p>
        </Card>
      )}
    </div>
  );
};

export default WorkshopListPage;

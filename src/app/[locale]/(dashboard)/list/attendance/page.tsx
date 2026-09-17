import prisma from "@/lib/prisma";
import { getAuthSession, getActiveBranchId } from "@/lib/auth";
import Image from "next/image";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import Pagination from "@/components/Pagination";
import { ITEM_PER_PAGE } from "@/lib/settings";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { FilterTabs } from "@/components/ui/FilterTabs";
import { getTranslations, getLocale } from "next-intl/server";
import { BookOpen, GraduationCap, Sparkles } from "lucide-react";

type AttendanceItem = {
  id: number;
  name: string;
  category: "class" | "formation" | "workshop";
  branchId: number;
  branchName: string;
  teacherName?: string | null;
  description?: string | null;
  studentCount: number;
  sessionCount: number;
  href: string;
};

const AttendanceListPage = async (
  props: {
    searchParams: Promise<{ studentId?: string; search?: string; branchId?: string; type?: string; page?: string }>;
  }
) => {
  const searchParams = await props.searchParams;
  const session = await getAuthSession();
  const t = await getTranslations("attendance");
  const tCommon = await getTranslations("common");
  const locale = await getLocale();

  if (!session.can("view", "attendance")) {
    return (
      <Card className="p-8 text-center max-w-md mx-auto my-8 border-border shadow-xs">
        <div className="flex flex-col items-center gap-3">
          <Badge variant="danger" size="md" withDot>
            {locale === "ar" ? "وصول غير مصرح" : "Accès non autorisé"}
          </Badge>
          <p className="text-table-body text-muted">
            {locale === "ar"
              ? "ليس لديك صلاحية للوصول إلى سجلات الحضور."
              : "Vous n'avez pas l'autorisation d'accéder aux feuilles de présence."}
          </p>
        </div>
      </Card>
    );
  }

  const isOwner = session.isOwner;
  const activeBranchId = await getActiveBranchId();
  const { search, type = "all" } = searchParams;
  const activeType = ["all", "classes", "formations", "workshops"].includes(type) ? type : "all";

  // Fetch all branches for owner filter tabs
  const branches = await prisma.branch.findMany({
    select: { id: true, name: true },
    orderBy: { id: "asc" },
  });

  // Branch Scoping Logic:
  // 1. Branch admins see ONLY groups belonging to their own branch
  // 2. The owner sees an additional filter/tab to view attendance records across any branch, or all branches combined
  let selectedBranchId: number | "all" = "all";
  let branchName = "";

  if (!isOwner) {
    const branchAdminBranchId =
      session.branchIds.length > 0 ? session.branchIds[0] : activeBranchId;
    selectedBranchId = branchAdminBranchId;
    const currentBranch = branches.find((b) => b.id === branchAdminBranchId);
    branchName = currentBranch ? currentBranch.name : (locale === "ar" ? `الفرع #${branchAdminBranchId}` : `Siège #${branchAdminBranchId}`);
  } else {
    // Owner role
    if (searchParams.branchId === "all") {
      selectedBranchId = "all";
    } else if (searchParams.branchId) {
      const parsed = parseInt(searchParams.branchId, 10);
      if (!isNaN(parsed) && branches.some((b) => b.id === parsed)) {
        selectedBranchId = parsed;
        const currentBranch = branches.find((b) => b.id === parsed);
        branchName = currentBranch ? currentBranch.name : (locale === "ar" ? `الفرع #${parsed}` : `Siège #${parsed}`);
      } else {
        selectedBranchId = "all";
      }
    } else {
      // Default for owner: all branches combined
      selectedBranchId = "all";
    }
  }

  const pageTitle =
    selectedBranchId === "all"
      ? (locale === "ar" ? "سجلات الحضور والغياب — جميع الفروع (Consolidé)" : "Registre des présences — Tous les sièges (Consolidé)")
      : (locale === "ar" ? `سجلات الحضور والغياب — ${branchName}` : `Registre des présences — ${branchName}`);

  // Helper to preserve URL params across tab changes
  const createFilterUrl = (overrides: { branchId?: string | number; type?: string }) => {
    const params = new URLSearchParams();
    const branchVal = overrides.branchId !== undefined ? String(overrides.branchId) : String(selectedBranchId);
    if (isOwner && branchVal) params.set("branchId", branchVal);
    const typeVal = overrides.type !== undefined ? overrides.type : activeType;
    if (typeVal && typeVal !== "all") params.set("type", typeVal);
    if (search) params.set("search", search);
    return `/list/attendance?${params.toString()}`;
  };

  let items: AttendanceItem[] = [];
  let classCount = 0;
  let formationCount = 0;
  let workshopCount = 0;

  try {
    const classWhere: any = {};
    const workshopWhere: any = {};

    if (selectedBranchId !== "all") {
      classWhere.branchId = selectedBranchId;
      workshopWhere.branchId = selectedBranchId;
    }

    if (search) {
      classWhere.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { teacher: { name: { contains: search, mode: "insensitive" } } },
      ];
      workshopWhere.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { guestTeacher: { contains: search, mode: "insensitive" } },
      ];
    }

    // Counts for Category Tabs
    const [rawClassCount, rawFormationCount, rawWorkshopCount] = await Promise.all([
      prisma.class.count({ where: { ...classWhere, isFormation: false } }),
      prisma.class.count({ where: { ...classWhere, isFormation: true } }),
      prisma.workshop.count({ where: workshopWhere }),
    ]);

    classCount = rawClassCount;
    formationCount = rawFormationCount;
    workshopCount = rawWorkshopCount;

    const pageNum = searchParams.page ? parseInt(searchParams.page, 10) : 1;
    const p = isNaN(pageNum) || pageNum < 1 ? 1 : pageNum;
    const skip = ITEM_PER_PAGE * (p - 1);

    if (activeType === "classes" || activeType === "formations") {
      const activeClassWhere: any = { ...classWhere };
      if (activeType === "classes") {
        activeClassWhere.isFormation = false;
      } else {
        activeClassWhere.isFormation = true;
      }

      const rawClasses = await prisma.class.findMany({
        where: activeClassWhere,
        skip,
        take: ITEM_PER_PAGE,
        select: {
          id: true,
          name: true,
          isFormation: true,
          branchId: true,
          branch: { select: { id: true, name: true } },
          teacher: { select: { id: true, name: true } },
          FormationLevel: {
            select: {
              name: true,
              Language: { select: { name: true } },
            },
          },
          _count: {
            select: {
              enrollments: true,
              lessons: true,
            },
          },
        },
        orderBy: [
          { branchId: "asc" },
          { name: "asc" },
        ],
      });

      for (const c of rawClasses) {
        items.push({
          id: c.id,
          name: c.name,
          category: c.isFormation ? "formation" : "class",
          branchId: c.branchId,
          branchName: c.branch?.name || (locale === "ar" ? `الفرع ${c.branchId}` : `Siège ${c.branchId}`),
          teacherName: c.teacher?.name || null,
          description: c.isFormation && c.FormationLevel?.Language
            ? `${c.FormationLevel.Language.name} • ${c.FormationLevel.name}`
            : null,
          studentCount: c._count.enrollments,
          sessionCount: c._count.lessons,
          href: `/list/attendance/class/${c.id}`,
        });
      }
    } else if (activeType === "workshops") {
      const rawWorkshops = await prisma.workshop.findMany({
        where: workshopWhere,
        skip,
        take: ITEM_PER_PAGE,
        select: {
          id: true,
          title: true,
          branchId: true,
          guestTeacher: true,
          description: true,
          Branch: { select: { id: true, name: true } },
          _count: {
            select: {
              participants: true,
              sessions: true,
            },
          },
        },
        orderBy: [
          { branchId: "asc" },
          { title: "asc" },
        ],
      });

      for (const w of rawWorkshops) {
        items.push({
          id: w.id,
          name: w.title,
          category: "workshop",
          branchId: w.branchId,
          branchName: w.Branch?.name || (locale === "ar" ? `الفرع ${w.branchId}` : `Siège ${w.branchId}`),
          teacherName: w.guestTeacher || null,
          description: w.description || null,
          studentCount: w._count.participants,
          sessionCount: w._count.sessions,
          href: `/list/attendance/workshop/${w.id}`,
        });
      }
    } else {
      // activeType === "all": combined pagination across classes, formations, and workshops
      const totalClasses = classCount + formationCount;
      if (skip < totalClasses) {
        const classTake = Math.min(ITEM_PER_PAGE, totalClasses - skip);
        const rawClasses = await prisma.class.findMany({
          where: classWhere,
          skip,
          take: classTake,
          select: {
            id: true,
            name: true,
            isFormation: true,
            branchId: true,
            branch: { select: { id: true, name: true } },
            teacher: { select: { id: true, name: true } },
            FormationLevel: {
              select: {
                name: true,
                Language: { select: { name: true } },
              },
            },
            _count: {
              select: {
                enrollments: true,
                lessons: true,
              },
            },
          },
          orderBy: [
            { branchId: "asc" },
            { name: "asc" },
          ],
        });

        for (const c of rawClasses) {
          items.push({
            id: c.id,
            name: c.name,
            category: c.isFormation ? "formation" : "class",
            branchId: c.branchId,
            branchName: c.branch?.name || (locale === "ar" ? `الفرع ${c.branchId}` : `Siège ${c.branchId}`),
            teacherName: c.teacher?.name || null,
            description: c.isFormation && c.FormationLevel?.Language
              ? `${c.FormationLevel.Language.name} • ${c.FormationLevel.name}`
              : null,
            studentCount: c._count.enrollments,
            sessionCount: c._count.lessons,
            href: `/list/attendance/class/${c.id}`,
          });
        }

        const remainingTake = ITEM_PER_PAGE - items.length;
        if (remainingTake > 0) {
          const rawWorkshops = await prisma.workshop.findMany({
            where: workshopWhere,
            skip: 0,
            take: remainingTake,
            select: {
              id: true,
              title: true,
              branchId: true,
              guestTeacher: true,
              description: true,
              Branch: { select: { id: true, name: true } },
              _count: {
                select: {
                  participants: true,
                  sessions: true,
                },
              },
            },
            orderBy: [
              { branchId: "asc" },
              { title: "asc" },
            ],
          });

          for (const w of rawWorkshops) {
            items.push({
              id: w.id,
              name: w.title,
              category: "workshop",
              branchId: w.branchId,
              branchName: w.Branch?.name || (locale === "ar" ? `الفرع ${w.branchId}` : `Siège ${w.branchId}`),
              teacherName: w.guestTeacher || null,
              description: w.description || null,
              studentCount: w._count.participants,
              sessionCount: w._count.sessions,
              href: `/list/attendance/workshop/${w.id}`,
            });
          }
        }
      } else {
        const workshopSkip = skip - totalClasses;
        const rawWorkshops = await prisma.workshop.findMany({
          where: workshopWhere,
          skip: workshopSkip,
          take: ITEM_PER_PAGE,
          select: {
            id: true,
            title: true,
            branchId: true,
            guestTeacher: true,
            description: true,
            Branch: { select: { id: true, name: true } },
            _count: {
              select: {
                participants: true,
                sessions: true,
              },
            },
          },
          orderBy: [
            { branchId: "asc" },
            { title: "asc" },
          ],
        });

        for (const w of rawWorkshops) {
          items.push({
            id: w.id,
            name: w.title,
            category: "workshop",
            branchId: w.branchId,
            branchName: w.Branch?.name || (locale === "ar" ? `الفرع ${w.branchId}` : `Siège ${w.branchId}`),
            teacherName: w.guestTeacher || null,
            description: w.description || null,
            studentCount: w._count.participants,
            sessionCount: w._count.sessions,
            href: `/list/attendance/workshop/${w.id}`,
          });
        }
      }
    }
  } catch (err) {
    console.error("Error fetching items for attendance:", err);
    items = [];
  }

  const totalAllCount = classCount + formationCount + workshopCount;
  const currentCount =
    activeType === "classes"
      ? classCount
      : activeType === "formations"
      ? formationCount
      : activeType === "workshops"
      ? workshopCount
      : totalAllCount;

  return (
    <Card className="flex-1 w-full border-border/80 shadow-xs font-sans">
      <CardContent className="p-4 sm:p-5 md:p-6">
        <PageHeader
          title={pageTitle}
          searchPlaceholder={t("searchPlaceholder")}
          createAction={null}
        />

        {/* Category Tabs: All, Regular Classes, Formations, Dawarat (Workshops) */}
        <div className="flex flex-wrap items-center gap-2 mt-4 pb-4 border-b border-border/70">
          <span className="text-xs font-bold text-muted ms-2">
            {t("filterByType")}
          </span>
          <FilterTabs
            activeTab={activeType}
            tabs={[
              {
                id: "all",
                label: t("allTypesTab"),
                count: totalAllCount,
                href: createFilterUrl({ type: "all" }),
              },
              {
                id: "classes",
                label: t("regularClassesTab"),
                icon: <BookOpen className="w-3.5 h-3.5" />,
                count: classCount,
                href: createFilterUrl({ type: "classes" }),
              },
              {
                id: "formations",
                label: t("formationsTab"),
                icon: <GraduationCap className="w-3.5 h-3.5" />,
                count: formationCount,
                href: createFilterUrl({ type: "formations" }),
              },
              {
                id: "workshops",
                label: t("workshopsTab"),
                icon: <Sparkles className="w-3.5 h-3.5" />,
                count: workshopCount,
                href: createFilterUrl({ type: "workshops" }),
              },
            ]}
          />
        </div>

        {/* Owner Multi-Branch Filter Tabs */}
        {isOwner && (
          <div className="flex flex-wrap items-center gap-2 mt-3 pb-4 border-b border-border/70">
            <span className="text-xs font-bold text-muted ms-2">
              {t("filterByBranch")}
            </span>
            <FilterTabs
              activeTab={selectedBranchId}
              tabs={[
                {
                  id: "all",
                  label: t("allBranchesTab"),
                  href: createFilterUrl({ branchId: "all" }),
                },
                ...branches.map((b) => ({
                  id: b.id,
                  label: b.name,
                  href: createFilterUrl({ branchId: b.id }),
                })),
              ]}
            />
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5 mt-6">
          {items.map((item) => {
            const isFormation = item.category === "formation";
            const isWorkshop = item.category === "workshop";

            const badgeVariant = isFormation ? "primary" : isWorkshop ? "warning" : "secondary";
            const badgeLabel = isFormation
              ? t("formationBadge")
              : isWorkshop
              ? t("workshopBadge")
              : t("regularClassBadge");

            const iconSrc = isFormation ? "/lesson.png" : isWorkshop ? "/workshop.png" : "/class.png";

            return (
              <Link
                href={item.href}
                key={`${item.category}-${item.id}`}
                className="block group"
              >
                <Card className="p-5 border-border/80 group-hover:border-primary/50 group-hover:shadow-md transition-all flex flex-col h-full">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 rounded-full bg-primary-light flex items-center justify-center shrink-0">
                        <Image
                          src={iconSrc}
                          alt={item.name}
                          width={20}
                          height={20}
                        />
                      </div>
                      <Badge variant={badgeVariant as any} size="sm">
                        {badgeLabel}
                      </Badge>
                    </div>

                    {(isOwner || selectedBranchId === "all") && (
                      <Badge variant="neutral" size="sm" className="font-medium">
                        {item.branchName}
                      </Badge>
                    )}
                  </div>

                  <h2 className="text-card-title font-bold text-gray-900 group-hover:text-primary transition-colors line-clamp-1 mb-1">
                    {item.name}
                  </h2>

                  {item.description && (
                    <p className="text-xs text-muted font-medium line-clamp-1 mb-2">
                      {item.description}
                    </p>
                  )}

                  {item.teacherName && (
                    <p className="text-xs text-gray-600 mb-3 flex items-center gap-1.5">
                      <span className="text-muted">{locale === "ar" ? "الأستاذ:" : "Prof :"}</span>
                      <span className="font-semibold text-gray-800">{item.teacherName}</span>
                    </p>
                  )}

                  <div className="mt-auto border-t border-border/60 pt-3 flex items-center justify-between text-table-body text-muted">
                    <div className="flex items-center gap-2">
                      <Badge variant="neutral" size="sm">
                        {item.studentCount} {isWorkshop ? (locale === "ar" ? "مشارك" : "parts") : (locale === "ar" ? "تلميذ" : "élèves")}
                      </Badge>
                      <Badge variant="secondary" size="sm">
                        {item.sessionCount} {locale === "ar" ? "حصة" : "séances"}
                      </Badge>
                    </div>
                    <span className="text-xs font-bold text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                      {locale === "ar" ? "عرض ←" : "Voir →"}
                    </span>
                  </div>
                </Card>
              </Link>
            );
          })}

          {items.length === 0 && (
            <div className="col-span-full text-center py-16 px-4 border-2 border-dashed border-border rounded-xl">
              <p className="text-table-body text-muted">
                {search
                  ? (locale === "ar" ? `لم يتم العثور على أي نتائج تحتوي "${search}".` : `Aucun résultat ne contient "${search}".`)
                  : t("noGroupsFound")}
              </p>
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-center">
          <Pagination count={currentCount} />
        </div>
      </CardContent>
    </Card>
  );
};

export default AttendanceListPage;

import FormContainer from "@/components/FormContainer";
import PageHeader from "@/components/PageHeader";
import Pagination from "@/components/Pagination";
import prisma from "@/lib/prisma";
import { ITEM_PER_PAGE } from "@/lib/settings";
import { getAuthRole } from "@/lib/auth";
import Image from "next/image";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { FilterTabs } from "@/components/ui/FilterTabs";
import { serializeForClient } from "@/lib/utils";
import { getTranslations, getLocale } from "next-intl/server";
import { Prisma } from "@prisma/client";
import {
  ACTIVE_CLASS_WHERE,
  INACTIVE_CLASS_WHERE,
  isClassInactive,
  normalizeClassFilterStatus,
} from "@/lib/classStatus";

const FormationsListPage = async (
  props: {
    searchParams: Promise<{ [key: string]: string | undefined }>;
  }
) => {
  const searchParams = await props.searchParams;
  const role = await getAuthRole();
  const t = await getTranslations("formations");
  const locale = await getLocale();
  const { page, search, status } = searchParams;
  const activeStatus = normalizeClassFilterStatus(status);
  const p = page ? parseInt(page) : 1;

  const createFilterUrl = (nextStatus: string) => {
    const params = new URLSearchParams();
    if (nextStatus && nextStatus !== "active") params.set("status", nextStatus);
    if (search) params.set("search", search);
    const qs = params.toString();
    return qs ? `/${locale}/list/formations?${qs}` : `/${locale}/list/formations`;
  };

  let formations: any[] = [];
  let count = 0;

  try {
    const whereClause: Prisma.LanguageWhereInput = {
      FormationLevel:
        activeStatus === "active"
          ? {
              some: {
                OR: [
                  { Class: { none: {} } },
                  { Class: { some: { isFormation: true, ...ACTIVE_CLASS_WHERE } } },
                ],
              },
            }
          : activeStatus === "inactive"
          ? {
              some: {
                Class: {
                  some: { isFormation: true, ...INACTIVE_CLASS_WHERE },
                },
              },
            }
          : {
              some: {},
            },
    };

    if (search) {
      whereClause.OR = [
        { name: { contains: search, mode: "insensitive" } },
        {
          FormationLevel: {
            some: {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                {
                  Class: {
                    some: {
                      OR: [
                        { name: { contains: search, mode: "insensitive" } },
                        { teacher: { name: { contains: search, mode: "insensitive" } } },
                        { branch: { name: { contains: search, mode: "insensitive" } } },
                      ],
                    },
                  },
                },
              ],
            },
          },
        },
      ];
    }

    count = await prisma.language.count({ where: whereClause });

    const rawLanguages = await prisma.language.findMany({
      where: whereClause,
      include: {
        FormationLevel: {
          include: {
            Class: {
              where: { isFormation: true },
              include: {
                branch: { select: { id: true, name: true } },
                teacher: { select: { id: true, name: true } },
                _count: {
                  select: {
                    enrollments: {
                      where: {
                        status: "ACTIVE",
                        transfersFrom: { none: {} },
                      },
                    },
                    lessons: true,
                  },
                },
              },
              orderBy: { id: "asc" },
            },
          },
          orderBy: { levelNumber: "asc" },
        },
      },
      orderBy: { id: "desc" },
      take: ITEM_PER_PAGE,
      skip: ITEM_PER_PAGE * (p - 1),
    });

    formations = rawLanguages.map((lang) => {
      const levels = lang.FormationLevel;
      const allClasses = levels.flatMap((lvl) => lvl.Class);
      const firstClass = allClasses[0];

      const totalSessions = allClasses.reduce(
        (sum, c) => sum + (c._count?.lessons || 0),
        0
      );
      const totalParticipants = allClasses.reduce(
        (sum, c) => sum + (c._count?.enrollments || 0),
        0
      );

      const prices = levels
        .map((lvl) => Number(lvl.lumpSumPrice || 0))
        .filter((pr) => pr > 0);
      const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
      const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;
      const priceDisplay =
        minPrice === 0 && maxPrice === 0
          ? "0 DZD"
          : minPrice === maxPrice
          ? `${minPrice.toLocaleString(locale === "ar" ? "ar-DZ" : "fr-DZ")} DZD`
          : `${minPrice.toLocaleString(locale === "ar" ? "ar-DZ" : "fr-DZ")} - ${maxPrice.toLocaleString(locale === "ar" ? "ar-DZ" : "fr-DZ")} DZD`;

      const teacherNamesList = Array.from(
        new Set(allClasses.map((c) => c.teacher?.name).filter(Boolean))
      );
      const teacherNames =
        teacherNamesList.length > 0 ? teacherNamesList.join(", ") : t("unspecified");

      const branchNamesList = Array.from(
        new Set(allClasses.map((c) => c.branch?.name).filter(Boolean))
      );
      const branchDisplay =
        branchNamesList.length > 0 ? branchNamesList.join(", ") : null;

      const isCompleted =
        allClasses.length > 0 && allClasses.every((c) => c.isCompleted);
      const isPaused =
        allClasses.length > 0 &&
        allClasses.every((c) => isClassInactive(c)) &&
        allClasses.some((c) => c.isPaused);
      const hasPausedClasses = allClasses.some((c) => c.isPaused);

      const editData = firstClass
        ? {
            id: firstClass.id,
            languageId: lang.id,
            name: lang.name,
            branchId: firstClass.branchId,
            branch: firstClass.branch,
            teacherId: firstClass.teacherId,
            ageGroup: firstClass.ageGroup,
            hasBooks: firstClass.hasBooks,
            bookFee: firstClass.bookFee ? Number(firstClass.bookFee) : null,
            inscriptionFee: Number(firstClass.inscriptionFee || 0),
          }
        : {
            id: lang.id,
            languageId: lang.id,
            name: lang.name,
          };

      return {
        id: lang.id,
        firstClassId: firstClass?.id || lang.id,
        name: lang.name,
        title: lang.name,
        levelsCount: levels.length,
        groupsCount: allClasses.length,
        levels: levels.map((lvl) => ({
          id: lvl.id,
          name: lvl.name,
          levelNumber: lvl.levelNumber,
          price: Number(lvl.lumpSumPrice || 0),
          groupsCount: lvl.Class.length,
        })),
        priceDisplay,
        teacherNames,
        branchDisplay,
        branch: firstClass?.branch,
        ageGroup: firstClass?.ageGroup,
        isCompleted,
        isPaused,
        hasPausedClasses,
        totalSessions,
        totalParticipants,
        editData,
      };
    });
  } catch (err) {
    console.error("Error fetching formations:", err);
    formations = [];
    count = 0;
  }

  return (
    <div className="p-4 md:p-6 space-y-6 font-sans">
      <PageHeader
        title={t("title")}
        searchPlaceholder={t("searchPlaceholder")}
        createAction={
          role === "admin" ? { table: "formation", type: "create" } : null
        }
      />

      <div className="flex flex-wrap items-center gap-2 pb-2 border-b border-border/60">
        <span className="text-xs font-bold text-muted ms-1">
          {locale === "ar" ? "الحالة:" : "Statut :"}
        </span>
        <FilterTabs
          activeTab={activeStatus}
          tabs={[
            {
              id: "active",
              label: locale === "ar" ? "التكوينات النشطة" : "Formations actives",
              href: createFilterUrl("active"),
            },
            {
              id: "inactive",
              label: locale === "ar" ? "المغلقة / المتوقفة" : "Fermées / En pause",
              href: createFilterUrl("inactive"),
            },
            {
              id: "all",
              label: locale === "ar" ? "الكل" : "Toutes",
              href: createFilterUrl("all"),
            },
          ]}
        />
      </div>

      {formations.length > 0 ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
            {formations.map((formation) => (
              <Card
                key={formation.id}
                className="flex flex-col hover:border-primary/40 transition-colors overflow-hidden group shadow-sm hover:shadow-md"
              >
                <Link
                  href={`/${locale}/list/formations/${formation.id}?lang=1`}
                  prefetch={false}
                  className="block p-6 flex-grow hover:bg-surface-subtle transition-colors"
                >
                  <div className="flex items-center justify-between gap-4 mb-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="bg-primary/10 p-3 rounded-full shrink-0 group-hover:bg-primary group-hover:text-white transition-colors">
                        <Image
                          src="/lesson.png"
                          alt={formation.name}
                          width={24}
                          height={24}
                        />
                      </div>
                      <div className="min-w-0">
                        <h2 className="text-card-title font-bold text-gray-900 group-hover:text-primary transition-colors truncate">
                          {formation.title}
                        </h2>
                        {formation.branchDisplay && (
                          <p className="text-xs text-gray-500 font-medium truncate mt-0.5">
                            {formation.branchDisplay}{" "}
                            {formation.ageGroup ? `• ${formation.ageGroup}` : ""}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <Badge
                        variant={
                          formation.isPaused
                            ? "warning"
                            : formation.isCompleted
                            ? "success"
                            : "neutral"
                        }
                        size="sm"
                        withDot
                      >
                        {formation.isPaused
                          ? locale === "ar"
                            ? "مغلق / متوقف"
                            : "Fermé / En pause"
                          : formation.isCompleted
                          ? t("levelCompletedBadge")
                          : t("levelActiveBadge")}
                      </Badge>
                      {!formation.isPaused && formation.hasPausedClasses && (
                        <Badge variant="warning" size="sm">
                          {locale === "ar" ? "مستوى متوقف" : "Niveau en pause"}
                        </Badge>
                      )}
                      <Badge variant="primary" size="sm" className="font-mono">
                        {formation.priceDisplay}
                      </Badge>
                    </div>
                  </div>

                  {/* Levels chips preview */}
                  <div className="mb-4 bg-gray-50/70 p-2.5 rounded-lg border border-gray-100">
                    <div className="flex items-center justify-between text-xs text-gray-600 mb-1.5 gap-1 flex-wrap">
                      <span className="font-semibold">{t("formationLevels")} :</span>
                      <div className="flex items-center gap-1">
                        <Badge variant="secondary" size="sm">
                          {formation.levelsCount} {locale === "ar" ? "مستويات" : "niveaux"}
                        </Badge>
                        <Badge variant="neutral" size="sm">
                          {t("groupsCount", { count: formation.groupsCount })}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {formation.levels.slice(0, 4).map((lvl: any) => (
                        <span
                          key={lvl.id}
                          className="text-[11px] bg-white border border-gray-200 text-gray-700 px-2 py-0.5 rounded font-medium truncate max-w-[165px]"
                        >
                          {lvl.name}
                          {lvl.groupsCount > 1 ? ` ×${lvl.groupsCount}` : ""}
                        </span>
                      ))}
                      {formation.levelsCount > 4 && (
                        <span className="text-[11px] bg-primary/10 text-primary px-2 py-0.5 rounded font-semibold">
                          +{formation.levelsCount - 4}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="text-xs space-y-2 text-gray-600 border-t border-border pt-4">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">{t("teacher")}:</span>
                      <span className="font-semibold text-gray-800 truncate max-w-[160px]">
                        {formation.teacherNames}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">{t("schedule")}</span>
                      <Badge variant="neutral" size="sm">
                        {t("sessionsCount", { count: formation.totalSessions })}
                      </Badge>
                    </div>
                    {role === "admin" && (
                      <div className="flex items-center justify-between">
                        <span className="text-gray-500">{t("roster")}:</span>
                        <Badge variant="secondary" size="sm">
                          {t("participantsCount", { count: formation.totalParticipants })}
                        </Badge>
                      </div>
                    )}
                  </div>
                </Link>

                <div className="border-t border-border p-3 bg-surface-subtle flex items-center justify-between gap-2">
                  <Link
                    href={`/${locale}/list/formations/${formation.id}?lang=1`}
                    prefetch={false}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                  >
                    <span>{locale === "ar" ? "عرض المستويات والتلاميذ" : "Voir les niveaux"}</span>
                    <span className="rtl:rotate-180">→</span>
                  </Link>
                  {role === "admin" && (
                    <div className="flex items-center gap-2">
                      <FormContainer
                        table="formation"
                        type="update"
                        data={serializeForClient(formation.editData)}
                      />
                      <FormContainer
                        table="formation"
                        type="delete"
                        id={formation.id}
                      />
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
          <Pagination count={count} />
        </>
      ) : (
        <Card className="text-center py-16 px-4 border-dashed mt-6">
          <Image
            src="/workshop.png"
            alt="No formations"
            width={64}
            height={64}
            className="mx-auto opacity-50"
          />
          <h2 className="text-xl font-semibold text-gray-700 mt-4">
            {t("noFormationsFound")}
          </h2>
          <p className="text-gray-500 mt-2 text-sm">
            {search
              ? t("noFormationsSearch", { query: search })
              : t("noFormationsCreated")}
          </p>
        </Card>
      )}
    </div>
  );
};

export default FormationsListPage;

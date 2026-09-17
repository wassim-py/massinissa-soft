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
import { serializeForClient } from "@/lib/utils";
import { getTranslations, getLocale } from "next-intl/server";

const FormationsListPage = async (
  props: {
    searchParams: Promise<{ [key: string]: string | undefined }>;
  }
) => {
  const searchParams = await props.searchParams;
  const role = await getAuthRole();
  const t = await getTranslations("formations");
  const locale = await getLocale();
  const { page, search } = searchParams;
  const p = page ? parseInt(page) : 1;

  let formations: any[] = [];
  let count = 0;

  try {
    const whereClause: any = { isFormation: true };

    if (search) {
      whereClause.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { teacher: { name: { contains: search, mode: "insensitive" } } },
        { FormationLevel: { name: { contains: search, mode: "insensitive" } } },
        { FormationLevel: { Language: { name: { contains: search, mode: "insensitive" } } } },
      ];
    }

    count = await prisma.class.count({ where: whereClause });

    const rawFormations = await prisma.class.findMany({
      where: whereClause,
      include: {
        branch: { select: { id: true, name: true } },
        teacher: { select: { id: true, name: true } },
        FormationLevel: {
          include: {
            Language: { select: { id: true, name: true } },
          },
        },
        _count: {
          select: {
            enrollments: true,
            lessons: true,
          },
        },
      },
      orderBy: { id: "desc" },
      take: ITEM_PER_PAGE,
      skip: ITEM_PER_PAGE * (p - 1),
    });

    formations = rawFormations.map((f) => ({
      id: f.id,
      title: f.name,
      name: f.name,
      description: `${f.FormationLevel?.Language?.name || (locale === "ar" ? "تكوين" : "Formation")} • ${f.FormationLevel?.name || ""}`,
      price: Number(f.FormationLevel?.lumpSumPrice || f.pricePerCycle || 0),
      teacherName: f.teacher?.name || t("unspecified"),
      teacherId: f.teacherId,
      branchId: f.branchId,
      branch: f.branch,
      ageGroup: f.ageGroup,
      hasBooks: f.hasBooks,
      bookFee: f.bookFee ? Number(f.bookFee) : null,
      isCompleted: f.isCompleted,
      completedAt: f.completedAt,
      _count: {
        sessions: Number(f._count?.lessons || 0),
        participants: Number(f._count?.enrollments || 0),
      },
    }));
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

      {formations.length > 0 ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
            {formations.map((formation) => (
              <Card
                key={formation.id}
                className="flex flex-col hover:border-primary/40 transition-colors overflow-hidden"
              >
                <Link
                  href={`/${locale}/list/formations/${formation.id}`}
                  className="block p-6 flex-grow hover:bg-surface-subtle transition-colors"
                >
                  <div className="flex items-center justify-between gap-4 mb-4">
                    <div className="flex items-center gap-3">
                      <div className="bg-primary/10 p-3 rounded-full">
                        <Image
                          src="/lesson.png"
                          alt={t("title")}
                          width={24}
                          height={24}
                        />
                      </div>
                      <h2 className="text-card-title font-bold text-gray-900">
                        {formation.title}
                      </h2>
                    </div>
                    <div className="flex items-center gap-2">
                      {formation.isCompleted ? (
                        <Badge variant="success" size="sm" withDot>
                          {t("levelCompletedBadge")}
                        </Badge>
                      ) : (
                        <Badge variant="neutral" size="sm" withDot>
                          {t("levelActiveBadge")}
                        </Badge>
                      )}
                      <Badge variant="primary" size="sm" className="font-mono">
                        {formation.price.toLocaleString(locale === "ar" ? "ar-DZ" : "fr-DZ")} DZD
                      </Badge>
                    </div>
                  </div>
                  <p className="text-sm text-gray-600 mb-4 h-10 overflow-hidden line-clamp-2">
                    {formation.description}
                  </p>
                  <div className="text-xs space-y-2 text-gray-600 border-t border-border pt-4">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">{t("teacher")}:</span>
                      <span className="font-semibold text-gray-800">{formation.teacherName}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">{t("schedule")}</span>
                      <Badge variant="neutral" size="sm">
                        {t("sessionsCount", { count: formation._count.sessions })}
                      </Badge>
                    </div>
                    {role === "admin" && (
                      <div className="flex items-center justify-between">
                        <span className="text-gray-500">{t("roster")}:</span>
                        <Badge variant="secondary" size="sm">
                          {t("participantsCount", { count: formation._count.participants })}
                        </Badge>
                      </div>
                    )}
                  </div>
                </Link>
                <div className="border-t border-border p-3 bg-surface-subtle flex items-center justify-between gap-2">
                  <Link
                    href={`/list/attendance/class/${formation.id}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                  >
                    <Image src="/attendance.png" alt="" width={14} height={14} />
                    <span>{locale === "ar" ? "الحضور" : "Présences"}</span>
                  </Link>
                  {role === "admin" && (
                    <div className="flex items-center gap-2">
                      <FormContainer
                        table="formation"
                        type="update"
                        data={serializeForClient(formation)}
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
          <Image src="/workshop.png" alt="No formations" width={64} height={64} className="mx-auto opacity-50" />
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

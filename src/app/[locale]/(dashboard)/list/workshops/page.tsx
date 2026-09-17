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
import { getTranslations, getLocale } from "next-intl/server";

const WorkshopListPage = async (
  props: {
    searchParams: Promise<{ [key: string]: string | undefined }>;
  }
) => {
  const searchParams = await props.searchParams;
  const role = await getAuthRole();
  const t = await getTranslations("workshops");
  const locale = await getLocale();
  const { page, search } = searchParams;
  const p = page ? parseInt(page) : 1;

  let workshops: any[] = [];
  let count = 0;

  try {
    let rawWorkshops: any[] = [];
    if (search) {
      const countRes = await prisma.$queryRaw<Array<{ count: string | number | bigint }>>`
        SELECT count(*) FROM "Workshop" w
        WHERE w.title ILIKE ${'%' + search + '%'} OR w."guestTeacher" ILIKE ${'%' + search + '%'}
      `;
      count = Number(countRes[0]?.count || 0);

      rawWorkshops = await prisma.$queryRaw<any[]>`
        SELECT w.id, w.title, w.description, w."totalPrice", w."guestTeacher",
          (SELECT count(*) FROM "WorkshopSession" ws WHERE ws."workshopId" = w.id) as "sessionCount",
          (SELECT count(*) FROM "WorkshopParticipant" wp WHERE wp."workshopId" = w.id) as "participantCount"
        FROM "Workshop" w
        WHERE w.title ILIKE ${'%' + search + '%'} OR w."guestTeacher" ILIKE ${'%' + search + '%'}
        ORDER BY w.id DESC
        LIMIT ${ITEM_PER_PAGE} OFFSET ${ITEM_PER_PAGE * (p - 1)}
      `;
    } else {
      const countRes = await prisma.$queryRaw<Array<{ count: string | number | bigint }>>`
        SELECT count(*) FROM "Workshop"
      `;
      count = Number(countRes[0]?.count || 0);

      rawWorkshops = await prisma.$queryRaw<any[]>`
        SELECT w.id, w.title, w.description, w."totalPrice", w."guestTeacher",
          (SELECT count(*) FROM "WorkshopSession" ws WHERE ws."workshopId" = w.id) as "sessionCount",
          (SELECT count(*) FROM "WorkshopParticipant" wp WHERE wp."workshopId" = w.id) as "participantCount"
        FROM "Workshop" w
        ORDER BY w.id DESC
        LIMIT ${ITEM_PER_PAGE} OFFSET ${ITEM_PER_PAGE * (p - 1)}
      `;
    }

    workshops = rawWorkshops.map((w) => ({
      id: w.id,
      title: w.title,
      description: w.description || "",
      price: Number(w.totalPrice || 0),
      teacherName: w.guestTeacher || t("unspecified"),
      _count: {
        sessions: Number(w.sessionCount || 0),
        participants: Number(w.participantCount || 0),
      },
    }));
  } catch (err) {
    console.error("Error fetching workshops:", err);
    workshops = [];
    count = 0;
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <PageHeader
        title={t("title")}
        searchPlaceholder={t("searchPlaceholder")}
        createAction={
          role === "admin" ? { table: "workshop", type: "create" } : null
        }
      />

      {workshops.length > 0 ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
            {workshops.map((workshop) => (
              <Card
                key={workshop.id}
                className="flex flex-col hover:border-primary/40 transition-colors overflow-hidden"
              >
                <Link
                  href={`/list/workshops/${workshop.id}`}
                  className="block p-6 flex-grow hover:bg-surface-subtle transition-colors"
                >
                  <div className="flex items-center justify-between gap-4 mb-4">
                    <div className="flex items-center gap-3">
                      <div className="bg-primary/10 p-3 rounded-full">
                        <Image
                          src="/lesson.png"
                          alt="workshop icon"
                          width={24}
                          height={24}
                        />
                      </div>
                      <h2 className="text-card-title font-bold text-gray-900">
                        {workshop.title}
                      </h2>
                    </div>
                    <Badge variant="primary" size="sm">
                      {workshop.price.toLocaleString(locale === "ar" ? "ar-DZ" : "fr-DZ")} DZD
                    </Badge>
                  </div>
                  <p className="text-sm text-gray-600 mb-4 h-10 overflow-hidden line-clamp-2">
                    {workshop.description}
                  </p>
                  <div className="text-xs space-y-2 text-gray-600 border-t border-border pt-4">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">{t("teacher")}:</span>
                      <span className="font-semibold text-gray-800">{workshop.teacherName}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">{t("scheduleTitle")}:</span>
                      <Badge variant="neutral" size="sm">
                        {t("sessionsCount", { count: workshop._count.sessions })}
                      </Badge>
                    </div>
                    {role === "admin" && (
                      <div className="flex items-center justify-between">
                        <span className="text-gray-500">{t("roster")}:</span>
                        <Badge variant="secondary" size="sm">
                          {t("participantsCount", { count: workshop._count.participants })}
                        </Badge>
                      </div>
                    )}
                  </div>
                </Link>
                <div className="border-t border-border p-3 bg-surface-subtle flex items-center justify-between gap-2">
                  <Link
                    href={`/list/attendance/workshop/${workshop.id}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                  >
                    <Image src="/attendance.png" alt="" width={14} height={14} />
                    <span>{locale === "ar" ? "الحضور" : "Présences"}</span>
                  </Link>
                  {role === "admin" && (
                    <div className="flex items-center gap-2">
                      <FormContainer
                        table="workshop"
                        type="update"
                        data={workshop}
                      />
                      <FormContainer
                        table="workshop"
                        type="delete"
                        id={workshop.id}
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

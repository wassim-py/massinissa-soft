import FormContainer from "@/components/FormContainer";
import Pagination from "@/components/Pagination";
import prisma from "@/lib/prisma";
import { ITEM_PER_PAGE, canUserAccessBranch } from "@/lib/settings";
import { getAuthSession } from "@/lib/auth";
import PageHeader from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/Card";
import { DataTable, Column } from "@/components/ui/DataTable";
import { Badge } from "@/components/ui/Badge";
import { FilterTabs } from "@/components/ui/FilterTabs";
import { getTranslations, getLocale } from "next-intl/server";
import Link from "next/link";
import { Building2 } from "lucide-react";
import { Prisma } from "@prisma/client";
import ClassStatusToggleButton from "@/components/groups/ClassStatusToggleButton";
import { normalizeClassFilterStatus, isClassInactive } from "@/lib/classStatus";

type ClassItem = {
  id: number;
  name: string;
  teacherId: string | null;
  teacherName: string | null;
  branchId: number;
  branchName: string;
  price: number;
  pricePerCycle: number | null;
  inscriptionFee: number;
  gradeId: number;
  grade: { level: string };
  levelId?: number | null;
  levelName?: string | null;
  supervisor: null;
  hasBooks?: boolean;
  bookFee?: number | null;
  isPaused?: boolean;
  pausedAt?: string | null;
  isCompleted?: boolean;
  completedAt?: string | null;
};

const ClassListPage = async (
  props: {
    searchParams: Promise<{ [key: string]: string | undefined }>;
  }
) => {
  const searchParams = await props.searchParams;
  const session = await getAuthSession();
  const isOwner = session.isOwner;
  const canManage = session.isOwner || session.isBranchAdmin || session.isOwnerOrAdmin;
  const canViewPayments = canManage;

  const t = await getTranslations("classes");
  const locale = await getLocale();

  if (!session.can("view", "classes")) {
    return (
      <Card className="p-8 text-center max-w-md mx-auto my-8">
        <div className="flex flex-col items-center gap-3">
          <Badge variant="danger" size="md" withDot>
            {t("unauthorized")}
          </Badge>
          <p className="text-table-body text-muted">
            {t("unauthorizedDesc")}
          </p>
        </div>
      </Card>
    );
  }

  // Columns: group name, teacher name, branch, price for 4-session cycle, status (and actions for admins)
  const columns: Column<ClassItem>[] = [
    { header: t("groupName"), accessor: "name" },
    { header: t("teacherName"), accessor: "teacherName" as any },
    { header: t("branch"), accessor: "branchName" as any, className: "hidden md:table-cell" },
    { header: t("pricePerCycle"), accessor: "pricePerCycle" as any, className: "hidden md:table-cell" },
    { header: locale === "ar" ? "الحالة" : "Statut", accessor: "isPaused" as any },
    ...(canViewPayments || canManage
      ? [{ header: t("actions"), accessor: "action" as const, align: "end" as const }]
      : []),
  ];

  const renderRow = (item: ClassItem) => {
    const canActOnItem =
      session.isOwner ||
      (canManage &&
        (session.branchIds.length === 0 ||
          canUserAccessBranch(session.rawRole, session.branchIds, item.branchId)));

    const inactive = isClassInactive(item);

    return (
      <tr
        key={item.id}
        className={`border-b border-border/60 hover:bg-surface-subtle/80 transition-colors text-table-body ${
          inactive ? "bg-amber-50/20" : ""
        }`}
      >
        <td className="p-3.5 font-semibold text-gray-900">
          <Link
            href={`/list/payments/class/${item.id}`}
            className="hover:text-primary hover:underline transition-colors block"
            title={t("paymentRecordsTooltip")}
          >
            {item.name}
          </Link>
        </td>
        <td className="p-3.5 text-muted-dark">
          {item.teacherName ? (
            <span className="font-medium text-gray-800">{item.teacherName}</span>
          ) : (
            <span className="text-muted text-xs">—</span>
          )}
        </td>
        <td className="hidden md:table-cell p-3.5">
          <Badge variant="primary" size="sm">
            <Building2 className="w-3 h-3 inline me-1" />
            {item.branchName || t("branchFallback", { id: item.branchId })}
          </Badge>
        </td>
        <td className="hidden md:table-cell p-3.5 font-semibold text-gray-900 font-mono">
          {item.pricePerCycle ? `${item.pricePerCycle} ${t("currency")}` : "-"}
        </td>
        <td className="p-3.5">
          {inactive ? (
            <Badge variant="warning" size="sm" withDot>
              {locale === "ar" ? "مغلق / متوقف" : "Fermé / En pause"}
            </Badge>
          ) : (
            <Badge variant="success" size="sm" withDot>
              {locale === "ar" ? "نشط" : "Actif"}
            </Badge>
          )}
        </td>
        {(canViewPayments || canManage) && (
          <td className="text-end pe-3.5">
            <div className="flex items-center justify-end gap-2 flex-wrap">
              <Link
                href={`/list/payments/class/${item.id}`}
                className="px-2 py-1 text-xs font-semibold rounded-lg bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 transition-colors whitespace-nowrap"
                title={t("paymentRecordsTooltip")}
              >
                {t("paymentRecords")}
              </Link>
              <Link
                href={`/list/classes/${item.id}?tab=books`}
                className="px-2 py-1 text-xs font-semibold rounded-lg bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200 transition-colors whitespace-nowrap"
                title={t("booksTooltip")}
              >
                {t("books")}
              </Link>
              {isOwner && (
                <ClassStatusToggleButton
                  classId={item.id}
                  groupName={item.name}
                  isPaused={item.isPaused}
                  isCompleted={item.isCompleted}
                  pausedAt={item.pausedAt}
                  completedAt={item.completedAt}
                  isOwner={isOwner}
                />
              )}
              {canActOnItem && (
                <>
                  <FormContainer table="class" type="update" data={item} />
                  <FormContainer table="class" type="delete" id={item.id} />
                </>
              )}
            </div>
          </td>
        )}
      </tr>
    );
  };

  const { page, search, status } = searchParams;
  const activeStatus = normalizeClassFilterStatus(status);
  const p = page ? parseInt(page, 10) : 1;

  const createStatusFilterUrl = (targetStatus: "active" | "inactive" | "all") => {
    const params = new URLSearchParams();
    if (targetStatus !== "active") {
      params.set("status", targetStatus);
    }
    if (search) {
      params.set("search", search);
    }
    const qs = params.toString();
    return qs ? `/list/classes?${qs}` : "/list/classes";
  };

  let data: ClassItem[] = [];
  let count = 0;
  let activeCount = 0;
  let inactiveCount = 0;
  let allCount = 0;

  try {
    const searchSql = search
      ? Prisma.sql`(c.name ILIKE ${"%" + search + "%"} OR t.name ILIKE ${"%" + search + "%"})`
      : Prisma.sql`TRUE`;

    const activeSql = Prisma.sql`((c."isCompleted" = false OR c."isCompleted" IS NULL) AND (c."isPaused" = false OR c."isPaused" IS NULL))`;
    const inactiveSql = Prisma.sql`(c."isCompleted" = true OR c."isPaused" = true)`;

    const statusSql =
      activeStatus === "active"
        ? activeSql
        : activeStatus === "inactive"
        ? inactiveSql
        : Prisma.sql`TRUE`;

    const [activeCountRes, inactiveCountRes, rows] = await Promise.all([
      prisma.$queryRaw<Array<{ count: string | number | bigint }>>`
        SELECT count(*) FROM "Class" c
        LEFT JOIN "Teacher" t ON t.id = c."teacherId"
        WHERE ${searchSql} AND ${activeSql}
      `,
      prisma.$queryRaw<Array<{ count: string | number | bigint }>>`
        SELECT count(*) FROM "Class" c
        LEFT JOIN "Teacher" t ON t.id = c."teacherId"
        WHERE ${searchSql} AND ${inactiveSql}
      `,
      prisma.$queryRaw<Array<any>>`
        SELECT c.id, c.name, c."branchId", b.name as "branchName",
               c."teacherId",
               COALESCE(t.name, lt.teacher_name) as "teacherName",
               c."pricePerCycle", c."inscriptionFee",
               c."levelId", lvl.name as "levelName",
               c."hasBooks", c."bookFee",
               c."isPaused", c."pausedAt", c."isCompleted", c."completedAt"
        FROM "Class" c
        LEFT JOIN "Branch" b ON b.id = c."branchId"
        LEFT JOIN "Teacher" t ON t.id = c."teacherId"
        LEFT JOIN "Level" lvl ON lvl.id = c."levelId"
        LEFT JOIN LATERAL (
          SELECT t2.name as teacher_name
          FROM "Lesson" l
          JOIN "Teacher" t2 ON t2.id = l."teacherId"
          WHERE l."classId" = c.id
          ORDER BY l.id ASC
          LIMIT 1
        ) lt ON true
        WHERE ${searchSql} AND ${statusSql}
        ORDER BY c.name ASC
        LIMIT ${ITEM_PER_PAGE} OFFSET ${ITEM_PER_PAGE * (p - 1)}
      `,
    ]);

    activeCount = Number(activeCountRes[0]?.count || 0);
    inactiveCount = Number(inactiveCountRes[0]?.count || 0);
    allCount = activeCount + inactiveCount;
    count =
      activeStatus === "active"
        ? activeCount
        : activeStatus === "inactive"
        ? inactiveCount
        : allCount;

    data = rows.map((r: any) => {
      const priceNum = r.pricePerCycle != null ? Number(r.pricePerCycle) : null;
      return {
        id: r.id,
        name: r.name,
        teacherId: r.teacherId,
        teacherName: r.teacherName,
        branchId: r.branchId,
        branchName: r.branchName || t("branchFallback", { id: r.branchId }),
        price: priceNum || 0,
        pricePerCycle: priceNum,
        inscriptionFee: r.inscriptionFee != null ? Number(r.inscriptionFee) : 0,
        gradeId: r.levelId || 0,
        grade: { level: r.levelName || "" },
        levelId: r.levelId,
        levelName: r.levelName,
        supervisor: null,
        hasBooks: Boolean(r.hasBooks),
        bookFee: r.bookFee != null ? Number(r.bookFee) : null,
        isPaused: Boolean(r.isPaused),
        pausedAt: r.pausedAt ? new Date(r.pausedAt).toISOString() : null,
        isCompleted: Boolean(r.isCompleted),
        completedAt: r.completedAt ? new Date(r.completedAt).toISOString() : null,
      };
    });
  } catch {
    data = [];
    count = 0;
  }

  return (
    <Card className="flex-1 w-full border-border/80 shadow-xs">
      <CardContent className="p-4 sm:p-5 md:p-6">
        <PageHeader
          title={t("title")}
          searchPlaceholder={t("searchPlaceholder")}
          createAction={canManage ? { table: "class", type: "create" } : null}
        />

        {/* Status Filter Tabs (Active / Closed & Paused / All) */}
        <div className="flex flex-wrap items-center gap-2 mb-5 pb-4 border-b border-border/70">
          <span className="text-xs font-bold text-muted ms-1">
            {locale === "ar" ? "تصفية حسب الحالة:" : "Statut :"}
          </span>
          <FilterTabs
            activeTab={activeStatus}
            tabs={[
              {
                id: "active",
                label: locale === "ar" ? "الأفواج النشطة" : "Groupes actifs",
                count: activeCount,
                href: createStatusFilterUrl("active"),
              },
              {
                id: "inactive",
                label: locale === "ar" ? "مغلقة / متوقفة" : "Fermés / En pause",
                count: inactiveCount,
                href: createStatusFilterUrl("inactive"),
              },
              {
                id: "all",
                label: locale === "ar" ? "الكل" : "Tous",
                count: allCount,
                href: createStatusFilterUrl("all"),
              },
            ]}
          />
        </div>

        <DataTable
          columns={columns}
          renderRow={renderRow}
          data={data}
          emptyTitle={t("noGroups")}
          emptyDescription={t("noGroupsDesc")}
          pagination={<Pagination count={count} />}
        />
      </CardContent>
    </Card>
  );
};

export default ClassListPage;

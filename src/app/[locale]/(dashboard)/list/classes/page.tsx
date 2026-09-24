import FormContainer from "@/components/FormContainer";
import Pagination from "@/components/Pagination";
import prisma from "@/lib/prisma";
import { ITEM_PER_PAGE } from "@/lib/settings";
import { getAuthSession } from "@/lib/auth";
import PageHeader from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/Card";
import { DataTable, Column } from "@/components/ui/DataTable";
import { Badge } from "@/components/ui/Badge";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Building2 } from "lucide-react";

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
};

const ClassListPage = async (
  props: {
    searchParams: Promise<{ [key: string]: string | undefined }>;
  }
) => {
  const searchParams = await props.searchParams;
  const session = await getAuthSession();
  const isOwner = session.isOwner;
  const canViewPayments = session.isOwner || session.isBranchAdmin;

  const t = await getTranslations("classes");

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

  // Columns: group name, teacher name, branch, price for 4-session cycle (and actions for admins)
  const columns: Column<ClassItem>[] = [
    { header: t("groupName"), accessor: "name" },
    { header: t("teacherName"), accessor: "teacherName" as any },
    { header: t("branch"), accessor: "branchName" as any, className: "hidden md:table-cell" },
    { header: t("pricePerCycle"), accessor: "pricePerCycle" as any, className: "hidden md:table-cell" },
    ...(canViewPayments
      ? [{ header: t("actions"), accessor: "action" as const, align: "end" as const }]
      : []),
  ];

  const renderRow = (item: ClassItem) => (
    <tr
      key={item.id}
      className="border-b border-border/60 hover:bg-surface-subtle/80 transition-colors text-table-body"
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
      {canViewPayments && (
        <td className="text-end pe-3.5">
          <div className="flex items-center justify-end gap-2">
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

  const { page, search } = searchParams;
  const p = page ? parseInt(page, 10) : 1;

  let data: ClassItem[] = [];
  let count = 0;

  try {
    let countRes: Array<{ count: string | number | bigint }>;
    let rows: Array<{
      id: number;
      name: string;
      branchId: number;
      branchName: string | null;
      teacherId: string | null;
      teacherName: string | null;
      pricePerCycle: number | null;
      inscriptionFee: number;
      levelId: number | null;
      levelName: string | null;
    }>;

    if (search) {
      const pattern = `%${search}%`;
      countRes = await prisma.$queryRaw<Array<{ count: string | number | bigint }>>`
        SELECT count(*) FROM "Class" c
        LEFT JOIN "Teacher" t ON t.id = c."teacherId"
        WHERE c.name ILIKE ${pattern} OR t.name ILIKE ${pattern}
      `;
      rows = await prisma.$queryRaw<typeof rows>`
        SELECT c.id, c.name, c."branchId", b.name as "branchName",
               c."teacherId",
               COALESCE(t.name, lt.teacher_name) as "teacherName",
               c."pricePerCycle", c."inscriptionFee",
               c."levelId", lvl.name as "levelName"
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
        WHERE c.name ILIKE ${pattern} OR t.name ILIKE ${pattern}
        ORDER BY c.name ASC
        LIMIT ${ITEM_PER_PAGE} OFFSET ${ITEM_PER_PAGE * (p - 1)}
      `;
    } else {
      countRes = await prisma.$queryRaw<Array<{ count: string | number | bigint }>>`
        SELECT count(*) FROM "Class"
      `;
      rows = await prisma.$queryRaw<typeof rows>`
        SELECT c.id, c.name, c."branchId", b.name as "branchName",
               c."teacherId",
               COALESCE(t.name, lt.teacher_name) as "teacherName",
               c."pricePerCycle", c."inscriptionFee",
               c."levelId", lvl.name as "levelName"
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
        ORDER BY c.name ASC
        LIMIT ${ITEM_PER_PAGE} OFFSET ${ITEM_PER_PAGE * (p - 1)}
      `;
    }

    count = Number(countRes[0]?.count || 0);

    data = rows.map((r) => {
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
          createAction={isOwner ? { table: "class", type: "create" } : null}
        />

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

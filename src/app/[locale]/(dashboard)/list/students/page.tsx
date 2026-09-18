import Pagination from "@/components/Pagination";
import prisma from "@/lib/prisma";
import { ITEM_PER_PAGE } from "@/lib/settings";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import PageHeader from "@/components/PageHeader";
import FormContainer from "@/components/FormContainer";
import ExportButton from "@/components/ExportButton";
import { getTranslations } from "next-intl/server";
import { Card, CardContent } from "@/components/ui/Card";
import { DataTable, Column } from "@/components/ui/DataTable";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

type StudentList = {
  id: string;
  globalNumber: number;
  name: string;
  phone: string | null;
  level: string;
  classes: { id: number; name: string }[];
  registeredBranchId: number;
  branchName?: string | null;
};

const StudentListPage = async (props: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ [key: string]: string | undefined }>;
}) => {
  const searchParams = await props.searchParams;

  const t = await getTranslations("students");
  const tSearch = await getTranslations("search");

  // Exact column order: ID number → full name → level → groups enrolled in → phone number → actions (view profile, delete)
  const columns: Column<StudentList>[] = [
    { header: t("idNumber"), accessor: "globalNumber" },
    { header: t("fullName"), accessor: "name" },
    { header: t("level"), accessor: "level" },
    { header: t("groupsEnrolled"), accessor: "classes" },
    { header: t("phone"), accessor: "phone" },
    { header: t("action"), accessor: "action", align: "end" },
  ];

  const renderRow = (item: StudentList) => (
    <tr
      key={item.id}
      className="border-b border-border/60 hover:bg-surface-subtle/80 transition-colors text-table-body"
    >
      {/* 1. ID Number (permanent globalNumber from §2.10) */}
      <td className="p-3.5 font-mono text-xs font-semibold text-gray-900">
        <span className="bg-surface-subtle px-2.5 py-1 rounded-md border border-border/70 text-primary font-bold inline-block">
          #{item.globalNumber}
        </span>
      </td>

      {/* 2. Full Name */}
      <td className="p-3.5">
        <div className="flex items-center gap-3">
          <Image
            src="/noAvatar.png"
            alt=""
            width={36}
            height={36}
            className="w-9 h-9 rounded-full object-cover border border-border shrink-0"
          />
          <span className="font-semibold text-gray-900 text-table-body">
            {item.name}
          </span>
        </div>
      </td>

      {/* 3. Level */}
      <td className="p-3.5">
        {item.level && item.level !== "-" ? (
          <div className="flex flex-wrap gap-1">
            {item.level.split(", ").map((lvl, idx) => (
              <Badge key={idx} variant="primary" size="sm">
                {lvl}
              </Badge>
            ))}
          </div>
        ) : (
          <span className="text-muted text-xs">-</span>
        )}
      </td>

      {/* 4. Groups Enrolled In */}
      <td className="p-3.5 text-muted-dark">
        {item.classes.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {item.classes.map((c) => (
              <Badge key={c.id} variant="secondary" size="sm">
                {c.name}
              </Badge>
            ))}
          </div>
        ) : (
          <span className="text-muted text-xs">-</span>
        )}
      </td>

      {/* 5. Phone Number */}
      <td className="p-3.5 text-muted-dark font-mono text-xs">
        {item.phone ? (
          <a
            href={`tel:${item.phone}`}
            className="text-primary hover:underline"
            dir="ltr"
          >
            {item.phone}
          </a>
        ) : (
          <span className="text-muted text-xs">-</span>
        )}
      </td>

      {/* 6. Actions (View Profile, Delete) - Same for both roles */}
      <td className="text-end pe-3.5 p-3.5">
        <div className="flex items-center justify-end gap-2">
          <Link href={`/list/students/${item.id}`}>
            <Button
              variant="soft"
              size="icon-sm"
              title={t("viewTitle")}
              aria-label={t("viewTitle")}
            >
              <Image src="/view.png" alt="view" width={14} height={14} />
            </Button>
          </Link>
          <FormContainer table="student" type="delete" id={item.id} />
        </div>
      </td>
    </tr>
  );

  const { page, search } = searchParams;
  const p = page ? parseInt(page, 10) : 1;
  const cleanSearch = (search || "").trim();
  const cleanNumeric = cleanSearch.replace(/[^0-9]/g, "");
  const hasNumeric = cleanNumeric.length > 0;

  let data: StudentList[] = [];
  let count = 0;

  try {
    let rows: Array<{
      id: string;
      globalNumber: number;
      name: string;
      phone: string | null;
      registeredBranchId: number;
      branchName: string | null;
      createdAt: Date;
    }> = [];

    if (cleanSearch) {
      if (hasNumeric) {
        const countRes = await prisma.$queryRaw<Array<{ count: string | number | bigint }>>`
          SELECT count(*) FROM "Student" s
          WHERE (
            s.name ILIKE ${'%' + cleanSearch + '%'}
            OR (s.phone IS NOT NULL AND s.phone ILIKE ${'%' + cleanSearch + '%'})
            OR CAST(s."globalNumber" AS TEXT) ILIKE ${'%' + cleanNumeric + '%'}
          )
        `;
        count = Number(countRes[0]?.count || 0);

        rows = await prisma.$queryRaw`
          SELECT s.id, s."globalNumber", s.name, s.phone, s."registeredBranchId", b.name as "branchName", s."createdAt"
          FROM "Student" s
          LEFT JOIN "Branch" b ON b.id = s."registeredBranchId"
          WHERE (
            s.name ILIKE ${'%' + cleanSearch + '%'}
            OR (s.phone IS NOT NULL AND s.phone ILIKE ${'%' + cleanSearch + '%'})
            OR CAST(s."globalNumber" AS TEXT) ILIKE ${'%' + cleanNumeric + '%'}
          )
          ORDER BY
            CASE
              WHEN CAST(s."globalNumber" AS TEXT) = ${cleanNumeric} THEN 0
              WHEN CAST(s."globalNumber" AS TEXT) LIKE ${cleanNumeric + '%'} THEN 1
              WHEN s.name ILIKE ${cleanSearch + '%'} THEN 2
              ELSE 3
            END,
            s."globalNumber" ASC
          LIMIT ${ITEM_PER_PAGE} OFFSET ${ITEM_PER_PAGE * (p - 1)}
        `;
      } else {
        const countRes = await prisma.$queryRaw<Array<{ count: string | number | bigint }>>`
          SELECT count(*) FROM "Student" s
          WHERE (
            s.name ILIKE ${'%' + cleanSearch + '%'}
            OR (s.phone IS NOT NULL AND s.phone ILIKE ${'%' + cleanSearch + '%'})
          )
        `;
        count = Number(countRes[0]?.count || 0);

        rows = await prisma.$queryRaw`
          SELECT s.id, s."globalNumber", s.name, s.phone, s."registeredBranchId", b.name as "branchName", s."createdAt"
          FROM "Student" s
          LEFT JOIN "Branch" b ON b.id = s."registeredBranchId"
          WHERE (
            s.name ILIKE ${'%' + cleanSearch + '%'}
            OR (s.phone IS NOT NULL AND s.phone ILIKE ${'%' + cleanSearch + '%'})
          )
          ORDER BY
            CASE
              WHEN s.name ILIKE ${cleanSearch + '%'} THEN 0
              ELSE 1
            END,
            s."globalNumber" ASC
          LIMIT ${ITEM_PER_PAGE} OFFSET ${ITEM_PER_PAGE * (p - 1)}
        `;
      }
    } else {
      const countRes = await prisma.$queryRaw<Array<{ count: string | number | bigint }>>`
        SELECT count(*) FROM "Student"
      `;
      count = Number(countRes[0]?.count || 0);

      rows = await prisma.$queryRaw`
        SELECT s.id, s."globalNumber", s.name, s.phone, s."registeredBranchId", b.name as "branchName", s."createdAt"
        FROM "Student" s
        LEFT JOIN "Branch" b ON b.id = s."registeredBranchId"
        ORDER BY s."globalNumber" ASC
        LIMIT ${ITEM_PER_PAGE} OFFSET ${ITEM_PER_PAGE * (p - 1)}
      `;
    }

    const studentIds = rows.map((r) => r.id);
    const enrollments = studentIds.length > 0
      ? await prisma.enrollment.findMany({
          where: { studentId: { in: studentIds } },
          include: {
            class: {
              include: {
                level: true,
                FormationLevel: true,
              },
            },
          },
        })
      : [];

    const enrollmentsByStudent = new Map<string, typeof enrollments>();
    for (const enr of enrollments) {
      const list = enrollmentsByStudent.get(enr.studentId) || [];
      list.push(enr);
      enrollmentsByStudent.set(enr.studentId, list);
    }

    data = rows.map((r) => {
      const sEnrollments = enrollmentsByStudent.get(r.id) || [];
      const uniqueClassesMap = new Map<number, { id: number; name: string }>();
      const levelsSet = new Set<string>();

      for (const enr of sEnrollments) {
        if (!uniqueClassesMap.has(enr.class.id)) {
          uniqueClassesMap.set(enr.class.id, { id: enr.class.id, name: enr.class.name });
        }
        const lvlName = enr.class.level?.name || enr.class.FormationLevel?.name;
        if (lvlName) {
          levelsSet.add(lvlName);
        }
      }

      const studentClasses = Array.from(uniqueClassesMap.values());
      const levelString = levelsSet.size > 0 ? Array.from(levelsSet).join(", ") : "-";

      return {
        id: r.id,
        globalNumber: r.globalNumber,
        name: r.name,
        phone: r.phone,
        level: levelString,
        classes: studentClasses,
        registeredBranchId: r.registeredBranchId,
        branchName: r.branchName,
      };
    });
  } catch (e) {
    console.error("Error fetching students list:", e);
    data = [];
    count = 0;
  }

  return (
    <Card className="flex-1 w-full border-border/80 shadow-xs">
      <CardContent className="p-4 sm:p-5 md:p-6">
        {/* PAGE HEADER - Same actions for both roles */}
        <PageHeader
          title={t("title")}
          searchPlaceholder={tSearch("studentsPlaceholder")}
          createAction={{ table: "student", type: "create" }}
        />

        {/* ACTION BAR - Same actions for both roles */}
        <div className="mb-4">
          <ExportButton type="students" />
        </div>

        {/* DATA TABLE */}
        <DataTable
          columns={columns}
          data={data}
          renderRow={renderRow}
          emptyTitle={t("noStudents")}
          emptyDescription={t("noStudentsDesc")}
          pagination={<Pagination count={count} />}
        />
      </CardContent>
    </Card>
  );
};

export default StudentListPage;

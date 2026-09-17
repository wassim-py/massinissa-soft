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

type SubjectItem = {
  id: number;
  name: string;
  teachers: Array<{ id: string; name: string }>;
};

const SubjectListPage = async (props: {
  searchParams: Promise<{ [key: string]: string | undefined }>;
}) => {
  const searchParams = await props.searchParams;
  const session = await getAuthSession();
  const isOwner = session.isOwner;
  const t = await getTranslations("subjects");
  const tCommon = await getTranslations("common");

  // Per Phase 3 access model: for branch admin, simplify the page to show only
  // subject name and teacher(s) who teach it. ALL action buttons are OWNER-ONLY.
  const columns: Column<SubjectItem>[] = [
    {
      header: t("name"),
      accessor: "name",
    },
    {
      header: t("teachers"),
      accessor: "teachers",
    },
    ...(isOwner
      ? [
          {
            header: tCommon("actions"),
            accessor: "action" as const,
            align: "end" as const,
          },
        ]
      : []),
  ];

  const renderRow = (item: SubjectItem) => (
    <tr
      key={item.id}
      className="border-b border-border/60 hover:bg-surface-subtle/80 transition-colors text-table-body"
    >
      <td className="p-3.5 font-semibold text-gray-900">{item.name}</td>
      <td className="p-3.5 text-muted-dark">
        {item.teachers && item.teachers.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {item.teachers.map((t) => (
              <Badge key={t.id} variant="neutral" size="sm">
                {t.name}
              </Badge>
            ))}
          </div>
        ) : (
          <span className="text-muted text-xs">—</span>
        )}
      </td>
      {isOwner && (
        <td className="text-end pe-3.5">
          <div className="flex items-center justify-end gap-2">
            <FormContainer table="subject" type="update" data={item} />
            <FormContainer table="subject" type="delete" id={item.id} />
          </div>
        </td>
      )}
    </tr>
  );

  const { page, search } = searchParams;
  const p = page ? parseInt(page) : 1;

  let data: SubjectItem[] = [];
  let count = 0;

  try {
    // 1. Fetch subjects/languages from shared catalog
    let countRes: Array<{ count: string | number | bigint }>;
    let rows: Array<{ id: number; name: string }>;

    if (search) {
      countRes = await prisma.$queryRaw<Array<{ count: string | number | bigint }>>`
        SELECT count(*) FROM "Language"
        WHERE name ILIKE ${'%' + search + '%'}
      `;
      rows = await prisma.$queryRaw<Array<{ id: number; name: string }>>`
        SELECT id, name FROM "Language"
        WHERE name ILIKE ${'%' + search + '%'}
        ORDER BY name ASC
        LIMIT ${ITEM_PER_PAGE} OFFSET ${ITEM_PER_PAGE * (p - 1)}
      `;
    } else {
      countRes = await prisma.$queryRaw<Array<{ count: string | number | bigint }>>`
        SELECT count(*) FROM "Language"
      `;
      rows = await prisma.$queryRaw<Array<{ id: number; name: string }>>`
        SELECT id, name FROM "Language"
        ORDER BY name ASC
        LIMIT ${ITEM_PER_PAGE} OFFSET ${ITEM_PER_PAGE * (p - 1)}
      `;
    }
    count = Number(countRes[0]?.count || 0);

    // 2. Fetch all teachers, classes, lessons, and settings across all 3 branches (unified catalog)
    const [allTeachers, allClasses, allLessons, allSettings] = await Promise.all([
      prisma.$queryRaw<Array<{ id: string; name: string }>>`
        SELECT id, name FROM "Teacher" ORDER BY name ASC
      `,
      prisma.$queryRaw<Array<{ id: number; name: string; teacherId: string | null; languageId: number | null }>>`
        SELECT c.id, c.name, c."teacherId", fl."languageId"
        FROM "Class" c
        LEFT JOIN "FormationLevel" fl ON c."formationLevelId" = fl.id
      `,
      prisma.$queryRaw<Array<{ teacherId: string; class_name: string; languageId: number | null }>>`
        SELECT l."teacherId", c.name as class_name, fl."languageId"
        FROM "Lesson" l
        JOIN "Class" c ON l."classId" = c.id
        LEFT JOIN "FormationLevel" fl ON c."formationLevelId" = fl.id
      `,
      prisma.$queryRaw<Array<{ id: string; value: string }>>`
        SELECT id, value FROM "Setting" WHERE id LIKE 'subject_teachers_%'
      `,
    ]);

    const teacherMap = new Map(allTeachers.map((t) => [t.id, t.name]));

    const explicitTeacherMap = new Map<number, string[]>();
    for (const s of allSettings) {
      try {
        const subId = parseInt(s.id.replace("subject_teachers_", ""), 10);
        const parsed = JSON.parse(s.value);
        if (Array.isArray(parsed)) {
          explicitTeacherMap.set(subId, parsed);
        }
      } catch {}
    }

    // 3. Unify teachers for each subject across all 3 branches
    data = rows.map((r) => {
      const teacherIdSet = new Set<string>();

      // A. Explicit teacher assignments saved for this subject
      const explicitIds = explicitTeacherMap.get(r.id) || [];
      explicitIds.forEach((id) => teacherIdSet.add(id));

      const langName = r.name.toLowerCase().trim();

      // B. Teachers assigned to classes belonging to this subject / formation across all branches
      allClasses.forEach((c) => {
        if (c.languageId === r.id && c.teacherId) {
          teacherIdSet.add(c.teacherId);
        }
        const classSubj = c.name.split(" - ")[0]?.toLowerCase().trim();
        if (classSubj && (classSubj.includes(langName) || langName.includes(classSubj))) {
          if (c.teacherId) teacherIdSet.add(c.teacherId);
        }
      });

      // C. Teachers assigned to lessons for this subject / formation across all branches
      allLessons.forEach((l) => {
        if (l.languageId === r.id && l.teacherId) {
          teacherIdSet.add(l.teacherId);
        }
        const classSubj = l.class_name.split(" - ")[0]?.toLowerCase().trim();
        if (classSubj && (classSubj.includes(langName) || langName.includes(classSubj))) {
          if (l.teacherId) teacherIdSet.add(l.teacherId);
        }
      });

      const teachers = Array.from(teacherIdSet)
        .map((id) => ({
          id,
          name: teacherMap.get(id) || id,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, "ar"));

      return {
        id: r.id,
        name: r.name,
        teachers,
      };
    });
  } catch (err) {
    console.error("Error fetching languages/subjects:", err);
    data = [];
    count = 0;
  }

  return (
    <Card className="flex-1 w-full border-border/80 shadow-xs">
      <CardContent className="p-4 sm:p-5 md:p-6">
        <PageHeader
          title={t("title")}
          searchPlaceholder={t("searchPlaceholder")}
          createAction={isOwner ? { table: "subject", type: "create" } : null}
        />

        {/* LIST */}
        <DataTable
          columns={columns}
          renderRow={renderRow}
          data={data}
          emptyTitle={t("noSubjects")}
          emptyDescription={t("noSubjectsDesc")}
          pagination={<Pagination count={count} />}
        />
      </CardContent>
    </Card>
  );
};

export default SubjectListPage;
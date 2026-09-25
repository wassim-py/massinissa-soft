import Pagination from "@/components/Pagination";
import prisma from "@/lib/prisma";
import Image from "next/image";
import Link from "next/link";
import { ITEM_PER_PAGE } from "@/lib/settings";
import { getAuthSession, getActiveBranchId } from "@/lib/auth";
import PageHeader from "@/components/PageHeader";
import FormContainer from "@/components/FormContainer";
import { Card, CardContent } from "@/components/ui/Card";
import { DataTable, Column } from "@/components/ui/DataTable";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import BranchAdminTeacherActions from "@/components/teachers/BranchAdminTeacherActions";
import { getTranslations, getLocale } from "next-intl/server";

type TeacherRow = {
  id: string;
  name: string;
  phone?: string | null;
  gender?: string | null;
  subjects: { name: string }[];
  classes: { id: number; name: string }[];
  books: {
    id: number;
    title: string;
    levelId: number;
    level?: { id: number; name: string } | null;
  }[];
};

const TeacherListPage = async (
  props: {
    searchParams: Promise<{ [key: string]: string | undefined }>;
  }
) => {
  const searchParams = await props.searchParams;
  const session = await getAuthSession();
  const t = await getTranslations("teachers");
  const tSearch = await getTranslations("search");
  const tCommon = await getTranslations("common");
  const locale = await getLocale();

  if (!session.can("view", "teachers")) {
    return (
      <Card className="p-8 text-center max-w-md mx-auto my-8">
        <div className="flex flex-col items-center gap-3">
          <Badge variant="danger" size="md" withDot>
            {tCommon("unauthorized")}
          </Badge>
          <p className="text-table-body text-muted">
            {locale === "ar" ? "ليس لديك صلاحية للوصول إلى هذه الصفحة." : "Vous n'avez pas l'autorisation d'accéder à cette page."}
          </p>
        </div>
      </Card>
    );
  }

  const isOwner = session.isOwner;
  const activeBranchId = await getActiveBranchId();

  // Exactly these 4 columns: Full name, Subjects taught, Groups/classes taught, Actions
  const columns: Column<TeacherRow>[] = [
    { header: locale === "ar" ? "اللقب والاسم" : "Nom et prénom", accessor: "name" },
    { header: t("subjects"), accessor: "subjects", className: "hidden md:table-cell" },
    { header: t("classes"), accessor: "classes", className: "hidden md:table-cell" },
    { header: t("actions"), accessor: "action" as const, align: "end" as const },
  ];

  const { page, search } = searchParams;
  const p = page ? parseInt(page) : 1;

  const whereClause = search
    ? {
        name: {
          contains: search,
          mode: "insensitive" as const,
        },
      }
    : {};

  let teachersData: TeacherRow[] = [];
  let count = 0;
  let levels: { id: number; name: string }[] = [];
  let activeBranchName = "";

  try {
    const levelsPromise = (prisma as any).level?.findMany
      ? (prisma as any).level.findMany({
          orderBy: { id: "asc" },
          select: { id: true, name: true },
        })
      : prisma.$queryRaw<Array<{ id: number; name: string }>>`
          SELECT id, name FROM "Level" ORDER BY id ASC
        `;

    const [rawTeachers, totalCount, allLevels, branches, subjectSettings, rawLanguages] = await Promise.all([
      prisma.teacher.findMany({
        where: whereClause,
        skip: ITEM_PER_PAGE * (p - 1),
        take: ITEM_PER_PAGE,
        orderBy: { name: "asc" },
        include: {
          classes: {
            select: { id: true, name: true },
          },
          lessons: {
            select: {
              class: {
                select: { id: true, name: true },
              },
            },
          },
          books: {
            include: {
              level: true,
            },
            orderBy: { id: "asc" },
          },
        },
      }),
      prisma.teacher.count({ where: whereClause }),
      levelsPromise,
      prisma.branch.findMany({
        select: { id: true, name: true },
      }),
      prisma.setting.findMany({
        where: { id: { startsWith: "subject_teachers_" } },
      }),
      prisma.$queryRaw<Array<{ id: number; name: string }>>`
        SELECT id, name FROM "Language" ORDER BY name ASC
      `,
    ]);

    count = totalCount;
    levels = allLevels;

    const currentBranch = branches.find((b) => b.id === activeBranchId);
    activeBranchName = currentBranch ? currentBranch.name : `الفرع ${activeBranchId}`;

    const langMap = new Map(rawLanguages.map((l) => [l.id, l.name]));
    const teacherAssignedSubjects = new Map<string, Array<{ id?: number; name: string }>>();
    for (const s of subjectSettings) {
      const subId = parseInt(s.id.replace("subject_teachers_", ""), 10);
      const subName = langMap.get(subId);
      if (!subName) continue;
      try {
        const list = JSON.parse(s.value);
        if (Array.isArray(list)) {
          for (const teacherId of list) {
            if (!teacherAssignedSubjects.has(teacherId)) {
              teacherAssignedSubjects.set(teacherId, []);
            }
            teacherAssignedSubjects.get(teacherId)!.push({ id: subId, name: subName });
          }
        }
      } catch {}
    }

    teachersData = rawTeachers.map((t) => {
      // Deduplicate classes from Class.teacherId and Lesson.teacherId
      const classMap = new Map<number, string>();
      t.classes.forEach((c) => classMap.set(c.id, c.name));
      t.lessons.forEach((l) => {
        if (l.class) classMap.set(l.class.id, l.class.name);
      });
      const classes = Array.from(classMap.entries()).map(([id, name]) => ({ id, name }));

      // Only explicit subject assignments from subject_teachers_ (classes/groups belong strictly in the Groups column)
      const subjectMap = new Map<string, { id?: number; name: string }>();
      const explicitSubjects = teacherAssignedSubjects.get(t.id) || [];
      explicitSubjects.forEach((sub) => subjectMap.set(sub.name, sub));
      const subjects = Array.from(subjectMap.values());

      return {
        id: t.id,
        name: t.name,
        phone: (t as any).phone,
        gender: (t as any).gender,
        subjects,
        classes,
        books: t.books,
      };
    });
  } catch (error) {
    console.error("Error fetching teachers list:", error);
    teachersData = [];
    count = 0;
  }

  const renderRow = (item: TeacherRow) => (
    <tr
      key={item.id}
      className="border-b border-border/60 hover:bg-surface-subtle/80 transition-colors text-table-body"
    >
      {/* 1. Full name */}
      <td className="flex items-center gap-3.5 p-3.5">
        <Image
          src="/noAvatar.png"
          alt=""
          width={38}
          height={38}
          className="w-9 h-9 rounded-full object-cover border border-border shrink-0"
        />
        <div className="flex flex-col min-w-0">
          <h4 className="text-table-body font-semibold text-gray-900 truncate">
            {item.name}
          </h4>
        </div>
      </td>

      {/* 2. Subjects taught */}
      <td className="hidden md:table-cell p-3.5">
        {item.subjects.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {item.subjects.map((sub) => (
              <Badge key={sub.name} variant="primary" size="sm">
                {sub.name}
              </Badge>
            ))}
          </div>
        ) : (
          <span className="text-muted text-xs">
            {locale === "ar" ? "لا توجد مواد مسندة" : "Aucune matière assignée"}
          </span>
        )}
      </td>

      {/* 3. Groups/classes taught */}
      <td className="hidden md:table-cell p-3.5">
        {item.classes.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {item.classes.map((cls) => (
              <Badge key={cls.id} variant="secondary" size="sm">
                {cls.name}
              </Badge>
            ))}
          </div>
        ) : (
          <span className="text-muted text-xs">
            {locale === "ar" ? "لا توجد أفواج مسندة" : "Aucun groupe assigné"}
          </span>
        )}
      </td>

      {/* 4. Actions (role-specific) */}
      <td className="text-end pe-3.5 p-3.5">
        {isOwner ? (
          /* Owner: Keep existing full edit/delete/view actions */
          <div className="flex items-center justify-end gap-2">
            <Link href={`/list/teachers/${item.id}`}>
              <Button
                variant="soft"
                size="icon-sm"
                title={locale === "ar" ? "عرض ملف الأستاذ" : "Voir le profil de l'enseignant"}
                aria-label={locale === "ar" ? "عرض ملف الأستاذ" : "Voir le profil de l'enseignant"}
              >
                <Image src="/view.png" alt="" width={14} height={14} />
              </Button>
            </Link>
            <FormContainer
              table="teacher"
              type="update"
              data={{
                id: item.id,
                name: item.name,
                phone: item.phone,
                gender: item.gender,
              }}
            />
            <FormContainer table="teacher" type="delete" id={item.id} />
          </div>
        ) : (
          /* Branch Admin: Exactly two buttons (See profile / Book Drop modal + Photocopy recording modal) */
          <BranchAdminTeacherActions
            teacher={{ id: item.id, name: item.name }}
            levels={levels}
            existingBooks={item.books.map((b) => ({
              id: b.id,
              title: b.title,
              levelId: b.levelId,
              levelName: b.level?.name,
            }))}
            activeBranchName={activeBranchName}
          />
        )}
      </td>
    </tr>
  );

  return (
    <Card className="flex-1 w-full border-border/80 shadow-xs">
      <CardContent className="p-4 sm:p-5 md:p-6">
        {/* PAGE HEADER: "Add teacher" button is strictly OWNER-ONLY, hidden for branch admins */}
        <PageHeader
          title={t("title")}
          searchPlaceholder={t("searchPlaceholder")}
          createAction={isOwner ? { table: "teacher", type: "create" } : null}
        />

        {/* DATA TABLE */}
        <DataTable
          columns={columns}
          data={teachersData}
          renderRow={renderRow}
          emptyTitle={t("noTeachers")}
          emptyDescription={t("noTeachersDesc")}
          pagination={<Pagination count={count} />}
        />
      </CardContent>
    </Card>
  );
};

export default TeacherListPage;

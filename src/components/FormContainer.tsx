import prisma from "@/lib/prisma";
import FormModal from "./FormModal";
import { getAuthSession } from "@/lib/auth";
import { serializeForClient } from "@/lib/utils";

// UPDATED: This type now includes "workshop"
export type FormContainerProps = {
  table:
    | "teacher"
    | "student"
    | "parent"
    | "subject"
    | "class"
    | "lesson"
    | "attendance"
    | "announcement"
    | "payment"
    | "workshop"
    | "formation";
  type: "create" | "update" | "delete";
  data?: any;
  id?: number | string;
  relatedData?: any;
};

const FormContainer = async ({
  table,
  type,
  data,
  id,
  relatedData,
}: FormContainerProps) => {
  const session = await getAuthSession();
  if (!session.can(type, table)) {
    return null;
  }

  let finalRelatedData = relatedData || {};
  const currentUserId = session.userId;

  if (type !== "delete" && Object.keys(finalRelatedData).length === 0) {
    try {
      switch (table) {
        case "subject": {
          const teachers = await prisma.$queryRaw<Array<{ id: string; name: string }>>`
            SELECT id, name FROM "Teacher" ORDER BY name ASC
          `;
          finalRelatedData = {
            teachers: teachers.map((t) => ({ id: t.id, name: t.name, surname: "" })),
          };
          break;
        }
        case "class": {
          const [branches, teachers] = await Promise.all([
            prisma.$queryRaw<Array<{ id: number; name: string }>>`SELECT id, name FROM "Branch" ORDER BY id ASC`,
            prisma.$queryRaw<Array<{ id: string; name: string }>>`SELECT id, name FROM "Teacher" ORDER BY name ASC`,
          ]);
          finalRelatedData = {
            grades: branches.map((b) => ({ id: b.id, level: b.name })),
            teachers: teachers.map((t) => ({ id: t.id, name: t.name, surname: "" })),
          };
          break;
        }
        case "teacher": {
          const subjects = await prisma.$queryRaw<Array<{ id: number; name: string }>>`
            SELECT id, name FROM "Language" ORDER BY name ASC
          `;
          finalRelatedData = {
            subjects: subjects.map((s) => ({ id: s.id, name: s.name })),
          };
          break;
        }
        case "student": {
          const [branches, classes] = await Promise.all([
            prisma.$queryRaw<Array<{ id: number; name: string }>>`SELECT id, name FROM "Branch" ORDER BY id ASC`,
            prisma.$queryRaw<Array<{ id: number; name: string }>>`SELECT id, name FROM "Class" ORDER BY name ASC`,
          ]);
          finalRelatedData = {
            grades: branches.map((b) => ({ id: b.id, level: b.name })),
            classes: classes.map((c) => ({ id: c.id, name: c.name })),
          };
          break;
        }
        case "parent": {
          const students = await prisma.$queryRaw<Array<{ id: string; name: string }>>`
            SELECT id, name FROM "Student" ORDER BY name ASC
          `;
          finalRelatedData = {
            students: students.map((s) => ({ id: s.id, name: s.name, surname: "" })),
          };
          break;
        }
        case "lesson": {
          const [classes, classrooms, teachers, branches] = await Promise.all([
            prisma.$queryRaw<Array<{ id: number; name: string; teacherId: string | null; branchId: number }>>`SELECT id, name, "teacherId", "branchId" FROM "Class" ORDER BY name ASC`,
            prisma.$queryRaw<Array<{ id: number; name: string; branchId: number }>>`SELECT id, name, "branchId" FROM "Classroom" ORDER BY name ASC`,
            prisma.$queryRaw<Array<{ id: string; name: string }>>`SELECT id, name FROM "Teacher" ORDER BY name ASC`,
            prisma.branch.findMany({ select: { id: true, name: true }, orderBy: { id: "asc" } }),
          ]);
          finalRelatedData = {
            subjects: [],
            classes: classes.map((c) => ({ id: c.id, name: c.name, teacherId: c.teacherId, branchId: c.branchId })),
            classrooms: classrooms.map((r) => ({ id: r.id, name: r.name, branchId: r.branchId })),
            teachers: teachers.map((t) => ({ id: t.id, name: t.name, surname: "", subjects: [] })),
            branches,
            isOwner: session.isOwner,
            userBranchId: session.branchIds[0] ?? (branches[0]?.id || 1),
          };
          break;
        }
        case "announcement": {
          const branches = await prisma.$queryRaw<Array<{ id: number; name: string }>>`
            SELECT id, name FROM "Branch" ORDER BY id ASC
          `;
          finalRelatedData = {
            branches: branches.map((b) => ({ id: b.id, name: b.name })),
            isOwner: session.isOwner,
            userBranchIds: session.branchIds,
          };
          break;
        }
        case "workshop": {
          const [teachers, students] = await Promise.all([
            prisma.$queryRaw<Array<{ id: string; name: string }>>`SELECT id, name FROM "Teacher" ORDER BY name ASC`,
            prisma.$queryRaw<Array<{ id: string; name: string }>>`SELECT id, name FROM "Student" ORDER BY name ASC`,
          ]);
          finalRelatedData = {
            teachers: teachers.map((t) => ({ id: t.id, name: t.name, surname: "" })),
            students: students.map((s) => ({ id: s.id, name: s.name, surname: "" })),
          };
          break;
        }
        case "formation": {
          const targetClassId = id || data?.id;
          let existingLevels: any[] = [];
          if (targetClassId) {
            const cls = await prisma.class.findUnique({
              where: { id: Number(targetClassId) },
              select: {
                formationLevelId: true,
                FormationLevel: {
                  select: { languageId: true },
                },
              },
            });
            if (cls?.FormationLevel?.languageId) {
              const rawLevels = await prisma.formationLevel.findMany({
                where: { languageId: cls.FormationLevel.languageId },
                include: {
                  Class: {
                    select: {
                      _count: { select: { enrollments: true } },
                    },
                  },
                },
                orderBy: { levelNumber: "asc" },
              });
              existingLevels = rawLevels.map((lvl) => ({
                id: lvl.id,
                name: lvl.name,
                levelNumber: lvl.levelNumber,
                lumpSumPrice: Number(lvl.lumpSumPrice || 0),
                enrollmentsCount: lvl.Class.reduce(
                  (sum, c) => sum + (c._count?.enrollments || 0),
                  0
                ),
              }));
            }
          }

          const [languages, branches, teachers] = await Promise.all([
            prisma.language.findMany({
              select: { id: true, name: true },
              orderBy: { name: "asc" },
            }),
            prisma.branch.findMany({
              select: { id: true, name: true },
              orderBy: { name: "asc" },
            }),
            prisma.teacher.findMany({
              select: { id: true, name: true },
              orderBy: { name: "asc" },
            }),
          ]);
          finalRelatedData = {
            languages,
            branches,
            teachers,
            levels: existingLevels,
            defaultBranchId: session.branchIds?.[0] || undefined,
          };
          break;
        }
      }
    } catch (e) {
      console.warn("Error fetching related data in FormContainer:", e);
      finalRelatedData = {};
    }
  }

  return (
    <div className="">
      <FormModal
        table={table}
        type={type}
        data={serializeForClient(data)}
        id={id}
        relatedData={serializeForClient(finalRelatedData)}
      />
    </div>
  );
};

export default FormContainer;

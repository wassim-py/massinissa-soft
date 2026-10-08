import prisma from "@/lib/prisma";
import FormModal from "./FormModal";
import { getAuthSession } from "@/lib/auth";
import { serializeForClient, splitFullName } from "@/lib/utils";

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
          const targetClassId = id || data?.id;
          let existingClass = data;
          if (!existingClass && targetClassId) {
            const cls = await prisma.class.findUnique({
              where: { id: Number(targetClassId) },
            });
            if (cls) {
              existingClass = {
                id: cls.id,
                name: cls.name,
                price: cls.pricePerCycle ? Number(cls.pricePerCycle) : 0,
                pricePerCycle: cls.pricePerCycle ? Number(cls.pricePerCycle) : 0,
                teacherId: cls.teacherId,
                supervisorId: cls.teacherId,
                levelId: cls.levelId,
                gradeId: cls.levelId,
                branchId: cls.branchId,
                hasBooks: cls.hasBooks,
                bookFee: cls.bookFee ? Number(cls.bookFee) : null,
              };
            }
          }
          const branchWhere = session.isOwner
            ? undefined
            : { id: { in: session.branchIds.concat(existingClass?.branchId ? [existingClass.branchId] : []) } };
          const [levels, teachers, branches] = await Promise.all([
            prisma.level.findMany({
              select: { id: true, name: true },
              orderBy: { id: "asc" },
            }),
            prisma.$queryRaw<Array<{ id: string; name: string }>>`SELECT id, name FROM "Teacher" ORDER BY name ASC`,
            prisma.branch.findMany({
              where: branchWhere,
              select: { id: true, name: true },
              orderBy: { name: "asc" },
            }),
          ]);
          finalRelatedData = {
            grades: levels.map((l) => ({ id: l.id, level: l.name, name: l.name })),
            teachers: teachers.map((t) => ({ id: t.id, name: t.name, surname: "" })),
            branches: branches.map((b) => ({ id: b.id, name: b.name })),
            defaultBranchId: session.branchIds?.[0] || branches[0]?.id || 1,
          };
          if (existingClass && !data) {
            data = existingClass;
          } else if (data && !data.branchId && existingClass?.branchId) {
            data = { ...data, branchId: existingClass.branchId };
          }
          break;
        }
        case "teacher": {
          const targetTeacherId = (id || data?.id) as string | undefined;
          let teacherSubjectIds: number[] = [];
          if (targetTeacherId) {
            const allSettings = await prisma.setting.findMany({
              where: { id: { startsWith: "subject_teachers_" } },
            });
            for (const s of allSettings) {
              try {
                const list = JSON.parse(s.value);
                if (Array.isArray(list) && list.includes(targetTeacherId)) {
                  const subId = parseInt(s.id.replace("subject_teachers_", ""), 10);
                  if (!isNaN(subId)) teacherSubjectIds.push(subId);
                }
              } catch {}
            }
          }
          const subjects = await prisma.$queryRaw<Array<{ id: number; name: string }>>`
            SELECT id, name FROM "Language" ORDER BY name ASC
          `;
          finalRelatedData = {
            subjects: subjects.map((s) => ({ id: s.id, name: s.name })),
          };
          if (data && targetTeacherId) {
            data = {
              ...data,
              subjects: teacherSubjectIds,
            };
          }
          break;
        }
        case "student": {
          const targetStudentId = (id || data?.id) as string | undefined;
          let existingStudent = data;
          if (!existingStudent && targetStudentId) {
            const st = await prisma.student.findUnique({
              where: { id: String(targetStudentId) },
              include: { parentPhoneNumbers: true, enrollments: true },
            });
            if (st) {
              existingStudent = {
                id: st.id,
                name: st.name,
                phone: st.phone,
                address: st.address,
                birthday: st.birthday,
                sex: st.sex,
                familyId: st.familyId,
                registeredBranchId: st.registeredBranchId,
                parentPhoneNumbers: st.parentPhoneNumbers.map((p) => p.phone),
                classes: st.enrollments.map((e) => e.classId),
              };
            }
          }
          const [levels, classes, families] = await Promise.all([
            prisma.level.findMany({
              select: { id: true, name: true },
              orderBy: { id: "asc" },
            }),
            prisma.class.findMany({
              select: {
                id: true,
                name: true,
                levelId: true,
                pricePerCycle: true,
                inscriptionFee: true,
                bookFee: true,
                hasBooks: true,
                branchId: true,
              },
              orderBy: { name: "asc" },
            }),
            prisma.family.findMany({
              select: {
                id: true,
                name: true,
                discountPercentage: true,
                students: {
                  select: { id: true, name: true },
                },
              },
              orderBy: { id: "desc" },
            }),
          ]);
          finalRelatedData = {
            grades: levels.map((l) => ({ id: l.id, level: l.name, name: l.name })),
            classes: classes.map((c) => ({
              id: c.id,
              name: c.name,
              levelId: c.levelId,
              price: Number(c.pricePerCycle || 0),
              pricePerCycle: Number(c.pricePerCycle || 0),
              inscriptionFee: Number(c.inscriptionFee || 0),
              bookFee: Number(c.bookFee || 0),
              hasBooks: Boolean(c.hasBooks),
              branchId: c.branchId,
            })),
            families: families.map((f) => ({
              id: f.id,
              name: f.name || `Famille #${f.id}`,
              discountPercentage: Number(f.discountPercentage || 50),
              studentNames: f.students.map((s) => s.name).join(", "),
            })),
          };
          if (existingStudent && !data) {
            data = existingStudent;
          }
          break;
        }
        case "parent": {
          const students = await prisma.$queryRaw<Array<{ id: string; name: string }>>`
            SELECT id, name FROM "Student" ORDER BY name ASC
          `;
          finalRelatedData = {
            students: students.map((s) => {
              const { surname, name: firstName } = splitFullName(s.name);
              return {
                id: s.id,
                name: firstName,
                surname: surname,
                fullName: s.name,
              };
            }),
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
          const targetId = id || data?.id;
          let existingLevels: any[] = [];
          if (targetId) {
            let languageId: number | null = null;
            const cls = await prisma.class.findUnique({
              where: { id: Number(targetId) },
              select: {
                formationLevelId: true,
                FormationLevel: {
                  select: { languageId: true },
                },
              },
            });
            if (cls?.FormationLevel?.languageId) {
              languageId = cls.FormationLevel.languageId;
            } else {
              const lang = await prisma.language.findUnique({
                where: { id: Number(targetId) },
                select: { id: true },
              });
              if (lang) {
                languageId = lang.id;
              }
            }

            if (languageId) {
              const rawLevels = await prisma.formationLevel.findMany({
                where: { languageId },
                include: {
                  Class: {
                    select: {
                      id: true,
                      teacherId: true,
                      isCompleted: true,
                      _count: { select: { enrollments: true } },
                    },
                  },
                },
                orderBy: { levelNumber: "asc" },
              });
              existingLevels = rawLevels.map((lvl) => {
                const activeClass = lvl.Class.find((c) => !c.isCompleted) || lvl.Class[0];
                return {
                  id: lvl.id,
                  name: lvl.name,
                  levelNumber: lvl.levelNumber,
                  lumpSumPrice: Number(lvl.lumpSumPrice || 0),
                  teacherId: activeClass?.teacherId || "",
                  enrollmentsCount: lvl.Class.reduce(
                    (sum, c) => sum + (c._count?.enrollments || 0),
                    0
                  ),
                };
              });
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

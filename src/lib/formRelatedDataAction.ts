"use server";

import prisma from "@/lib/prisma";
import { getAuthSession } from "@/lib/auth";
import { serializeForClient, splitFullName } from "@/lib/utils";
import {
  getCachedBranches,
  getCachedFormationInscriptionFee,
  getCachedLanguages,
  getCachedLevels,
} from "@/lib/cachedReferenceData";

export type FormTableName =
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

export async function getFormRelatedDataAction(params: {
  table: FormTableName;
  type: "create" | "update";
  id?: number | string;
  data?: any;
}): Promise<{ relatedData: any; data?: any }> {
  const { table, type, id } = params;
  let data = params.data;

  const session = await getAuthSession();
  if (!session.can(type, table)) {
    return { relatedData: {}, data };
  }

  let finalRelatedData: Record<string, any> = {};

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
        const allowedBranchIds = session.isOwner
          ? null
          : new Set(session.branchIds.concat(existingClass?.branchId ? [existingClass.branchId] : []));
        const [levels, teachers, allBranches] = await Promise.all([
          getCachedLevels(),
          prisma.$queryRaw<Array<{ id: string; name: string }>>`SELECT id, name FROM "Teacher" ORDER BY name ASC`,
          getCachedBranches(),
        ]);
        const branches = (allowedBranchIds
          ? allBranches.filter((b) => allowedBranchIds.has(b.id))
          : allBranches
        )
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name));
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
        const [allSettings, languages] = await Promise.all([
          targetTeacherId
            ? prisma.setting.findMany({
                where: { id: { startsWith: "subject_teachers_" } },
              })
            : Promise.resolve([]),
          getCachedLanguages(),
        ]);
        const teacherSubjectIds: number[] = [];
        if (targetTeacherId) {
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
        const subjects = languages
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name));
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
        const [stRecord, levels, classes, families] = await Promise.all([
          !data && targetStudentId
            ? prisma.student.findUnique({
                where: { id: String(targetStudentId) },
                include: { parentPhoneNumbers: true, enrollments: true },
              })
            : Promise.resolve(null),
          getCachedLevels(),
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
              isCompleted: true,
              isPaused: true,
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
        if (stRecord && !data) {
          data = {
            id: stRecord.id,
            name: stRecord.name,
            phone: stRecord.phone,
            address: stRecord.address,
            birthday: stRecord.birthday,
            sex: stRecord.sex,
            familyId: stRecord.familyId,
            registeredBranchId: stRecord.registeredBranchId,
            parentPhoneNumbers: stRecord.parentPhoneNumbers.map((p) => p.phone),
            classes: stRecord.enrollments
              .filter(
                (e) =>
                  e.status !== "TRANSFERRED" &&
                  e.status !== "UNENROLLED" &&
                  e.status !== "REFUNDED" &&
                  e.status !== "INACTIVE"
              )
              .map((e) => e.classId),
          };
        }
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
            isInactive: Boolean(c.isCompleted || c.isPaused),
          })),
          families: families.map((f) => ({
            id: f.id,
            name: f.name || `Famille #${f.id}`,
            discountPercentage: Number(f.discountPercentage || 50),
            studentNames: f.students.map((s) => s.name).join(", "),
          })),
        };
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
        const targetLessonId = id || data?.id ? Number(id || data?.id) : null;
        const existingLessonClassId = Number(data?.classId || -1);
        const [groups, classes, classrooms, teachers, branches] = await Promise.all([
          targetLessonId
            ? prisma.lessonGroup.findMany({
                where: { lessonId: targetLessonId },
                select: { classId: true },
              })
            : Promise.resolve([]),
          prisma.$queryRaw<
            Array<{
              id: number;
              name: string;
              teacherId: string | null;
              branchId: number;
              levelId: number | null;
              formationLevelId: number | null;
            }>
          >`
            SELECT id, name, "teacherId", "branchId", "levelId", "formationLevelId"
            FROM "Class"
            WHERE (("isCompleted" = false OR "isCompleted" IS NULL) AND ("isPaused" = false OR "isPaused" IS NULL))
               OR id = ${existingLessonClassId}
            ORDER BY name ASC
          `,
          prisma.$queryRaw<Array<{ id: number; name: string; branchId: number }>>`SELECT id, name, "branchId" FROM "Classroom" ORDER BY name ASC`,
          prisma.$queryRaw<Array<{ id: string; name: string }>>`SELECT id, name FROM "Teacher" ORDER BY name ASC`,
          getCachedBranches(),
        ]);
        const existingAdditionalClassIds = groups.map((g) => g.classId);
        finalRelatedData = {
          subjects: [],
          classes: classes.map((c) => ({
            id: c.id,
            name: c.name,
            teacherId: c.teacherId,
            branchId: c.branchId,
            levelId: c.levelId,
            formationLevelId: c.formationLevelId,
          })),
          classrooms: classrooms.map((r) => ({ id: r.id, name: r.name, branchId: r.branchId })),
          teachers: teachers.map((t) => ({ id: t.id, name: t.name, surname: "", subjects: [] })),
          branches: branches.map((b) => ({ id: b.id, name: b.name })),
          isOwner: session.isOwner,
          userBranchId: session.branchIds[0] ?? (branches[0]?.id || 1),
        };
        if (data && existingAdditionalClassIds.length > 0) {
          data = {
            ...data,
            additionalClassIds: existingAdditionalClassIds.filter((cid) => cid !== data.classId),
          };
        }
        break;
      }
      case "announcement": {
        const branches = await getCachedBranches();
        finalRelatedData = {
          branches: branches.map((b) => ({ id: b.id, name: b.name })),
          isOwner: session.isOwner,
          userBranchIds: session.branchIds,
        };
        break;
      }
      case "workshop": {
        const [allBranches, teachers, workshopDetails] = await Promise.all([
          getCachedBranches(),
          prisma.teacher.findMany({
            select: { id: true, name: true },
            orderBy: { name: "asc" },
          }),
          type === "update" && id
            ? prisma.workshop.findUnique({
                where: { id: Number(id) },
                include: {
                  sessions: { orderBy: { startsAt: "asc" } },
                },
              })
            : Promise.resolve(null),
        ]);
        const branches = allBranches
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((b) => ({ id: b.id, name: b.name }));
        finalRelatedData = {
          branches,
          teachers,
          isOwner: session.isOwner,
          defaultBranchId: session.branchIds?.[0] || branches[0]?.id || 1,
          workshopDetails,
        };
        break;
      }
      case "formation": {
        const targetId = id || data?.id;
        let existingLevels: any[] = [];
        const [languages, allBranches, teachers, defaultFormationFee] = await Promise.all([
          getCachedLanguages(),
          getCachedBranches(),
          prisma.teacher.findMany({
            select: { id: true, name: true },
            orderBy: { name: "asc" },
          }),
          getCachedFormationInscriptionFee(),
        ]);

        if (targetId || data?.languageId) {
          let languageId: number | null = data?.languageId ? Number(data.languageId) : null;

          if (!languageId && targetId) {
            const cls = await prisma.class.findUnique({
              where: { id: Number(targetId) },
              select: {
                isFormation: true,
                formationLevelId: true,
                FormationLevel: {
                  select: { languageId: true },
                },
              },
            });
            if (cls?.isFormation && cls.FormationLevel?.languageId) {
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
          }

          if (languageId) {
            const rawLevels = await prisma.formationLevel.findMany({
              where: { languageId },
              include: {
                Class: {
                  where: { isFormation: true },
                  select: {
                    id: true,
                    name: true,
                    branchId: true,
                    teacherId: true,
                    ageGroup: true,
                    isCompleted: true,
                    isPaused: true,
                    _count: {
                      select: {
                        enrollments: {
                          where: {
                            status: { notIn: ["TRANSFERRED", "UNENROLLED"] },
                          },
                        },
                        vouchers: {
                          where: { isVoided: false },
                        },
                      },
                    },
                  },
                  orderBy: { id: "asc" },
                },
              },
              orderBy: { levelNumber: "asc" },
            });
            existingLevels = rawLevels.map((lvl) => {
              const activeClass =
                lvl.Class.find((c) => !c.isCompleted && !c.isPaused) || lvl.Class[0];
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
                groups: lvl.Class.map((c) => ({
                  id: c.id,
                  name: c.name,
                  branchId: c.branchId,
                  teacherId: c.teacherId || "",
                  ageGroup: c.ageGroup || "Adultes (15+ ans)",
                  isCompleted: Boolean(c.isCompleted),
                  isPaused: Boolean(c.isPaused),
                  enrollmentsCount: c._count?.enrollments || 0,
                  activeVouchersCount: c._count?.vouchers || 0,
                })),
              };
            });
          }
        }

        const sortedLanguages = languages
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name));
        const sortedBranches = allBranches
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((b) => ({ id: b.id, name: b.name }));

        finalRelatedData = {
          languages: sortedLanguages,
          branches: sortedBranches,
          teachers,
          levels: existingLevels,
          defaultBranchId: session.branchIds?.[0] || undefined,
          defaultInscriptionFee: defaultFormationFee,
        };
        break;
      }
    }
  } catch (e) {
    console.warn("Error fetching related data in getFormRelatedDataAction:", e);
    finalRelatedData = {};
  }

  return {
    relatedData: serializeForClient(finalRelatedData),
    data: serializeForClient(data),
  };
}

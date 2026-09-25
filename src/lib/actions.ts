"use server";

import { revalidatePath } from "next/cache";

const safeRevalidatePath = (path: string) => {
  try {
    revalidatePath(path);
    revalidatePath(`/[locale]${path}`, "page");
    revalidatePath(`/ar${path}`);
    revalidatePath(`/fr${path}`);
    revalidatePath("/", "layout");
  } catch {
    // Ignore outside Next.js request contexts (e.g., CLI / test scripts)
  }
};
import {
  ClassSchema,
  StudentSchema,
  SubjectSchema,
  TeacherSchema,
  ParentSchema,
  LessonSchema,
  AnnouncementSchema,
  PaymentSchema,
  VoucherSchema,
  VoucherEditSchema,
  VoucherSeriesSchema,
  FamilySchema,
  EnrollmentTransferSchema,
  WorkshopSchema,
  RegisterParticipantSchema,
  WorkshopPaymentSchema,
  RefundSchema,
} from "./formValidationSchemas";
import prisma from "./prisma";
import { Prisma } from "@prisma/client";
import { v2 as cloudinary } from "cloudinary";
import * as ExcelJS from "exceljs";
import { cookies } from "next/headers";
import { getAuthSession, getActiveBranchId } from "./auth";
import { canUserAccessBranch } from "./settings";
import { upsertDailyLedger, resolveLedgerType, normalizeDateToStartOfDay } from "./ledger";
import { getDailyRevenueDashboardData } from "./revenue";
import { getTranslations } from "next-intl/server";
import { classifyStudentAttendanceHistory } from "./studentBilling";

type CurrentState = { success: boolean; error: boolean; message?: string };

export const setBranchAction = async (branchId: number) => {
  try {
    const session = await getAuthSession();
    if (!session.isOwner) {
      return { success: false, error: true, message: "فقط حساب المالك يمكنه التبديل بين الفروع." };
    }
    const cookieStore = await cookies();
    cookieStore.set("x-branch-id", branchId.toString(), {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
    });
    return { success: true, error: false, message: "تم تغيير الفرع بنجاح." };
  } catch (err) {
    console.error("setBranchAction error:", err);
    return { success: false, error: true, message: "فشل في تغيير الفرع." };
  }
};

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// =================================================================
// SUBJECT ACTIONS (OWNER-ONLY per Phase 3 access model)
// =================================================================

export const createSubject = async (
  currentState: CurrentState,
  data: SubjectSchema
) => {
  try {
    const session = await getAuthSession();
    if (!session.isOwner) {
      return { success: false, error: true, message: "فقط المالك يمكنه إنشاء مادة جديدة." };
    }

    const res = await prisma.$queryRaw<Array<{ id: number }>>`
      INSERT INTO "Language" (name) VALUES (${data.name})
      RETURNING id
    `;
    const newId = res[0]?.id;

    if (newId && data.teachers && data.teachers.length > 0) {
      await prisma.setting.upsert({
        where: { id: `subject_teachers_${newId}` },
        create: {
          id: `subject_teachers_${newId}`,
          value: JSON.stringify(data.teachers),
        },
        update: {
          value: JSON.stringify(data.teachers),
        },
      });
    }

    safeRevalidatePath("/list/subjects");
    return { success: true, error: false, message: "تم انشاء المادة بنجاح." };
  } catch (err) {
    console.error(err);
    return { success: false, error: true, message: "فشل في انشاء المادة." };
  }
};

export const updateSubject = async (
  currentState: CurrentState,
  data: SubjectSchema
) => {
  try {
    const session = await getAuthSession();
    if (!session.isOwner) {
      return { success: false, error: true, message: "فقط المالك يمكنه تعديل المادة." };
    }

    if (!data.id) return { success: false, error: true, message: "لا يوجد معرف للمادة." };
    await prisma.$executeRaw`
      UPDATE "Language" SET name = ${data.name} WHERE id = ${data.id}
    `;

    if (data.teachers) {
      await prisma.setting.upsert({
        where: { id: `subject_teachers_${data.id}` },
        create: {
          id: `subject_teachers_${data.id}`,
          value: JSON.stringify(data.teachers),
        },
        update: {
          value: JSON.stringify(data.teachers),
        },
      });
    }

    safeRevalidatePath("/list/subjects");
    return { success: true, error: false, message: "تم تحديث المادة بنجاح." };
  } catch (err) {
    console.error(err);
    return { success: false, error: true, message: "فشل في تحديث المادة." };
  }
};

export const deleteSubject = async (
  currentState: CurrentState,
  data: FormData
) => {
  const id = data.get("id") as string;
  try {
    const session = await getAuthSession();
    if (!session.isOwner) {
      return { success: false, error: true, message: "فقط المالك يمكنه حذف المادة." };
    }

    const numId = parseInt(id, 10);
    if (!isNaN(numId)) {
      await prisma.$executeRaw`DELETE FROM "FormationLevel" WHERE "languageId" = ${numId}`;
      await prisma.$executeRaw`DELETE FROM "Language" WHERE id = ${numId}`;
      await prisma.setting.deleteMany({
        where: { id: `subject_teachers_${numId}` },
      });
    }

    safeRevalidatePath("/list/subjects");
    return { success: true, error: false, message: "تم حذف المادة بنجاح." };
  } catch (err) {
    console.error(err);
    return { success: false, error: true, message: "فشل في حذف المادة." };
  }
};

// =================================================================
// CLASS ACTIONS (OWNER-ONLY per Phase 3 access model)
// =================================================================

export const createClass = async (
  currentState: CurrentState,
  data: ClassSchema
) => {
  try {
    const session = await getAuthSession();
    if (!session.isOwner) {
      return { success: false, error: true, message: "Action réservée au propriétaire / فقط المالك يمكنه إنشاء فوج جديد." };
    }

    const activeBranchId = await getActiveBranchId();
    const branchId = (data as any).branchId || activeBranchId;

    if (!canUserAccessBranch(session.rawRole, session.branchIds, branchId)) {
      return { success: false, error: true, message: "Non autorisé pour cette branche / غير مصرح لك بإنشاء فوج في هذا الفرع." };
    }

    const pricePerCycle = data.price || 0;
    const teacherId = (data as any).teacherId || data.supervisorId || null;
    const levelId = data.gradeId ? Number(data.gradeId) : null;

    const bookCount = teacherId && levelId
      ? await prisma.book.count({
          where: { teacherId, levelId },
        })
      : 0;
    const hasBooks = bookCount > 0;

    await prisma.$executeRaw`
      INSERT INTO "Class" (name, "branchId", "pricePerCycle", "inscriptionFee", "hasBooks", "isFormation", "teacherId", "levelId")
      VALUES (${data.name}, ${branchId}, ${pricePerCycle}, 0, ${hasBooks}, false, ${teacherId}, ${levelId})
    `;

    safeRevalidatePath("/list/classes");
    return { success: true, error: false, message: "Groupe créé avec succès / تم إنشاء الفوج بنجاح." };
  } catch (err) {
    console.error(err);
    return { success: false, error: true, message: "Échec de création du groupe / فشل في إنشاء الفوج." };
  }
};

export const updateClass = async (
  currentState: CurrentState,
  data: ClassSchema
) => {
  try {
    const session = await getAuthSession();
    if (!session.isOwner) {
      return { success: false, error: true, message: "Action réservée au propriétaire / فقط المالك يمكنه تعديل الفوج." };
    }

    if (!data.id) return { success: false, error: true, message: "Identifiant manquant / لا يوجد معرف للفوج." };

    const existing = await prisma.$queryRaw<Array<{ branchId: number; teacherId: string | null; levelId: number | null }>>`
      SELECT "branchId", "teacherId", "levelId" FROM "Class" WHERE id = ${data.id} LIMIT 1
    `;
    if (existing.length === 0) {
      return { success: false, error: true, message: "Groupe introuvable / الفوج غير موجود." };
    }
    if (!canUserAccessBranch(session.rawRole, session.branchIds, existing[0].branchId)) {
      return { success: false, error: true, message: "Non autorisé pour cette branche / غير مصرح لك بتعديل فوج في هذا الفرع." };
    }

    const branchId = (data as any).branchId || existing[0].branchId || 1;
    if (!canUserAccessBranch(session.rawRole, session.branchIds, branchId)) {
      return { success: false, error: true, message: "Non autorisé pour cette branche / غير مصرح لك بنقل الفوج إلى هذا الفرع." };
    }

    const pricePerCycle = data.price || 0;
    const teacherId = (data as any).teacherId !== undefined
      ? (data as any).teacherId
      : data.supervisorId !== undefined
      ? data.supervisorId
      : existing[0].teacherId;
    const levelId = data.gradeId !== undefined
      ? (data.gradeId ? Number(data.gradeId) : null)
      : existing[0].levelId;

    const bookCount = teacherId && levelId
      ? await prisma.book.count({
          where: { teacherId, levelId },
        })
      : 0;
    const hasBooks = bookCount > 0;

    await prisma.$executeRaw`
      UPDATE "Class"
      SET name = ${data.name}, "branchId" = ${branchId}, "pricePerCycle" = ${pricePerCycle}, "teacherId" = ${teacherId}, "levelId" = ${levelId}, "hasBooks" = "hasBooks" OR ${hasBooks}
      WHERE id = ${data.id}
    `;

    safeRevalidatePath("/list/classes");
    safeRevalidatePath(`/list/classes/${data.id}`);
    return { success: true, error: false, message: "Groupe mis à jour avec succès / تم تحديث الفوج بنجاح." };
  } catch (err) {
    console.error(err);
    return { success: false, error: true, message: "Échec de mise à jour du groupe / فشل في تحديث الفوج." };
  }
};

export const deleteClass = async (
  currentState: CurrentState,
  data: FormData
) => {
  const id = data.get("id") as string;
  try {
    const session = await getAuthSession();
    if (!session.isOwner) {
      return { success: false, error: true, message: "Action réservée au propriétaire / فقط المالك يمكنه حذف الفوج." };
    }

    const classId = parseInt(id, 10);
    if (isNaN(classId)) {
      return { success: false, error: true, message: "Identifiant manquant / لا يوجد معرف للفوج." };
    }

    const existing = await prisma.$queryRaw<Array<{ branchId: number }>>`
      SELECT "branchId" FROM "Class" WHERE id = ${classId} LIMIT 1
    `;
    if (existing.length === 0) {
      return { success: false, error: true, message: "Groupe introuvable / الفوج غير موجود." };
    }
    if (!canUserAccessBranch(session.rawRole, session.branchIds, existing[0].branchId)) {
      return { success: false, error: true, message: "Non autorisé pour cette branche / غير مصرح لك بحذف فوج في هذا الفرع." };
    }

    await prisma.$executeRaw`DELETE FROM "Enrollment" WHERE "classId" = ${classId}`;
    await prisma.$executeRaw`DELETE FROM "Lesson" WHERE "classId" = ${classId}`;
    await prisma.$executeRaw`DELETE FROM "Class" WHERE id = ${classId}`;

    safeRevalidatePath("/list/classes");
    return { success: true, error: false, message: "Groupe supprimé avec succès / تم حذف الفوج بنجاح." };
  } catch (err) {
    console.error(err);
    return { success: false, error: true, message: "Échec de suppression du groupe / فشل في حذف الفوج." };
  }
};

// =================================================================
// TEACHER ACTIONS
// =================================================================

export const createTeacher = async (
  currentState: CurrentState,
  data: TeacherSchema
) => {
  try {
    const session = await getAuthSession();
    if (!session.isOwner) {
      return { success: false, error: true, message: "Action réservée au propriétaire / إنشاء أستاذ جديد متاح للمالك فقط." };
    }

    const id = crypto.randomUUID();
    const fullName = [data.surname, data.name].filter(Boolean).join(" ").trim();
    const phone = data.phone ? data.phone.trim() : null;
    const gender = data.gender || data.sex || null;

    await prisma.teacher.create({
      data: {
        id,
        name: fullName,
        phone,
        gender,
        photocopyRatePerPage: new Prisma.Decimal(5),
        TeacherBranch: {
          create: { branchId: 1 }
        }
      }
    });

    if (data.subjects && data.subjects.length > 0) {
      for (const subId of data.subjects) {
        const key = `subject_teachers_${subId}`;
        const existing = await prisma.setting.findUnique({ where: { id: key } });
        let list: string[] = [];
        if (existing) {
          try {
            const parsed = JSON.parse(existing.value);
            if (Array.isArray(parsed)) list = parsed;
          } catch {}
        }
        if (!list.includes(id)) {
          list.push(id);
          await prisma.setting.upsert({
            where: { id: key },
            create: { id: key, value: JSON.stringify(list) },
            update: { value: JSON.stringify(list) },
          });
        }
      }
    }

    safeRevalidatePath("/list/teachers");
    safeRevalidatePath("/list/subjects");
    return { success: true, error: false, message: "Enseignant créé avec succès / تم إنشاء الأستاذ بنجاح." };
  } catch (err: any) {
    console.error("Error in createTeacher:", err);
    return { success: false, error: true, message: err?.message || "Échec de création de l'enseignant / فشل في إنشاء الأستاذ." };
  }
};

export const updateTeacher = async (
  currentState: CurrentState,
  data: TeacherSchema
) => {
  if (!data.id) {
    return { success: false, error: true, message: "Identifiant manquant / لا يوجد معرف للأستاذ." };
  }
  try {
    const session = await getAuthSession();
    if (!session.isOwner) {
      return { success: false, error: true, message: "Action réservée au propriétaire / تعديل الأستاذ متاح للمالك فقط." };
    }

    const fullName = [data.surname, data.name].filter(Boolean).join(" ").trim();
    const updateData: any = { name: fullName };
    if (data.phone !== undefined) {
      updateData.phone = data.phone ? data.phone.trim() : null;
    }
    if (data.gender !== undefined || data.sex !== undefined) {
      updateData.gender = data.gender || data.sex || null;
    }

    await prisma.teacher.update({
      where: { id: data.id },
      data: updateData,
    });

    if (data.subjects !== undefined) {
      const allSettings = await prisma.setting.findMany({
        where: { id: { startsWith: "subject_teachers_" } },
      });
      const processedSubIds = new Set<number>();
      for (const s of allSettings) {
        const subId = parseInt(s.id.replace("subject_teachers_", ""), 10);
        if (!isNaN(subId)) {
          processedSubIds.add(subId);
          try {
            let list: string[] = JSON.parse(s.value);
            if (!Array.isArray(list)) list = [];
            const shouldHave = data.subjects.includes(subId);
            const has = list.includes(data.id);
            if (shouldHave && !has) {
              list.push(data.id);
              await prisma.setting.update({ where: { id: s.id }, data: { value: JSON.stringify(list) } });
            } else if (!shouldHave && has) {
              list = list.filter((tid) => tid !== data.id);
              await prisma.setting.update({ where: { id: s.id }, data: { value: JSON.stringify(list) } });
            }
          } catch {}
        }
      }

      for (const subId of data.subjects) {
        if (!processedSubIds.has(subId)) {
          const key = `subject_teachers_${subId}`;
          await prisma.setting.upsert({
            where: { id: key },
            create: { id: key, value: JSON.stringify([data.id]) },
            update: { value: JSON.stringify([data.id]) },
          });
        }
      }
    }

    safeRevalidatePath("/list/teachers");
    safeRevalidatePath(`/list/teachers/${data.id}`);
    safeRevalidatePath("/list/subjects");
    return { success: true, error: false, message: "Enseignant mis à jour avec succès / تم تحديث بيانات الأستاذ بنجاح." };
  } catch (err: any) {
    console.error("Error in updateTeacher:", err);
    return { success: false, error: true, message: err?.message || "Échec de mise à jour de l'enseignant / فشل في تحديث بيانات الأستاذ." };
  }
};

export const deleteTeacher = async (
  currentState: CurrentState,
  data: FormData
) => {
  const id = data.get("id") as string;
  if (!id) {
    return { success: false, error: true, message: "Identifiant manquant / لا يوجد معرف للأستاذ." };
  }

  try {
    const session = await getAuthSession();
    if (!session.isOwner) {
      return { success: false, error: true, message: "Action réservée au propriétaire / حذف الأستاذ متاح للمالك فقط." };
    }

    await prisma.class.updateMany({
      where: { teacherId: id },
      data: { teacherId: null },
    });
    await prisma.$executeRaw`DELETE FROM "TeacherBranch" WHERE "teacherId" = ${id}`;
    await prisma.$executeRaw`DELETE FROM "TeacherPayRate" WHERE "teacherId" = ${id}`;
    await prisma.$executeRaw`DELETE FROM "PhotocopyCharge" WHERE "teacherId" = ${id}`;
    await prisma.$executeRaw`DELETE FROM "BookReceipt" WHERE "bookId" IN (SELECT id FROM "Book" WHERE "teacherId" = ${id})`;
    await prisma.bookDrop.deleteMany({
      where: { book: { teacherId: id } },
    });
    await prisma.book.deleteMany({
      where: { teacherId: id },
    });
    await prisma.$executeRaw`DELETE FROM "Attendance" WHERE "lessonId" IN (SELECT id FROM "Lesson" WHERE "teacherId" = ${id})`;
    await prisma.$executeRaw`DELETE FROM "Lesson" WHERE "teacherId" = ${id}`;
    await prisma.$executeRaw`DELETE FROM "Teacher" WHERE id = ${id}`;

    safeRevalidatePath("/list/teachers");
    return { success: true, error: false, message: "Enseignant supprimé avec succès / تم حذف الأستاذ بنجاح." };
  } catch (err: any) {
    console.error(err);
    return { success: false, error: true, message: err?.message || "Échec de suppression de l'enseignant / فشل في حذف الأستاذ." };
  }
};

// =================================================================
// STUDENT ACTIONS
// =================================================================

/**
 * Docs/architecture.md §2.10: Permanent, school-wide student ID number with slot reuse.
 *
 * - Every student gets a sequential ID number (1, 2, 3...), unique across ALL 3 branches combined.
 * - When a student is deleted, their number becomes available again.
 * - The next newly-registered student receives the lowest available deleted number in the sequence,
 *   not simply the next highest number ever used.
 * - Deleting a student does NOT renumber anyone else's ID.
 */
export async function getNextGlobalStudentNumber(tx?: any): Promise<number> {
  const client = tx || prisma;
  const result = await client.$queryRaw<Array<{ nextNumber: number | string | bigint }>>`
    SELECT s.num AS "nextNumber"
    FROM generate_series(1, (SELECT COALESCE(MAX("globalNumber"), 0) + 1 FROM "Student")) s(num)
    LEFT JOIN "Student" ON "Student"."globalNumber" = s.num
    WHERE "Student"."globalNumber" IS NULL
    ORDER BY s.num ASC
    LIMIT 1;
  `;

  if (result.length > 0 && result[0].nextNumber !== undefined && result[0].nextNumber !== null) {
    return Number(result[0].nextNumber);
  }

  return 1;
}

export const createStudent = async (
  currentState: CurrentState,
  data: StudentSchema
) => {
  try {
    const session = await getAuthSession();
    const activeBranchId = await getActiveBranchId();
    const branchId = (data as any).registeredBranchId || activeBranchId;

    if (!canUserAccessBranch(session.rawRole, session.branchIds, branchId)) {
      return { success: false, error: true, message: "Non autorisé à inscrire un élève dans cette succursale / غير مصرح لك بتسجيل تلميذ في هذا الفرع." };
    }

    const id = crypto.randomUUID();
    const fullName = [data.surname, data.name].filter(Boolean).join(" ").trim();
    const phone = data.phone?.trim() || null;
    const globalNumber = await getNextGlobalStudentNumber(prisma);

    await prisma.$executeRaw`
      INSERT INTO "Student" (id, "globalNumber", name, phone, "registeredBranchId", "createdAt")
      VALUES (${id}, ${globalNumber}, ${fullName}, ${phone}, ${branchId}, NOW())
    `;

    // Handle optional repeatable parent phone numbers (§7.2)
    if (data.parentPhoneNumbers && Array.isArray(data.parentPhoneNumbers)) {
      const validNumbers = data.parentPhoneNumbers
        .map((p) => (typeof p === "string" ? p.trim() : ""))
        .filter((p) => p.length > 0);

      for (const phoneNum of validNumbers) {
        await prisma.$executeRaw`
          INSERT INTO "ParentPhoneNumber" ("studentId", phone)
          VALUES (${id}, ${phoneNum})
        `;
      }
    }

    // Connect student to enrollments if classes selected
    if (data.classes && data.classes.length > 0) {
      const years = await prisma.$queryRaw<Array<{ id: number }>>`
        SELECT id FROM "AcademicYear" ORDER BY "startDate" DESC LIMIT 1
      `;
      const yearId = years.length > 0 ? years[0].id : 1;

      for (const classId of data.classes) {
        await prisma.$executeRaw`
          INSERT INTO "Enrollment" ("studentId", "classId", "academicYearId", "inscriptionFeeCharged", "enrolledAt")
          VALUES (${id}, ${Number(classId)}, ${yearId}, true, NOW())
        `;
      }
    }

    try {
      safeRevalidatePath("/list/students");
      safeRevalidatePath("/list/attendance");
      if (data.classes && data.classes.length > 0) {
        for (const classId of data.classes) {
          safeRevalidatePath(`/list/attendance/class/${classId}`);
        }
      }
    } catch {
      // Intentionally tolerated outside Next.js request context
    }
    return { success: true, error: false, message: "Élève créé avec succès / تم انشاء التلميذ بنجاح." };
  } catch (err: any) {
    console.error(err);
    return { success: false, error: true, message: "Échec de la création de l'élève / فشل في انشاء التلميذ." };
  }
};

export const updateStudent = async (
  currentState: CurrentState,
  data: StudentSchema
) => {
  if (!data.id) {
    return { success: false, error: true, message: "Identifiant d'élève manquant / لا يوجد معرف للتلميذ." };
  }
  try {
    const session = await getAuthSession();
    const existing = await prisma.$queryRaw<Array<{ registeredBranchId: number }>>`
      SELECT "registeredBranchId" FROM "Student" WHERE id = ${data.id} LIMIT 1
    `;
    if (existing.length > 0 && !canUserAccessBranch(session.rawRole, session.branchIds, existing[0].registeredBranchId)) {
      return { success: false, error: true, message: "Non autorisé à modifier cet élève / غير مصرح لك بتعديل بيانات تلميذ في هذا الفرع." };
    }

    const fullName = [data.surname, data.name].filter(Boolean).join(" ").trim();
    const phone = data.phone?.trim() || null;
    const branchId = (data as any).registeredBranchId || (existing.length > 0 ? existing[0].registeredBranchId : 1);

    if (!canUserAccessBranch(session.rawRole, session.branchIds, branchId)) {
      return { success: false, error: true, message: "Non autorisé à transférer l'élève vers cette succursale / غير مصرح لك بنقل التلميذ إلى هذا الفرع." };
    }

    await prisma.$executeRaw`
      UPDATE "Student"
      SET name = ${fullName}, phone = ${phone}, "registeredBranchId" = ${branchId}
      WHERE id = ${data.id}
    `;

    // Handle updating parent phone numbers (§7.2)
    if (data.parentPhoneNumbers !== undefined) {
      await prisma.$executeRaw`
        DELETE FROM "ParentPhoneNumber" WHERE "studentId" = ${data.id}
      `;

      if (Array.isArray(data.parentPhoneNumbers)) {
        const validNumbers = data.parentPhoneNumbers
          .map((p) => (typeof p === "string" ? p.trim() : ""))
          .filter((p) => p.length > 0);

        for (const phoneNum of validNumbers) {
          await prisma.$executeRaw`
            INSERT INTO "ParentPhoneNumber" ("studentId", phone)
            VALUES (${data.id}, ${phoneNum})
          `;
        }
      }
    }

    // Handle enrollments for selected classes
    if (data.classes && data.classes.length > 0) {
      const years = await prisma.$queryRaw<Array<{ id: number }>>`
        SELECT id FROM "AcademicYear" ORDER BY "startDate" DESC LIMIT 1
      `;
      const yearId = years.length > 0 ? years[0].id : 1;

      for (const classId of data.classes) {
        const existingEnrollment = await prisma.$queryRaw<Array<{ id: number }>>`
          SELECT id FROM "Enrollment" WHERE "studentId" = ${data.id} AND "classId" = ${Number(classId)}
        `;
        if (existingEnrollment.length === 0) {
          await prisma.$executeRaw`
            INSERT INTO "Enrollment" ("studentId", "classId", "academicYearId", "inscriptionFeeCharged", "enrolledAt")
            VALUES (${data.id}, ${Number(classId)}, ${yearId}, true, NOW())
          `;
        }
      }
    }

    try {
      safeRevalidatePath("/list/students");
    } catch {
      // Intentionally tolerated outside Next.js request context
    }
    return { success: true, error: false, message: "Élève mis à jour avec succès / تم تحديث التلميذ بنجاح." };
  } catch (err) {
    console.error(err);
    return { success: false, error: true, message: "Échec de la mise à jour de l'élève / فشل في تحديث التلميذ." };
  }
};

const getPublicIdFromUrl = (url: string): string | null => {
  try {
    const parts = url.split('/');
    const uploadIndex = parts.indexOf('upload');
    if (uploadIndex === -1 || uploadIndex + 2 >= parts.length) {
      return null;
    }
    const publicIdWithExtension = parts.slice(uploadIndex + 2).join('/');
    return publicIdWithExtension.substring(0, publicIdWithExtension.lastIndexOf('.'));
  } catch (e) {
    console.error("Could not parse public_id from URL:", e);
    return null;
  }
};

export const deleteStudent = async (
  currentState: CurrentState,
  data: FormData
) => {
  const id = data.get("id") as string;
  if (!id) {
    return { success: false, error: true, message: "لا يوجد معرف للتلميذ." };
  }

  try {
    const session = await getAuthSession();
    const existing = await prisma.$queryRaw<Array<{ registeredBranchId: number }>>`
      SELECT "registeredBranchId" FROM "Student" WHERE id = ${id} LIMIT 1
    `;
    if (existing.length === 0) {
      return { success: false, error: true, message: "Élève introuvable / التلميذ غير موجود." };
    }
    if (!session.isOwner && !canUserAccessBranch(session.rawRole, session.branchIds, existing[0].registeredBranchId)) {
      return { success: false, error: true, message: "Non autorisé pour cette branche / غير مصرح لك بحذف تلاميذ هذا الفرع." };
    }

    // Clean up all referencing foreign keys safely
    await prisma.$executeRaw`DELETE FROM "ParentPhoneNumber" WHERE "studentId" = ${id}`;
    await prisma.$executeRaw`UPDATE "Family" SET "payerStudentId" = NULL WHERE "payerStudentId" = ${id}`;
    await prisma.$executeRaw`DELETE FROM "BookReceipt" WHERE "studentId" = ${id}`;
    await prisma.$executeRaw`DELETE FROM "BookCopyDistribution" WHERE "studentId" = ${id}`;
    await prisma.$executeRaw`DELETE FROM "LevelTest" WHERE "studentId" = ${id}`;
    await prisma.$executeRaw`DELETE FROM "WorkshopAttendance" WHERE "studentId" = ${id}`;
    await prisma.$executeRaw`DELETE FROM "WorkshopParticipant" WHERE "studentId" = ${id}`;
    await prisma.$executeRaw`DELETE FROM "EnrollmentTransfer" WHERE "fromEnrollmentId" IN (SELECT id FROM "Enrollment" WHERE "studentId" = ${id}) OR "toEnrollmentId" IN (SELECT id FROM "Enrollment" WHERE "studentId" = ${id})`;
    await prisma.$executeRaw`DELETE FROM "Enrollment" WHERE "studentId" = ${id}`;
    await prisma.$executeRaw`DELETE FROM "Attendance" WHERE "studentId" = ${id}`;
    await prisma.$executeRaw`DELETE FROM "Refund" WHERE "voucherId" IN (SELECT id FROM "Voucher" WHERE "studentId" = ${id})`;
    await prisma.$executeRaw`DELETE FROM "VoucherEdit" WHERE "voucherId" IN (SELECT id FROM "Voucher" WHERE "studentId" = ${id})`;
    await prisma.$executeRaw`DELETE FROM "Voucher" WHERE "studentId" = ${id}`;
    await prisma.$executeRaw`DELETE FROM "Student" WHERE id = ${id}`;

    // IMPORTANT: Deleting a student does NOT renumber anyone else's ID (§2.10).
    // The freed slot will be reused by getNextGlobalStudentNumber on the next registration.

    safeRevalidatePath("/list/students");
    return { success: true, error: false, message: "Élève supprimé avec succès / تم حذف التلميذ بنجاح." };
  } catch (err) {
    console.error(err);
    return { success: false, error: true, message: "Échec de suppression de l'élève / فشل في حذف التلميذ." };
  }
};

// =================================================================
// PARENT ACTIONS
// =================================================================

export const createParent = async (
  currentState: CurrentState,
  data: ParentSchema
) => {
  try {
    const studentId = data.students?.[0] || null;
    if (studentId) {
      const families = await prisma.$queryRaw<Array<{ id: number }>>`
        INSERT INTO "Family" ("payerStudentId") VALUES (${studentId}) RETURNING id
      `;
      if (families.length > 0) {
        await prisma.$executeRaw`
          UPDATE "Student" SET "familyId" = ${families[0].id} WHERE id = ${studentId}
        `;
      }
    }

    safeRevalidatePath("/list/parents");
    return { success: true, error: false, message: "Parent créé avec succès / تم انشاء ولي الامر بنجاح." };
  } catch (err) {
    console.error(err);
    return { success: false, error: true, message: "Échec de la création du parent / فشل في انشاء ولي الامر." };
  }
};

export const updateParent = async (
  currentState: CurrentState,
  data: ParentSchema
) => {
  safeRevalidatePath("/list/parents");
  return { success: true, error: false, message: "Parent mis à jour avec succès / تم تحديث ولي الامر بنجاح." };
};

export const deleteParent = async (
  currentState: CurrentState,
  data: FormData
) => {
  const id = data.get("id") as string;
  if (!id) {
    return { success: false, error: true, message: "Identifiant du parent manquant / لا يوجد معرف لولي الامر." };
  }

  try {
    const numId = parseInt(id, 10);
    if (!isNaN(numId)) {
      await prisma.$executeRaw`UPDATE "Student" SET "familyId" = NULL WHERE "familyId" = ${numId}`;
      await prisma.$executeRaw`DELETE FROM "Family" WHERE id = ${numId}`;
    }

    safeRevalidatePath("/list/parents");
    return { success: true, error: false, message: "Parent supprimé avec succès / تم حذف ولي الامر بنجاح." };
  } catch (err) {
    console.error(err);
    return { success: false, error: true, message: "Échec de la suppression du parent / فشل في حذف ولي الامر." };
  }
};

// =================================================================
// LESSON ACTIONS
// =================================================================

// Helper function to map weekday and time string to reference DateTime
const dayToSaturdayOffset: Record<string, number> = {
  SATURDAY: 0,
  SUNDAY: 1,
  MONDAY: 2,
  TUESDAY: 3,
  WEDNESDAY: 4,
  THURSDAY: 5,
  FRIDAY: 6,
};

function getNextWeekSaturday(referenceDate: Date = new Date()): Date {
  const d = new Date(referenceDate);
  const dayOfWeek = d.getDay(); // 0 is Sun, ..., 6 is Sat
  const diffToSaturday = (dayOfWeek + 1) % 7; // Sat -> 0, Sun -> 1, ..., Fri -> 6
  const currentSaturday = new Date(d);
  currentSaturday.setDate(d.getDate() - diffToSaturday);
  currentSaturday.setHours(0, 0, 0, 0);

  // Next week's Saturday (+7 days)
  const nextSaturday = new Date(currentSaturday);
  nextSaturday.setDate(currentSaturday.getDate() + 7);
  return nextSaturday;
}

const getLessonDateTime = (day: string, time: string, dateStr?: string | null): Date => {
  const [hours, minutes] = (time || "00:00").split(":").map(Number);

  let year: number;
  let month: number;
  let dayNum: number;

  if (dateStr && dateStr.trim().length > 0) {
    const parts = dateStr.trim().split("-").map(Number);
    if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
      year = parts[0];
      month = parts[1] - 1; // 0-indexed in JS Date
      dayNum = parts[2];
    } else {
      const targetSaturday = getNextWeekSaturday(new Date());
      const offset = dayToSaturdayOffset[(day || "").toUpperCase()] ?? 0;
      const targetDate = new Date(targetSaturday);
      targetDate.setDate(targetSaturday.getDate() + offset);
      year = targetDate.getFullYear();
      month = targetDate.getMonth();
      dayNum = targetDate.getDate();
    }
  } else {
    // Normal lesson: use next week's corresponding day as base reference
    const targetSaturday = getNextWeekSaturday(new Date());
    const offset = dayToSaturdayOffset[(day || "").toUpperCase()] ?? 0;
    const targetDate = new Date(targetSaturday);
    targetDate.setDate(targetSaturday.getDate() + offset);
    year = targetDate.getFullYear();
    month = targetDate.getMonth();
    dayNum = targetDate.getDate();
  }

  // School timezone is UTC+1 (Africa/Algiers, constant without DST).
  // Database timestamps are stored in UTC; subtracting 1 hour from local time
  // guarantees the saved UTC time exactly matches the entered local hour when read back.
  return new Date(Date.UTC(year, month, dayNum, (hours || 0) - 1, minutes || 0, 0, 0));
};

const checkForConflicts = async ({
  classId,
  teacherId,
  classroomId,
  day,
  startTime,
  endTime,
  excludeId = -1,
  startsAt: explicitStartsAt,
  endsAt: explicitEndsAt,
}: {
  classId: number;
  teacherId: string;
  classroomId?: number | null;
  day: string;
  startTime: string;
  endTime: string;
  excludeId?: number;
  startsAt?: Date;
  endsAt?: Date;
}) => {
  try {
    const startsAt = explicitStartsAt || getLessonDateTime(day, startTime);
    const endsAt = explicitEndsAt || getLessonDateTime(day, endTime);

    // 1. Teacher conflict check:
    // Full start-end time range comparison. Flag overlapping-but-offset lessons:
    // - Overlaps if startsAt < otherEndsAt AND endsAt > otherStartsAt
    // - Also checks same day of week across recurring lessons by comparing time ranges
    if (teacherId) {
      const teacherConflict = await prisma.$queryRaw<any[]>`
        SELECT id FROM "Lesson"
        WHERE "teacherId" = ${teacherId}
          AND id != ${excludeId}
          AND (
            ("startsAt" < ${endsAt} AND "endsAt" > ${startsAt})
            OR
            (
              "isExtra" = false AND "isCatchUp" = false
              AND EXTRACT(DOW FROM "startsAt") = EXTRACT(DOW FROM ${startsAt}::timestamp)
              AND "startsAt"::time < ${endsAt}::time
              AND "endsAt"::time > ${startsAt}::time
            )
          )
        LIMIT 1
      `;
      if (teacherConflict.length > 0) {
        return "Conflit d'emploi du temps : cet enseignant a déjà une séance à cet horaire / تعارض في الجدول: هذا الأستاذ لديه حصة مجدولة بالفعل في هذا الوقت.";
      }
    }

    // 2. Class (group) conflict check
    if (classId) {
      const classConflict = await prisma.$queryRaw<any[]>`
        SELECT id FROM "Lesson"
        WHERE "classId" = ${Number(classId)}
          AND id != ${excludeId}
          AND (
            ("startsAt" < ${endsAt} AND "endsAt" > ${startsAt})
            OR
            (
              "isExtra" = false AND "isCatchUp" = false
              AND EXTRACT(DOW FROM "startsAt") = EXTRACT(DOW FROM ${startsAt}::timestamp)
              AND "startsAt"::time < ${endsAt}::time
              AND "endsAt"::time > ${startsAt}::time
            )
          )
        LIMIT 1
      `;
      if (classConflict.length > 0) {
        return "Conflit d'emploi du temps : ce groupe a déjà une séance à cet horaire / تعارض في الجدول: هذا القسم لديه حصة مجدولة بالفعل في هذا الوقت.";
      }
    }

    // 3. Classroom conflict check
    if (classroomId) {
      const classroomConflict = await prisma.$queryRaw<any[]>`
        SELECT id FROM "Lesson"
        WHERE "classroomId" = ${Number(classroomId)}
          AND id != ${excludeId}
          AND (
            ("startsAt" < ${endsAt} AND "endsAt" > ${startsAt})
            OR
            (
              "isExtra" = false AND "isCatchUp" = false
              AND EXTRACT(DOW FROM "startsAt") = EXTRACT(DOW FROM ${startsAt}::timestamp)
              AND "startsAt"::time < ${endsAt}::time
              AND "endsAt"::time > ${startsAt}::time
            )
          )
        LIMIT 1
      `;
      if (classroomConflict.length > 0) {
        const cr = await prisma.$queryRaw<any[]>`
          SELECT name FROM "Classroom" WHERE id = ${Number(classroomId)} LIMIT 1
        `;
        const roomName = cr[0]?.name || "المحددة";
        return `Conflit de salle : la salle "${roomName}" est déjà occupée à cet horaire / تعارض في القاعة: القاعة "${roomName}" محجوزة بالفعل في هذا الوقت.`;
      }
    }
  } catch (err) {
    console.error("checkForConflicts error:", err);
  }

  return null;
};

export const createLesson = async (
  currentState: CurrentState,
  data: LessonSchema
) => {
  try {
    // 1. Single lesson type validation: exactly one of (normal / extra / catch-up / free)
    const activeTypeFlags = [Boolean(data.isExtra), Boolean(data.isCatchUp), Boolean(data.isFree)].filter(Boolean);
    if (activeTypeFlags.length > 1) {
      return {
        success: false,
        error: true,
        message: "Un seul type de séance autorisé (normale, supplémentaire, rattrapage, gratuite) / لا يمكن أن تكون الحصة أكثر من نوع واحد (عادية، إضافية، استدراكية، مجانية).",
      };
    }

    const classId = Number(data.classId);
    if (!classId) {
      return { success: false, error: true, message: "Veuillez sélectionner une classe / الرجاء تحديد الفوج." };
    }

    // 2. Fetch class and auto-fetch head teacher (docs/architecture.md §7.5)
    const classRows = await prisma.$queryRaw<any[]>`
      SELECT id, name, "teacherId", "branchId" FROM "Class" WHERE id = ${classId} LIMIT 1
    `;
    if (classRows.length === 0) {
      return { success: false, error: true, message: "Classe introuvable / الفوج المحدد غير موجود." };
    }
    const classRecord = classRows[0];
    const teacherId = classRecord.teacherId;
    if (!teacherId) {
      return { success: false, error: true, message: "Aucun enseignant principal assigné à cette classe / هذا الفوج ليس لديه أستاذ رئيسي معين." };
    }

    const classroomId = Number(data.classroomId);

    // 3. Branch lock: branch admins are locked to their own branch; owner can choose (docs/architecture.md §7.5)
    const session = await getAuthSession();
    let branchId: number;

    if (session.isOwner) {
      if (data.branchId) {
        branchId = Number(data.branchId);
      } else if (classRecord.branchId) {
        branchId = classRecord.branchId;
      } else if (classroomId) {
        const crRows = await prisma.$queryRaw<any[]>`
          SELECT "branchId" FROM "Classroom" WHERE id = ${classroomId} LIMIT 1
        `;
        branchId = crRows[0]?.branchId || 1;
      } else {
        branchId = 1;
      }
    } else {
      const adminBranchId = session.branchIds[0];
      if (!adminBranchId) {
        return { success: false, error: true, message: "Compte non rattaché à une succursale / حسابك غير مرتبط بأي فرع." };
      }
      if (data.branchId && Number(data.branchId) !== adminBranchId) {
        return { success: false, error: true, message: "Non autorisé à programmer une séance dans une autre succursale / غير مصرح لك ببرمجة حصة في فرع آخر." };
      }
      branchId = adminBranchId;

      // Ensure chosen classroom belongs to admin's branch
      if (classroomId) {
        const crRows = await prisma.$queryRaw<any[]>`
          SELECT "branchId" FROM "Classroom" WHERE id = ${classroomId} LIMIT 1
        `;
        if (crRows.length > 0 && crRows[0].branchId !== adminBranchId) {
          return { success: false, error: true, message: "La salle sélectionnée n'appartient pas à votre succursale / القاعة المختارة لا تنتمي إلى فرعك." };
        }
      }
    }

    if (data.date) {
      const parts = data.date.trim().split("-").map(Number);
      if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
        const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 12, 0, 0));
        const dayNames = [
          "SUNDAY",
          "MONDAY",
          "TUESDAY",
          "WEDNESDAY",
          "THURSDAY",
          "FRIDAY",
          "SATURDAY",
        ] as const;
        data.day = dayNames[d.getUTCDay()];
      }
    }

    const startsAt = getLessonDateTime(data.day, data.startTime, data.date);
    const endsAt = getLessonDateTime(data.day, data.endTime, data.date);
    const isExtra = Boolean(data.isExtra);
    const isCatchUp = Boolean(data.isCatchUp);
    const isFree = Boolean(data.isFree);

    // 4. Time-conflict check with full start-end range comparison
    const conflict = await checkForConflicts({
      classId,
      teacherId,
      classroomId,
      day: data.day,
      startTime: data.startTime,
      endTime: data.endTime,
      startsAt,
      endsAt,
    });
    if (conflict) {
      return { success: false, error: true, message: conflict };
    }

    const newLesson = await prisma.lesson.create({
      data: {
        classId,
        teacherId,
        classroomId,
        branchId,
        startsAt,
        endsAt,
        isExtra,
        isCatchUp,
        isFree,
        extraFee: null,
      },
      include: {
        branch: { select: { id: true, name: true } },
        classroom: { select: { id: true, name: true } },
        class: { select: { id: true, name: true } },
      },
    });

    if (newLesson?.id) {
      try {
        const startsDateStr = startsAt.toLocaleDateString("ar-DZ", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        });
        const startTimeStr = data.startTime || "";
        const endTimeStr = data.endTime || "";

        let annTitle = "حصة جديدة";
        let typePrefix = "حصة جديدة";
        if (isExtra) {
          annTitle = "حصة إضافية جديدة";
          typePrefix = "حصة إضافية";
        } else if (isCatchUp) {
          annTitle = "حصة استدراكية جديدة";
          typePrefix = "حصة استدراكية";
        } else if (isFree) {
          annTitle = "حصة مجانية جديدة";
          typePrefix = "حصة مجانية";
        }

        const bName = (newLesson as any).branch?.name || "";
        const crName = (newLesson as any).classroom?.name ? `- قاعة ${(newLesson as any).classroom.name}` : "";
        const cName = (newLesson as any).class?.name || classRecord.name;
        const desc = `${typePrefix} لفوج ${cName} في ${bName} ${crName} بتاريخ ${startsDateStr} من ${startTimeStr} إلى ${endTimeStr}`.trim();

        await prisma.announcement.create({
          data: {
            title: annTitle,
            description: desc,
            classId,
            branchId: null, // school-wide
            authorBranchId: branchId,
            lessonId: newLesson.id,
            createdBy: session.userId || "admin",
            pinned: true,
            expiresAt: endsAt,
          },
        });
        safeRevalidatePath("/list/announcements");
        safeRevalidatePath("/admin");
        safeRevalidatePath("/teacher");
        safeRevalidatePath("/student");
        safeRevalidatePath("/parent");
      } catch (annErr) {
        console.warn("Could not create automatic timetable announcement:", annErr);
      }
    }

    safeRevalidatePath("/list/lessons");
    return { success: true, error: false, message: "Séance programmée avec succès / تم برمجة الحصة بنجاح." };
  } catch (err) {
    console.error("createLesson error:", err);
    return { success: false, error: true, message: "Échec de la programmation de la séance / فشل في برمجة الحصة." };
  }
};

export const updateLesson = async (
  currentState: CurrentState,
  data: LessonSchema
) => {
  if (!data.id) {
    return { success: false, error: true, message: "Identifiant de séance manquant / لا يوجد معرف للحصة." };
  }
  try {
    const lessonId = Number(data.id);
    const session = await getAuthSession();

    // 1. Check existing lesson and permission
    const existing = await prisma.$queryRaw<Array<{ branchId: number; classId: number }>>`
      SELECT "branchId", "classId" FROM "Lesson" WHERE id = ${lessonId} LIMIT 1
    `;
    if (existing.length === 0) {
      return { success: false, error: true, message: "Séance introuvable / الحصة غير موجودة." };
    }

    if (!session.isOwner) {
      const adminBranchId = session.branchIds[0];
      if (!adminBranchId || existing[0].branchId !== adminBranchId) {
        return { success: false, error: true, message: "Non autorisé à modifier une séance d'une autre succursale / غير مصرح لك بتعديل حصة لا تنتمي إلى فرعك." };
      }
    }

    // 2. Single lesson type validation
    const activeTypeFlags = [Boolean(data.isExtra), Boolean(data.isCatchUp), Boolean(data.isFree)].filter(Boolean);
    if (activeTypeFlags.length > 1) {
      return {
        success: false,
        error: true,
        message: "Un seul type de séance autorisé (normale, supplémentaire, rattrapage, gratuite) / لا يمكن أن تكون الحصة أكثر من نوع واحد (عادية، إضافية، استدراكية، مجانية).",
      };
    }

    const classId = Number(data.classId);
    if (!classId) {
      return { success: false, error: true, message: "Veuillez sélectionner une classe / الرجاء تحديد الفوج." };
    }

    // 3. Fetch class and auto-fetch head teacher
    const classRows = await prisma.$queryRaw<any[]>`
      SELECT id, name, "teacherId", "branchId" FROM "Class" WHERE id = ${classId} LIMIT 1
    `;
    if (classRows.length === 0) {
      return { success: false, error: true, message: "Classe introuvable / الفوج المحدد غير موجود." };
    }
    const classRecord = classRows[0];
    const teacherId = classRecord.teacherId;
    if (!teacherId) {
      return { success: false, error: true, message: "Aucun enseignant principal assigné à cette classe / هذا الفوج ليس لديه أستاذ رئيسي معين." };
    }

    const classroomId = Number(data.classroomId);

    // 4. Branch lock enforcement on update
    let branchId: number;
    if (session.isOwner) {
      if (data.branchId) {
        branchId = Number(data.branchId);
      } else {
        branchId = existing[0].branchId;
      }
    } else {
      const adminBranchId = session.branchIds[0];
      if (data.branchId && Number(data.branchId) !== adminBranchId) {
        return { success: false, error: true, message: "Non autorisé à transférer la séance vers une autre succursale / غير مصرح لك بنقل الحصة إلى فرع آخر." };
      }
      branchId = adminBranchId;

      if (classroomId) {
        const crRows = await prisma.$queryRaw<any[]>`
          SELECT "branchId" FROM "Classroom" WHERE id = ${classroomId} LIMIT 1
        `;
        if (crRows.length > 0 && crRows[0].branchId !== adminBranchId) {
          return { success: false, error: true, message: "La salle sélectionnée n'appartient pas à votre succursale / القاعة المختارة لا تنتمي إلى فرعك." };
        }
      }
    }

    if (data.date) {
      const parts = data.date.trim().split("-").map(Number);
      if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
        const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 12, 0, 0));
        const dayNames = [
          "SUNDAY",
          "MONDAY",
          "TUESDAY",
          "WEDNESDAY",
          "THURSDAY",
          "FRIDAY",
          "SATURDAY",
        ] as const;
        data.day = dayNames[d.getUTCDay()];
      }
    }

    const startsAt = getLessonDateTime(data.day, data.startTime, data.date);
    const endsAt = getLessonDateTime(data.day, data.endTime, data.date);
    const isExtra = Boolean(data.isExtra);
    const isCatchUp = Boolean(data.isCatchUp);
    const isFree = Boolean(data.isFree);

    // 5. Conflict check with excludeId = lessonId
    const conflict = await checkForConflicts({
      classId,
      teacherId,
      classroomId,
      day: data.day,
      startTime: data.startTime,
      endTime: data.endTime,
      excludeId: lessonId,
      startsAt,
      endsAt,
    });
    if (conflict) {
      return { success: false, error: true, message: conflict };
    }

    const updatedLesson = await prisma.lesson.update({
      where: { id: lessonId },
      data: {
        classId,
        teacherId,
        classroomId,
        branchId,
        startsAt,
        endsAt,
        isExtra,
        isCatchUp,
        isFree,
        extraFee: null,
      },
      include: {
        branch: { select: { id: true, name: true } },
        classroom: { select: { id: true, name: true } },
        class: { select: { id: true, name: true } },
      },
    });

    // Sync automatic announcement if exists, or create if missing
    try {
      const startsDateStr = startsAt.toLocaleDateString("ar-DZ", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      const startTimeStr = data.startTime || "";
      const endTimeStr = data.endTime || "";

      let annTitle = "حصة جديدة";
      let typePrefix = "حصة جديدة";
      if (isExtra) {
        annTitle = "حصة إضافية جديدة";
        typePrefix = "حصة إضافية";
      } else if (isCatchUp) {
        annTitle = "حصة استدراكية جديدة";
        typePrefix = "حصة استدراكية";
      } else if (isFree) {
        annTitle = "حصة مجانية جديدة";
        typePrefix = "حصة مجانية";
      }

      const bName = (updatedLesson as any).branch?.name || "";
      const crName = (updatedLesson as any).classroom?.name ? `- قاعة ${(updatedLesson as any).classroom.name}` : "";
      const cName = (updatedLesson as any).class?.name || classRecord.name;
      const desc = `${typePrefix} لفوج ${cName} في ${bName} ${crName} بتاريخ ${startsDateStr} من ${startTimeStr} إلى ${endTimeStr}`.trim();

      const existingAnnouncement = await prisma.announcement.findFirst({
        where: { lessonId },
      });

      if (existingAnnouncement) {
        await prisma.announcement.update({
          where: { id: existingAnnouncement.id },
          data: {
            title: annTitle,
            description: desc,
            classId,
            authorBranchId: branchId,
            expiresAt: endsAt,
          },
        });
      } else {
        await prisma.announcement.create({
          data: {
            title: annTitle,
            description: desc,
            classId,
            branchId: null,
            authorBranchId: branchId,
            lessonId,
            createdBy: session.userId || "admin",
            pinned: true,
            expiresAt: endsAt,
          },
        });
      }
      safeRevalidatePath("/list/announcements");
      safeRevalidatePath("/admin");
      safeRevalidatePath("/teacher");
      safeRevalidatePath("/student");
      safeRevalidatePath("/parent");
    } catch (annErr) {
      console.warn("Could not sync announcement on lesson update:", annErr);
    }

    safeRevalidatePath("/list/lessons");
    return { success: true, error: false, message: "Séance mise à jour avec succès / تم تحديث الحصة بنجاح." };
  } catch (err) {
    console.error("updateLesson error:", err);
    return { success: false, error: true, message: "Échec de la mise à jour de la séance / فشل في تحديث الحصة." };
  }
};

export const deleteLesson = async (
  currentState: CurrentState,
  data: FormData | { id: string | number }
) => {
  let idVal: string | number | null = null;
  if (data instanceof FormData) {
    idVal = data.get("id") as string;
  } else if (data && typeof data === "object" && "id" in data) {
    idVal = (data as any).id;
  }
  const id = parseInt(String(idVal), 10);
  if (isNaN(id)) {
    return { success: false, error: true, message: "معرف الحصة غير صالح." };
  }

  try {
    const session = await getAuthSession();
    const existing = await prisma.lesson.findUnique({
      where: { id },
      select: { branchId: true },
    });
    if (!existing) {
      return { success: false, error: true, message: "Leçon introuvable / الحصة غير موجودة." };
    }
    if (!session.isOwner && !canUserAccessBranch(session.rawRole, session.branchIds, existing.branchId)) {
      return { success: false, error: true, message: "Non autorisé pour cette branche / غير مصرح لك بحذف حصة في هذا الفرع." };
    }

    // Automatically delete associated announcement, attendances, and lesson
    await prisma.announcement.deleteMany({ where: { lessonId: id } });
    await prisma.catchUpAttendance.deleteMany({ where: { OR: [{ missedLessonId: id }, { catchUpLessonId: id }] } });
    await prisma.attendance.deleteMany({ where: { lessonId: id } });
    await prisma.lesson.delete({ where: { id } });

    safeRevalidatePath("/list/announcements");
    safeRevalidatePath("/admin");
    safeRevalidatePath("/teacher");
    safeRevalidatePath("/student");
    safeRevalidatePath("/parent");
    safeRevalidatePath("/list/lessons");
    return { success: true, error: false, message: "Leçon supprimée avec succès / تم حذف الحصة بنجاح." };
  } catch (err) {
    console.error("deleteLesson error:", err);
    return { success: false, error: true, message: "Échec de suppression de la leçon / فشل في حذف الحصة." };
  }
};

// =================================================================
// ATTENDANCE ACTIONS
// =================================================================

export const saveAttendance = async (
  lessonId: number,
  currentState: CurrentState,
  data: FormData
) => {
  // Extract all the attendance entries from the form data
  const attendanceEntries = Array.from(data.entries()).filter(([key]) =>
    key.startsWith("attendance[")
  );

  if (attendanceEntries.length === 0) {
    return { success: false, error: true, message: "Aucune donnée de présence fournie / لم يتم تقديم أي بيانات حضور." };
  }

  // Validate that all NOT_DEFINED entries have a non-empty justification
  for (const [key, value] of attendanceEntries) {
    if (value === "NOT_DEFINED") {
      const studentId = key.substring(key.indexOf("[") + 1, key.indexOf("]"));
      const justification = (data.get(`justification[${studentId}]`) as string)?.trim();
      if (!justification) {
        return {
          success: false,
          error: true,
          message: "La justification est obligatoire pour le statut non défini / تبرير الغياب إلزامي لكل تلميذ محدد كغير محدد.",
        };
      }
    }
  }

  try {
    const session = await getAuthSession();
    const adminId = session.userId || session.rawRole || "admin";

    const lessonInfo = await prisma.lesson.findUnique({
      where: { id: lessonId },
      select: { classId: true },
    });

    await prisma.$transaction(async (tx) => {
      const existingRecords = await tx.attendance.findMany({
        where: { lessonId },
        select: { id: true, studentId: true, status: true },
      });

      const recordsMap = new Map(existingRecords.map((r) => [r.studentId, r]));

      for (const [key, value] of attendanceEntries) {
        const studentId = key.substring(key.indexOf("[") + 1, key.indexOf("]"));
        const status = value === "PRESENT" ? "PRESENT" : value === "NOT_DEFINED" ? "NOT_DEFINED" : "ABSENT";
        const justification = status === "NOT_DEFINED" ? (data.get(`justification[${studentId}]`) as string)?.trim() || null : null;
        const existingRecord = recordsMap.get(studentId);

        if (existingRecord) {
          await tx.attendance.update({
            where: { id: existingRecord.id },
            data: {
              status,
              justification,
            },
          });
        } else {
          await tx.attendance.create({
            data: {
              lessonId,
              studentId,
              status,
              justification,
            },
          });
        }
      }

      // Handle book distribution checkboxes (FIFO drop assignment per §2.11)
      const bookEntries = Array.from(data.entries()).filter(([key, val]) =>
        key.startsWith("bookDistribution[") && (val === "true" || val === "on" || val === "1")
      );

      for (const [key] of bookEntries) {
        const match = key.match(/^bookDistribution\[(.*?)\]\[(.*?)\]$/);
        if (match) {
          const studentId = match[1];
          const bookId = parseInt(match[2], 10);
          if (studentId && !isNaN(bookId)) {
            // Check if student already received a copy of this book
            const alreadyReceived = await tx.bookCopyDistribution.findFirst({
              where: {
                studentId,
                bookDrop: {
                  bookId,
                },
              },
            });

            if (!alreadyReceived) {
              // Find oldest BookDrop for this book that still has remaining capacity (FIFO by dropDate, id)
              const drops = await tx.bookDrop.findMany({
                where: { bookId },
                orderBy: [{ dropDate: "asc" }, { id: "asc" }],
                include: {
                  _count: {
                    select: { distributions: true },
                  },
                },
              });

              const availableDrop = drops.find((d) => d.quantity > d._count.distributions);
              if (availableDrop) {
                await tx.bookCopyDistribution.create({
                  data: {
                    bookDropId: availableDrop.id,
                    studentId,
                    distributedAt: new Date(),
                    distributedBy: adminId,
                  },
                });
              }

              // Also record into single source of truth BookReceipt (§7.20 / Phase 36)
              await tx.bookReceipt.upsert({
                where: {
                  studentId_bookId: {
                    studentId,
                    bookId,
                  },
                },
                update: {
                  receivedAt: new Date(),
                  receivedBy: adminId,
                },
                create: {
                  studentId,
                  bookId,
                  receivedAt: new Date(),
                  receivedBy: adminId,
                },
              });
            }
          }
        }
      }
    });

    // Revalidate the path to the main attendance page, this lesson's roster, and the class records table
    safeRevalidatePath("/list/attendance");
    safeRevalidatePath(`/list/attendance/take/${lessonId}`);
    if (lessonInfo?.classId) {
      safeRevalidatePath(`/list/attendance/class/${lessonInfo.classId}`);
    }
    return { success: true, error: false, message: "Présences et distribution des livres enregistrées avec succès / تم حفظ بيانات الحضور وتوزيع الكتب بنجاح." };

  } catch (err: any) {
    console.error("saveAttendance error:", err);
    return { success: false, error: true, message: "Échec de l'enregistrement des présences / فشل في حفظ بيانات الحضور." };
  }
};

/**
 * Optimistic single attendance toggling with immediate DB write (§7.21).
 */
export const markSingleAttendanceAction = async (input: {
  lessonId: number;
  studentId: string;
  status: "PRESENT" | "ABSENT" | "NOT_DEFINED";
  justification?: string | null;
}) => {
  try {
    const session = await getAuthSession();
    if (!session.userId && !session.rawRole) {
      return { success: false, error: true, message: "Non autorisé / غير مصرح" };
    }

    if (input.status === "NOT_DEFINED" && !input.justification?.trim()) {
      return {
        success: false,
        error: true,
        message: "La justification est obligatoire pour le statut non défini / تبرير الغياب إلزامي لكل تلميذ محدد كغير محدد.",
      };
    }

    const adminId = session.userId || session.rawRole || "admin";

    await prisma.$transaction(async (tx) => {
      const existing = await tx.attendance.findFirst({
        where: { lessonId: input.lessonId, studentId: input.studentId },
      });

      if (existing) {
        await tx.attendance.update({
          where: { id: existing.id },
          data: {
            status: input.status,
            justification: input.status === "NOT_DEFINED" ? input.justification?.trim() || null : null,
          },
        });
      } else {
        await tx.attendance.create({
          data: {
            lessonId: input.lessonId,
            studentId: input.studentId,
            status: input.status,
            justification: input.status === "NOT_DEFINED" ? input.justification?.trim() || null : null,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          action: "ATTENDANCE_MARKED",
          entityType: "Attendance",
          entityId: `${input.lessonId}_${input.studentId}`,
          userId: adminId,
          userName: adminId,
          details: JSON.stringify({
            lessonId: input.lessonId,
            studentId: input.studentId,
            status: input.status,
            adminId,
            timestamp: new Date().toISOString(),
          }),
        },
      });
    });

    const lessonInfo = await prisma.lesson.findUnique({
      where: { id: input.lessonId },
      select: { classId: true },
    });

    if (lessonInfo?.classId) {
      safeRevalidatePath(`/list/attendance/class/${lessonInfo.classId}`);
    }

    return {
      success: true,
      error: false,
      message:
        input.status === "PRESENT"
          ? "Présence marquée / تم تسجيل الحضور"
          : input.status === "ABSENT"
          ? "Absence marquée / تم تسجيل الغياب"
          : "Statut mis à jour / تم تحديث الحالة",
    };
  } catch (err: any) {
    console.error("markSingleAttendanceAction error:", err);
    return {
      success: false,
      error: true,
      message: err.message || "Échec de l'enregistrement / فشل في حفظ الحضور",
    };
  }
};

/**
 * Search students who are NOT enrolled in the current lesson's class,
 * and fetch their uncaught-up missed lessons (Attendance status = 'ABSENT' in their own classes).
 */
export async function searchCatchUpCandidatesAction(
  currentLessonId: number,
  searchQuery: string
) {
  try {
    const session = await getAuthSession();
    if (!session.userId && !session.rawRole) {
      return { success: false, error: true, message: "غير مصرح لك.", candidates: [] };
    }

    const currentLesson = await prisma.lesson.findUnique({
      where: { id: currentLessonId },
      select: { id: true, classId: true, branchId: true },
    });

    if (!currentLesson) {
      return { success: false, error: true, message: "الحصة غير موجودة.", candidates: [] };
    }

    const trimmedQuery = searchQuery.trim();
    if (!trimmedQuery) {
      return { success: true, candidates: [] };
    }

    // Search students matching query who are NOT enrolled in currentLesson.classId
    const students = await prisma.student.findMany({
      where: {
        AND: [
          {
            OR: [
              { name: { contains: trimmedQuery, mode: "insensitive" } },
              ...(isNaN(Number(trimmedQuery)) ? [] : [{ globalNumber: Number(trimmedQuery) }]),
              { phone: { contains: trimmedQuery } },
            ],
          },
          {
            enrollments: {
              none: {
                classId: currentLesson.classId,
              },
            },
          },
        ],
      },
      select: {
        id: true,
        name: true,
        globalNumber: true,
        phone: true,
        attendances: {
          where: {
            status: "ABSENT",
          },
          include: {
            lesson: {
              include: {
                class: true,
                teacher: true,
              },
            },
          },
          orderBy: {
            lesson: {
              startsAt: "desc",
            },
          },
        },
        catchUpAttendances: {
          select: {
            missedLessonId: true,
          },
        },
      },
      take: 20,
    });

    // Filter missed lessons to only those not already caught up
    const candidates = students.map((s) => {
      const alreadyCaughtUpLessonIds = new Set(s.catchUpAttendances.map((c) => c.missedLessonId));
      const uncaughtUpAbsences = s.attendances
        .filter((a) => !alreadyCaughtUpLessonIds.has(a.lessonId) && a.lesson.id !== currentLessonId)
        .map((a) => ({
          attendanceId: a.id,
          lessonId: a.lesson.id,
          className: a.lesson.class.name,
          teacherName: a.lesson.teacher.name,
          startsAt: a.lesson.startsAt,
        }));

      return {
        id: s.id,
        name: s.name,
        globalNumber: s.globalNumber,
        phone: s.phone,
        missedLessons: uncaughtUpAbsences,
      };
    });

    return { success: true, candidates };
  } catch (error: any) {
    console.error("Error in searchCatchUpCandidatesAction:", error);
    return { success: false, error: true, message: error.message || "فشل البحث عن التلاميذ.", candidates: [] };
  }
}

/**
 * Record a CatchUpAttendance for a visiting student (§2.12).
 * Does NOT decrement session credit, does NOT require payment in this host class,
 * and leaves the original missed lesson record as ABSENT.
 */
export async function recordCatchUpAttendanceAction(data: {
  catchUpLessonId: number;
  studentId: string;
  missedLessonId: number;
}) {
  try {
    const session = await getAuthSession();
    if (!session.userId && !session.rawRole) {
      return { success: false, error: true, message: "غير مصرح لك." };
    }

    const { catchUpLessonId, studentId, missedLessonId } = data;

    // Verify catch-up lesson exists
    const catchUpLesson = await prisma.lesson.findUnique({
      where: { id: catchUpLessonId },
      include: { class: true },
    });

    if (!catchUpLesson) {
      return { success: false, error: true, message: "الحصة الحالية غير موجودة." };
    }

    // Verify missed lesson exists and student was marked ABSENT
    const missedAttendance = await prisma.attendance.findFirst({
      where: {
        lessonId: missedLessonId,
        studentId,
        status: "ABSENT",
      },
    });

    if (!missedAttendance) {
      return {
        success: false,
        error: true,
        message: "لم يتم العثور على غياب مسجل لهذا التلميذ في الحصة المحددة.",
      };
    }

    // Check if already caught up (§2.12: a student can only catch up a given missed lesson once)
    const existingCatchUp = await prisma.catchUpAttendance.findUnique({
      where: {
        studentId_missedLessonId: {
          studentId,
          missedLessonId,
        },
      },
    });

    if (existingCatchUp) {
      return {
        success: false,
        error: true,
        message: "تم تعويض هذه الحصة الغائبة مسبقاً ولا يمكن تعويضها مرة أخرى.",
      };
    }

    const recordedBy = session.userId || session.rawRole || "admin";

    await prisma.catchUpAttendance.create({
      data: {
        studentId,
        missedLessonId,
        catchUpLessonId,
        recordedBy,
        recordedAt: new Date(),
      },
    });

    safeRevalidatePath("/list/attendance");
    safeRevalidatePath(`/list/attendance/take/${catchUpLessonId}`);

    return {
      success: true,
      error: false,
      message: "تم تسجيل حضور التلميذ كزائر استدراك بنجاح.",
    };
  } catch (error: any) {
    console.error("Error in recordCatchUpAttendanceAction:", error);
    return {
      success: false,
      error: true,
      message: error.message || "فشل تسجيل حضور الاستدراك.",
    };
  }
}

/**
 * Remove a CatchUpAttendance record if added by mistake.
 */
export async function removeCatchUpAttendanceAction(
  catchUpAttendanceId: number,
  catchUpLessonId: number
) {
  try {
    const session = await getAuthSession();
    if (!session.userId && !session.rawRole) {
      return { success: false, error: true, message: "غير مصرح لك." };
    }

    await prisma.catchUpAttendance.delete({
      where: { id: catchUpAttendanceId },
    });

    safeRevalidatePath("/list/attendance");
    safeRevalidatePath(`/list/attendance/take/${catchUpLessonId}`);

    return {
      success: true,
      error: false,
      message: "تم إلغاء تسجيل زائر الاستدراك بنجاح.",
    };
  } catch (error: any) {
    console.error("Error in removeCatchUpAttendanceAction:", error);
    return {
      success: false,
      error: true,
      message: error.message || "فشل إلغاء تسجيل الاستدراك.",
    };
  }
}

// =================================================================
// ANNOUNCEMENT ACTIONS
// =================================================================

export const createAnnouncement = async (
  currentState: CurrentState,
  data: AnnouncementSchema
) => {
  try {
    const session = await getAuthSession();
    const activeBranchId = await getActiveBranchId();

    let targetBranchId: number | null = null;
    if (data.branchId !== undefined) {
      targetBranchId = data.branchId && Number(data.branchId) > 0 ? Number(data.branchId) : null;
    } else {
      targetBranchId = session.isOwner ? null : (activeBranchId || session.branchIds[0] || null);
    }

    const authorBranchId = activeBranchId || session.branchIds[0] || null;

    let expiresAt: Date | null = null;
    if (data.isTemporary && data.expiresAt) {
      const parsedDate = new Date(data.expiresAt);
      if (!isNaN(parsedDate.getTime())) {
        expiresAt = parsedDate;
      }
    }

    await prisma.announcement.create({
      data: {
        title: data.title,
        description: data.description,
        pinned: data.isPinned || false,
        createdBy: session.userId || "system",
        branchId: targetBranchId,
        authorBranchId,
        classId: data.classes?.[0] || null,
        expiresAt,
      },
    });
    safeRevalidatePath("/list/announcements");
    safeRevalidatePath("/admin");
    safeRevalidatePath("/teacher");
    safeRevalidatePath("/student");
    safeRevalidatePath("/parent");
    return {
      success: true,
      error: false,
      message: "Annonce créée avec succès / تم إنشاء الإعلان بنجاح.",
    };
  } catch (err) {
    console.log(err);
    return {
      success: false,
      error: true,
      message: "Échec de création de l'annonce / فشل في إنشاء الإعلان.",
    };
  }
};

export const updateAnnouncement = async (
  currentState: CurrentState,
  data: AnnouncementSchema
) => {
  if (!data.id) {
    return {
      success: false,
      error: true,
      message: "Identifiant manquant / لا يوجد معرف للإعلان.",
    };
  }
  try {
    const session = await getAuthSession();
    const existing = await prisma.announcement.findUnique({
      where: { id: data.id },
    });
    if (!existing) {
      return {
        success: false,
        error: true,
        message: "Annonce introuvable / الإعلان غير موجود.",
      };
    }

    const canUpdate =
      session.isOwner ||
      (existing.authorBranchId &&
        session.branchIds.includes(existing.authorBranchId));
    if (!canUpdate) {
      return {
        success: false,
        error: true,
        message: "Non autorisé pour cette annonce / غير مصرح لك بتعديل هذا الإعلان. فقط فرع كاتب الإعلان يملك صلاحية التعديل.",
      };
    }

    let targetBranchId: number | null | undefined = undefined;
    if (data.branchId !== undefined) {
      targetBranchId = data.branchId && Number(data.branchId) > 0 ? Number(data.branchId) : null;
    }

    let expiresAt: Date | null | undefined = undefined;
    if (data.isTemporary) {
      if (data.expiresAt) {
        const parsedDate = new Date(data.expiresAt);
        expiresAt = !isNaN(parsedDate.getTime()) ? parsedDate : null;
      } else {
        expiresAt = null;
      }
    } else if (data.isTemporary === false) {
      expiresAt = null;
    }

    await prisma.announcement.update({
      where: { id: data.id },
      data: {
        title: data.title,
        description: data.description,
        pinned: data.isPinned || false,
        classId: data.classes?.[0] || null,
        ...(targetBranchId !== undefined ? { branchId: targetBranchId } : {}),
        ...(expiresAt !== undefined ? { expiresAt } : {}),
      },
    });
    safeRevalidatePath("/list/announcements");
    safeRevalidatePath("/admin");
    safeRevalidatePath("/teacher");
    safeRevalidatePath("/student");
    safeRevalidatePath("/parent");
    return {
      success: true,
      error: false,
      message: "Annonce mise à jour avec succès / تم تحديث الإعلان بنجاح.",
    };
  } catch (err) {
    console.log(err);
    return {
      success: false,
      error: true,
      message: "Échec de mise à jour de l'annonce / فشل في تحديث الإعلان.",
    };
  }
};

export const deleteAnnouncement = async (
  currentState: CurrentState,
  data: FormData
) => {
  const id = data.get("id") as string;
  try {
    const session = await getAuthSession();
    const announcement = await prisma.announcement.findUnique({
      where: { id: parseInt(id) },
    });
    if (!announcement) {
      return {
        success: false,
        error: true,
        message: "Annonce introuvable / الإعلان غير موجود.",
      };
    }

    const canDelete =
      session.isOwner ||
      (announcement.authorBranchId &&
        session.branchIds.includes(announcement.authorBranchId));
    if (!canDelete) {
      return {
        success: false,
        error: true,
        message: "Non autorisé pour cette annonce / غير مصرح لك بحذف هذا الإعلان. فقط فرع كاتب الإعلان يملك صلاحية الحذف.",
      };
    }

    await prisma.announcement.delete({
      where: { id: parseInt(id) },
    });
    safeRevalidatePath("/list/announcements");
    safeRevalidatePath("/admin");
    safeRevalidatePath("/teacher");
    safeRevalidatePath("/student");
    safeRevalidatePath("/parent");
    return {
      success: true,
      error: false,
      message: "Annonce supprimée avec succès / تم حذف الإعلان بنجاح.",
    };
  } catch (err) {
    console.log(err);
    return {
      success: false,
      error: true,
      message: "Échec de suppression de l'annonce / فشل في حذف الإعلان.",
    };
  }
};

// =================================================================
// PAYMENT ACTIONS
// =================================================================

export const issueVoucher = async (
  currentState: CurrentState,
  data: VoucherSchema
) => {
  try {
    const session = await getAuthSession();
    const issuingBranchId = await getActiveBranchId();

    // Verify issuing branch access
    if (!canUserAccessBranch(session.rawRole, session.branchIds, issuingBranchId)) {
      return { success: false, error: true, message: "غير مصرح لك بإصدار وصولات من هذا الفرع." };
    }

    // 1. Fetch Class and determine targetBranchId
    const targetClass = await prisma.class.findUnique({
      where: { id: data.classId },
    });
    if (!targetClass) {
      return { success: false, error: true, message: "القسم المحدد غير موجود." };
    }
    const targetBranchId = targetClass.branchId;

    // 2. Fetch Student and Family info for Sibling Discount rule (§2.4)
    const student = await prisma.student.findUnique({
      where: { id: data.studentId },
      include: {
        family: true,
      },
    });
    if (!student) {
      return { success: false, error: true, message: "التلميذ المحدد غير موجود." };
    }

    // 3. Determine Active Academic Year for Inscription Fee rule (§2.1)
    let academicYear = await prisma.academicYear.findFirst({
      orderBy: { startDate: "desc" },
    });
    if (!academicYear) {
      const curYear = new Date().getFullYear();
      academicYear = await prisma.academicYear.create({
        data: {
          label: `${curYear}-${curYear + 1}`,
          startDate: new Date(`${curYear}-09-01`),
          endDate: new Date(`${curYear + 1}-06-30`),
        },
      });
    }

    let finalAmount = Number(data.amount);
    let noteAppend = "";
    let isWaivedSibling = false;
    let isWaivedInscription = false;
    let feeOverridden = false;
    let feeOverrideNote = data.feeOverrideNote || null;

    // RULE §2.4: Sibling discount — tuition fees waived for non-payer siblings; inscription and book fees unaffected
    if (data.paymentType === "TUITION_4SESSION") {
      const family = student.family;
      if (family && family.payerStudentId && family.payerStudentId !== student.id) {
        // This student is a sibling of the designated payer -> 100% tuition waiver!
        finalAmount = 0;
        isWaivedSibling = true;
        noteAppend = "[إعفاء إخوة: معفى 100% من معاليم الحصص]";
      }
    }

    // RULE §2.1: Inscription fee — first 3 enrollments per student per academic year charged, auto-waived from 4th
    if (data.paymentType === "INSCRIPTION") {
      const chargedCount = await prisma.enrollment.count({
        where: {
          studentId: student.id,
          academicYearId: academicYear.id,
          inscriptionFeeCharged: true,
          // Exclude this class if already enrolled to avoid double counting
          classId: { not: targetClass.id },
        },
      });

      if (data.feeOverriddenByOwner && session.isOwner) {
        // Owner override
        feeOverridden = true;
        feeOverrideNote = data.feeOverrideNote || (finalAmount === 0 ? "إعفاء استثنائي بقرار المالك" : "فرض رسم استثنائي بقرار المالك");
        noteAppend = `[استثناء مالك: ${feeOverrideNote}]`;
      } else if (data.feeOverriddenByOwner && !session.isOwner) {
        return { success: false, error: true, message: "فقط المالك يملك صلاحية تجاوز قاعدة رسم التسجيل." };
      } else {
        if (chargedCount >= 3) {
          // Auto-waived from 4th enrollment
          finalAmount = 0;
          isWaivedInscription = true;
          noteAppend = `[معفى تلقائياً: التسجيل رقم ${chargedCount + 1} في السنة الدراسية ${academicYear.label}]`;
        } else {
          finalAmount = data.amount > 0 ? Number(data.amount) : Number(targetClass.inscriptionFee);
        }
      }
    }

    // Combine notes
    const combinedNotes = [data.notes, noteAppend].filter(Boolean).join(" ");

    // 4. Resolve Continuous Voucher Series (§2.3 & §1.2)
    const isCrossBranch = issuingBranchId !== targetBranchId;
    const seriesScope = isCrossBranch ? "CROSS_BRANCH" : "LOCAL_LEVEL";

    let series = await prisma.voucherSeries.findFirst({
      where: {
        issuingBranchId: issuingBranchId,
        scope: seriesScope,
        ...(isCrossBranch ? { targetBranchId: targetBranchId } : {}),
      },
      orderBy: { id: "asc" },
    });

    if (!series) {
      series = await prisma.voucherSeries.create({
        data: {
          issuingBranchId: issuingBranchId,
          scope: seriesScope,
          targetBranchId: isCrossBranch ? targetBranchId : null,
          currentNumber: isCrossBranch ? 50 : 100,
        },
      });
    }

    // 5. Atomic transaction: increment continuous series, create voucher, update ledger & enrollment
    let createdVoucher: any = null;

    await prisma.$transaction(async (tx) => {
      const updatedSeries = await tx.voucherSeries.update({
        where: { id: series.id },
        data: { currentNumber: { increment: 1 } },
      });
      const voucherNumber = updatedSeries.currentNumber;

      // Resolve active trimester for trimester scoping (§7.20)
      let activeTrimesterId: number | null = null;
      try {
        const activeTrimester = await tx.trimester.findFirst({
          where: { status: "active" },
        });
        activeTrimesterId = activeTrimester?.id ?? null;
      } catch {
        // Fallback if status not recognized in stale client
      }

      createdVoucher = await tx.voucher.create({
        data: {
          seriesId: series.id,
          number: voucherNumber,
          studentId: data.studentId,
          classId: data.classId,
          issuingBranchId: issuingBranchId,
          targetBranchId: targetBranchId,
          paymentType: data.paymentType,
          amount: new Prisma.Decimal(finalAmount),
          isPartial: data.isPartial || false,
          completesVoucherId: data.completesVoucherId || null,
          remainingBalance: data.remainingBalance ? new Prisma.Decimal(data.remainingBalance) : null,
          issuedBy: session.userId || "admin",
          isVoided: false,
          trimesterId: (data as any).trimesterId ? Number((data as any).trimesterId) : activeTrimesterId,
        },
        include: {
          class: true,
          student: true,
          series: true,
        },
      });

      // Update DailyLedger at target branch (cross-branch voucher lands on TARGET branch revenue §1.1)
      if (finalAmount > 0) {
        const ledgerCategory = resolveLedgerType(data.paymentType, targetClass?.isFormation ?? false);

        await upsertDailyLedger(tx, {
          branchId: targetBranchId,
          date: new Date(),
          type: ledgerCategory,
          amount: finalAmount,
        });
      }

      // Ensure Enrollment record exists for this class & academic year
      const existingEnrollment = await tx.enrollment.findFirst({
        where: {
          studentId: data.studentId,
          classId: data.classId,
          academicYearId: academicYear.id,
        },
      });

      const shouldChargeInscription =
        data.paymentType === "INSCRIPTION"
          ? finalAmount > 0
          : feeOverridden
          ? finalAmount > 0
          : true;

      if (!existingEnrollment) {
        await tx.enrollment.create({
          data: {
            studentId: data.studentId,
            classId: data.classId,
            academicYearId: academicYear.id,
            inscriptionFeeCharged: shouldChargeInscription,
            inscriptionFeeAmount: shouldChargeInscription ? targetClass.inscriptionFee : null,
            feeOverriddenByOwner: feeOverridden,
            feeOverrideNote: feeOverrideNote,
          },
        });
      } else if (data.paymentType === "INSCRIPTION") {
        await tx.enrollment.update({
          where: { id: existingEnrollment.id },
          data: {
            inscriptionFeeCharged: shouldChargeInscription,
            inscriptionFeeAmount: shouldChargeInscription ? new Prisma.Decimal(finalAmount) : null,
            feeOverriddenByOwner: feeOverridden || existingEnrollment.feeOverriddenByOwner,
            feeOverrideNote: feeOverrideNote || existingEnrollment.feeOverrideNote,
          },
        });
      }
    });

    safeRevalidatePath(`/list/payments/class/${data.classId}`);
    safeRevalidatePath(`/list/attendance/class/${data.classId}`);
    safeRevalidatePath(`/list/payments`);
    safeRevalidatePath(`/list/students/${data.studentId}`);
    safeRevalidatePath(`/admin`);

    return {
      success: true,
      error: false,
      message: `تم إصدار الوصل رقم ${createdVoucher?.number} بنجاح (${isCrossBranch ? "وصل عابر للفروع" : "وصل محلي"}).`,
      voucher: createdVoucher,
    };
  } catch (err: any) {
    console.error("issueVoucher error:", err);
    return { success: false, error: true, message: err?.message || "فشل في إصدار الوصل." };
  }
};

// Backward-compatible alias for existing form callers
export const recordPayment = async (
  currentState: CurrentState,
  data: PaymentSchema
) => {
  return issueVoucher(currentState, {
    ...data,
    paymentType: (data as any).paymentType || "TUITION_4SESSION",
  });
};

// EDIT VOUCHER WITH AUDIT TRAIL (§2.3 & §1.2)
export const editVoucher = async (
  currentState: CurrentState,
  data: VoucherEditSchema & { amount?: number; paymentType?: string; isVoided?: boolean }
) => {
  try {
    const session = await getAuthSession();
    if (!data.voucherId) {
      return { success: false, error: true, message: "معرف الوصل مطلوب." };
    }
    if (!data.reason || data.reason.trim().length === 0) {
      return { success: false, error: true, message: "سبب التعديل إلزامي لضمان سجل المراجعة." };
    }

    const voucher = await prisma.voucher.findUnique({
      where: { id: data.voucherId },
      include: { class: true },
    });
    if (!voucher) {
      return { success: false, error: true, message: "الوصل غير موجود." };
    }

    // Check branch access (issuing branch or target branch)
    if (
      !session.isOwner &&
      !session.branchIds.includes(voucher.issuingBranchId) &&
      !session.branchIds.includes(voucher.targetBranchId)
    ) {
      return { success: false, error: true, message: "غير مصرح لك بتعديل وصل لهذا الفرع." };
    }

    const updates: Record<string, any> = {};
    const auditLogs: Array<{ fieldName: string; oldValue: string; newValue: string }> = [];

    if (data.amount !== undefined && Number(data.amount) !== Number(voucher.amount)) {
      auditLogs.push({
        fieldName: "amount",
        oldValue: voucher.amount.toString(),
        newValue: data.amount.toString(),
      });
      updates.amount = new Prisma.Decimal(data.amount);
    }

    if (data.paymentType && data.paymentType !== voucher.paymentType) {
      auditLogs.push({
        fieldName: "paymentType",
        oldValue: voucher.paymentType,
        newValue: data.paymentType,
      });
      updates.paymentType = data.paymentType;
    }

    if (data.isVoided !== undefined && data.isVoided !== voucher.isVoided) {
      auditLogs.push({
        fieldName: "isVoided",
        oldValue: String(voucher.isVoided),
        newValue: String(data.isVoided),
      });
      updates.isVoided = data.isVoided;
    }

    if (data.fieldName && data.newValue && !auditLogs.some((l) => l.fieldName === data.fieldName)) {
      auditLogs.push({
        fieldName: data.fieldName,
        oldValue: String((voucher as any)[data.fieldName] ?? ""),
        newValue: data.newValue,
      });
      updates[data.fieldName] = data.newValue;
    }

    if (auditLogs.length === 0) {
      return { success: false, error: true, message: "لم يتم تغيير أي حقل في الوصل." };
    }

    await prisma.$transaction(async (tx) => {
      // 1. Create audit logs in VoucherEdit
      for (const log of auditLogs) {
        await tx.voucherEdit.create({
          data: {
            voucherId: voucher.id,
            editedBy: session.userId || "admin",
            editedAt: new Date(),
            fieldName: log.fieldName,
            oldValue: log.oldValue,
            newValue: log.newValue,
            reason: data.reason,
          },
        });
      }

      // 2. Update voucher with lastEdited stamp
      await tx.voucher.update({
        where: { id: voucher.id },
        data: {
          ...updates,
          lastEditedAt: new Date(),
          lastEditedBy: session.userId || "admin",
        },
      });

      // 3. Reconcile DailyLedger if amount, paymentType or isVoided changed
      const oldAmount = Number(voucher.amount);
      const newAmount = updates.amount !== undefined ? Number(updates.amount) : oldAmount;
      const oldType = resolveLedgerType(voucher.paymentType, voucher.class?.isFormation ?? false);
      const newPaymentType = updates.paymentType || voucher.paymentType;
      const newType = resolveLedgerType(newPaymentType, voucher.class?.isFormation ?? false);
      const isNowVoided = updates.isVoided !== undefined ? updates.isVoided : voucher.isVoided;
      const wasVoided = voucher.isVoided;

      if (wasVoided !== isNowVoided || oldAmount !== newAmount || oldType !== newType) {
        if (!wasVoided && oldAmount > 0) {
          await upsertDailyLedger(tx, {
            branchId: voucher.targetBranchId,
            date: voucher.issuedAt,
            type: oldType,
            amount: -oldAmount,
          });
        }
        if (!isNowVoided && newAmount > 0) {
          await upsertDailyLedger(tx, {
            branchId: voucher.targetBranchId,
            date: voucher.issuedAt,
            type: newType,
            amount: newAmount,
          });
        }
      }
    });

    safeRevalidatePath(`/list/payments/class/${voucher.classId}`);
    safeRevalidatePath(`/list/payments`);
    safeRevalidatePath(`/list/students/${voucher.studentId}`);
    return { success: true, error: false, message: "تم تعديل الوصل وتسجيل أثر المراجعة بنجاح." };
  } catch (err: any) {
    console.error("editVoucher error:", err);
    return { success: false, error: true, message: err?.message || "فشل في تعديل الوصل." };
  }
};

export const updatePayment = async (
  currentState: CurrentState,
  data: PaymentSchema
) => {
  if (!data.id) {
    return { success: false, error: true, message: "لا يوجد معرف للوصل." };
  }
  return editVoucher(currentState, {
    voucherId: data.id,
    fieldName: "amount",
    newValue: String(data.amount),
    amount: data.amount,
    reason: data.notes || "تعديل إداري لقيمة الدفع",
  });
};

// VOID VOUCHER ACTION (§2.3)
export const voidVoucher = async (voucherId: number, reason: string) => {
  return editVoucher(
    { success: false, error: false },
    {
      voucherId,
      fieldName: "isVoided",
      newValue: "true",
      isVoided: true,
      reason: reason || "إلغاء الوصل بناء على طلب الإدارة",
    }
  );
};

// VOUCHER SERIES SETUP ACTIONS (§2.3 & setup screen)
export const updateVoucherSeriesNumber = async (
  currentState: CurrentState,
  data: VoucherSeriesSchema
) => {
  try {
    const session = await getAuthSession();
    if (!session.isOwnerOrAdmin) {
      return { success: false, error: true, message: "غير مصرح لك بتعديل أرقام سلاسل الوصولات." };
    }

    const series = await prisma.voucherSeries.findUnique({
      where: { id: data.id },
      include: { vouchers: { orderBy: { number: "desc" }, take: 1 } },
    });
    if (!series) {
      return { success: false, error: true, message: "سلسلة الوصولات غير موجودة." };
    }

    const maxIssued = series.vouchers[0]?.number || 0;
    if (data.currentNumber < maxIssued) {
      return {
        success: false,
        error: true,
        message: `لا يمكن تعيين رقم السلسلة (${data.currentNumber}) أقل من آخر رقم تم إصداره بالفعل (${maxIssued}).`,
      };
    }

    await prisma.voucherSeries.update({
      where: { id: data.id },
      data: { currentNumber: data.currentNumber },
    });

    return { success: true, error: false, message: `تم تحديث بداية السلسلة إلى ${data.currentNumber} بنجاح.` };
  } catch (err: any) {
    console.error("updateVoucherSeriesNumber error:", err);
    return { success: false, error: true, message: "فشل في تحديث رقم السلسلة." };
  }
};

// GROUP CREDIT TRANSFER (EnrollmentTransfer §2.6)
export const transferEnrollmentCredit = async (
  currentState: CurrentState,
  data: EnrollmentTransferSchema
) => {
  try {
    const session = await getAuthSession();
    const { fromEnrollmentId, toClassId, studentId, transferredSessions, notes } = data;

    // 1. Fetch fromEnrollment
    const fromEnrollment = await prisma.enrollment.findUnique({
      where: { id: fromEnrollmentId },
      include: {
        class: { include: { lessons: true } },
        student: true,
        academicYear: true,
      },
    });
    if (!fromEnrollment) {
      return { success: false, error: true, message: "التسجيل السابق غير موجود." };
    }

    // 2. Fetch destination Class
    const toClass = await prisma.class.findUnique({
      where: { id: toClassId },
    });
    if (!toClass) {
      return { success: false, error: true, message: "القسم الجديد غير موجود." };
    }

    // 3. Find or create toEnrollment
    let toEnrollment = await prisma.enrollment.findFirst({
      where: {
        studentId: studentId,
        classId: toClassId,
        academicYearId: fromEnrollment.academicYearId,
      },
    });

    await prisma.$transaction(async (tx) => {
      if (!toEnrollment) {
        toEnrollment = await tx.enrollment.create({
          data: {
            studentId: studentId,
            classId: toClassId,
            academicYearId: fromEnrollment.academicYearId,
            inscriptionFeeCharged: false, // Inscription already paid/waived on earlier enrollment
            feeOverriddenByOwner: false,
          },
        });
      }

      // Record EnrollmentTransfer
      await tx.enrollmentTransfer.create({
        data: {
          fromEnrollmentId: fromEnrollment.id,
          toEnrollmentId: toEnrollment.id,
          transferredSessions: Number(transferredSessions),
          transferredAt: new Date(),
          transferredBy: session.userId || "admin",
        },
      });
    });

    try {
      safeRevalidatePath(`/list/payments/class/${fromEnrollment.classId}`);
      safeRevalidatePath(`/list/payments/class/${toClassId}`);
      safeRevalidatePath(`/list/students/${studentId}`);
    } catch {
      // Ignore if executed outside Next.js request context (e.g. standalone test scripts)
    }
    return {
      success: true,
      error: false,
      message: `تم تحويل ${transferredSessions} حصص من ${fromEnrollment.class.name} إلى ${toClass.name} بنجاح.`,
    };
  } catch (err: any) {
    console.error("transferEnrollmentCredit error:", err);
    return { success: false, error: true, message: err?.message || "فشل في تحويل رصيد الحصص." };
  }
};

// FAMILY & SIBLING DISCOUNT ACTIONS (§2.4)
export const setFamilyPayerStudent = async (familyId: number, payerStudentId: string) => {
  try {
    const session = await getAuthSession();
    if (!session.isOwnerOrAdmin) {
      return { success: false, error: true, message: "غير مصرح لك بتحديد التلميذ المكلف بالدفع." };
    }

    await prisma.family.update({
      where: { id: familyId },
      data: { payerStudentId: payerStudentId },
    });

    safeRevalidatePath("/list/families");
    safeRevalidatePath("/list/payments");
    return { success: true, error: false, message: "تم تحديد التلميذ المكلف بالدفع للعائلة بنجاح." };
  } catch (err: any) {
    console.error("setFamilyPayerStudent error:", err);
    return { success: false, error: true, message: "فشل في تحديد التلميذ المكلف بالدفع." };
  }
};

export const createOrUpdateFamily = async (
  currentState: CurrentState,
  data: FamilySchema
) => {
  try {
    const session = await getAuthSession();
    if (!session.isOwnerOrAdmin) {
      return { success: false, error: true, message: "غير مصرح لك بإدارة العائلات." };
    }

    let familyId = data.id;

    await prisma.$transaction(async (tx) => {
      if (familyId) {
        await tx.family.update({
          where: { id: familyId },
          data: { payerStudentId: data.payerStudentId || null },
        });
      } else {
        const newFam = await tx.family.create({
          data: { payerStudentId: data.payerStudentId || null },
        });
        familyId = newFam.id;
      }

      // Associate all students with this family
      if (data.studentIds && data.studentIds.length > 0) {
        await tx.student.updateMany({
          where: { id: { in: data.studentIds } },
          data: { familyId: familyId },
        });
      }
    });

    safeRevalidatePath("/list/families");
    safeRevalidatePath("/list/students");
    return { success: true, error: false, message: "تم حفظ بيانات العائلة والإخوة بنجاح." };
  } catch (err: any) {
    console.error("createOrUpdateFamily error:", err);
    return { success: false, error: true, message: "فشل في حفظ بيانات العائلة." };
  }
};

// OWNER-ONLY INSCRIPTION FEE OVERRIDE (§2.1)
export const overrideEnrollmentFee = async (
  enrollmentId: number,
  forceWaive: boolean,
  note: string
) => {
  try {
    const session = await getAuthSession();
    if (!session.isOwner) {
      return { success: false, error: true, message: "فقط المالك يملك صلاحية تجاوز قاعدة رسم التسجيل." };
    }

    const enrollment = await prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      include: { class: true },
    });
    if (!enrollment) {
      return { success: false, error: true, message: "التسجيل غير موجود." };
    }

    await prisma.enrollment.update({
      where: { id: enrollmentId },
      data: {
        inscriptionFeeCharged: !forceWaive,
        inscriptionFeeAmount: forceWaive ? null : enrollment.class.inscriptionFee,
        feeOverriddenByOwner: true,
        feeOverrideNote: note || (forceWaive ? "إعفاء يدوي من المالك" : "فرض يدوي من المالك"),
      },
    });

    safeRevalidatePath(`/list/payments/class/${enrollment.classId}`);
    safeRevalidatePath(`/list/students/${enrollment.studentId}`);
    return { success: true, error: false, message: "تم تطبيق الاستثناء بنجاح." };
  } catch (err: any) {
    console.error("overrideEnrollmentFee error:", err);
    return { success: false, error: true, message: "فشل في تطبيق استثناء رسم التسجيل." };
  }
};

export const createRefund = async (
  currentState: CurrentState,
  data: RefundSchema
) => {
  try {
    const session = await getAuthSession();
    if (!session.isOwnerOrAdmin) {
      return { success: false, error: true, message: "غير مصرح لك بإجراء استرداد مالي." };
    }

    if (!data.voucherId) {
      return { success: false, error: true, message: "معرف الوصل مطلوب لإجراء الاسترداد." };
    }

    if (!data.amount || data.amount <= 0) {
      return { success: false, error: true, message: "مبلغ الاسترداد يجب أن يكون أكبر من الصفر." };
    }

    if (!data.reason || data.reason.trim().length < 3) {
      return { success: false, error: true, message: "سبب الاسترداد إلزامي لضمان سجل المراجعة (3 أحرف على الأقل)." };
    }

    const voucher = await prisma.voucher.findUnique({
      where: { id: data.voucherId },
      include: {
        refunds: true,
        class: true,
      },
    });

    if (!voucher) {
      return { success: false, error: true, message: "الوصل المحدد غير موجود." };
    }

    // Branch authorization check
    const hasBranchAccess =
      session.isOwner ||
      !session.userId ||
      canUserAccessBranch(session.rawRole, session.branchIds, voucher.issuingBranchId) ||
      canUserAccessBranch(session.rawRole, session.branchIds, voucher.targetBranchId);

    if (!hasBranchAccess) {
      return { success: false, error: true, message: "غير مصرح لك بإجراء استرداد لوصل يتبع فرعاً آخر." };
    }

    // Calculate sum of existing refunds
    const totalRefundedSoFar = voucher.refunds.reduce((sum, r) => sum + Number(r.amount), 0);
    const voucherAmount = Number(voucher.amount);
    const remainingBalance = Number(voucher.remainingBalance ?? (voucherAmount - totalRefundedSoFar));

    // Validation 1: Cannot refund an already fully refunded or voided voucher
    if (voucher.isVoided || remainingBalance <= 0) {
      return {
        success: false,
        error: true,
        message: "هذا الوصل مسترجع بالكامل أو ملغى مسبقاً ولا يمكن استرداد أي مبالغ إضافية منه.",
      };
    }

    // Validation 2: Inscription fees are strictly non-refundable under any circumstance (§7.8)
    if (voucher.paymentType === "INSCRIPTION") {
      return {
        success: false,
        error: true,
        message: "رسوم التسجيل غير قابلة للاسترداد تحت أي ظرف من الظروف. / Les frais d'inscription ne sont jamais remboursables.",
      };
    }

    // Validation 3: For class vouchers, enforce the cashback rule (§7.8)
    if (voucher.classId) {
      // Must be a tuition cycle voucher
      if (voucher.paymentType !== "TUITION_4SESSION") {
        return {
          success: false,
          error: true,
          message: "لا يمكن تطبيق الاسترداد إلا على دورات الاشتراكات الدراسية (TUITION_4SESSION). / Le remboursement ne peut être appliqué que sur un cycle d'abonnement.",
        };
      }

      // Check that this is the student's MOST RECENT paid, currently-active cycle
      const studentClassVouchers = await prisma.voucher.findMany({
        where: {
          studentId: voucher.studentId,
          classId: voucher.classId,
          paymentType: "TUITION_4SESSION",
          isVoided: false,
        },
        include: {
          refunds: true,
        },
        orderBy: [
          { issuedAt: "desc" },
          { id: "desc" },
        ],
      });

      const activeCycles = studentClassVouchers.filter((v) => {
        const refunded = v.refunds.reduce((sum, r) => sum + Number(r.amount), 0);
        const rem = Number(v.remainingBalance ?? (Number(v.amount) - refunded));
        return rem > 0;
      });

      if (activeCycles.length === 0 || activeCycles[0].id !== voucher.id) {
        return {
          success: false,
          error: true,
          message: "لا يمكن تطبيق الاسترداد إلا على أحدث دورة مدفوعة ونشطة للطالب. / Le remboursement ne peut être appliqué que sur le cycle actif le plus récent de l'élève.",
        };
      }

      // Sibling discount waiver check
      const student = await prisma.student.findUnique({
        where: { id: voucher.studentId },
        include: { family: true },
      });
      if (student?.family?.payerStudentId && student.family.payerStudentId !== voucher.studentId) {
        return {
          success: false,
          error: true,
          message: "لا يمكن استرداد مبالغ لطالب معفى بموجب تخفيض الأخوة. / Aucun remboursement pour un élève exonéré fratrie.",
        };
      }

      // Calculate consumed sessions using Massinissa School rules:
      // Consumed: PRESENT + INTERLEAVED_ABSENCE + FORFEITED_DROPOUT
      // Refundable/Unconsumed: PRE_START_ABSENCE + TRAILING_ABSENCE_HELD + NOT_DEFINED
      const [classLessons, studentAttendances, studentCatchUps] = await Promise.all([
        prisma.lesson.findMany({
          where: {
            classId: voucher.classId,
            isFree: false,
            attendances: { some: {} },
          },
          select: { id: true, startsAt: true, isFree: true },
          orderBy: { startsAt: "asc" },
        }),
        prisma.attendance.findMany({
          where: {
            studentId: voucher.studentId,
            lesson: { classId: voucher.classId },
          },
          select: { lessonId: true, status: true },
        }),
        prisma.catchUpAttendance.findMany({
          where: {
            studentId: voucher.studentId,
            missedLesson: { classId: voucher.classId },
          },
          select: { missedLessonId: true, recordedAt: true },
        }),
      ]);

      const classifiedHistory = classifyStudentAttendanceHistory({
        lessons: classLessons,
        attendances: studentAttendances,
        catchUps: studentCatchUps,
        referenceDate: new Date(),
      });

      const attendedSessions = classifiedHistory.filter((h) => h.isConsumedCredit).length;

      // Transfers
      const enrollment = await prisma.enrollment.findFirst({
        where: {
          studentId: voucher.studentId,
          classId: voucher.classId,
        },
        include: {
          transfersFrom: true,
          transfersTo: true,
        },
      });
      const transferredOut = enrollment?.transfersFrom?.reduce((sum, t) => sum + t.transferredSessions, 0) || 0;
      const transferredIn = enrollment?.transfersTo?.reduce((sum, t) => sum + t.transferredSessions, 0) || 0;

      // Calculate total purchased sessions minus prior refunds
      let totalPurchased = 0;
      for (const v of studentClassVouchers) {
        const vAmount = Number(v.amount);
        const vRefunded = v.refunds.reduce((sum, r) => sum + Number(r.amount), 0);
        const refundedSessions = vAmount > 0 ? Math.floor(vRefunded / (vAmount / 4)) : 0;
        totalPurchased += Math.max(0, 4 - refundedSessions);
      }

      const netSessions = (totalPurchased + transferredIn - transferredOut) - attendedSessions;
      const unconsumedInCycle = Math.max(0, Math.min(4, netSessions));
      const pricePerSession = voucherAmount / 4;
      const maxRefundableByConsumption = Math.round(unconsumedInCycle * pricePerSession);
      const maxRefundable = Math.min(remainingBalance, maxRefundableByConsumption);

      if (maxRefundable <= 0) {
        return {
          success: false,
          error: true,
          message: "جميع حصص هذه الدورة قد تم استهلاكها بالفعل بالحضور. لا يمكن إجراء أي استرداد مالي. / Toutes les séances de ce cycle ont déjà été consommées. Aucun remboursement n'est possible.",
        };
      }

      if (data.amount > maxRefundable) {
        return {
          success: false,
          error: true,
          message: `مبلغ الاسترداد المطلوب (${data.amount.toLocaleString()} دج) يتجاوز الحد الأقصى المسموح به للحصص المتبقية غير المستهلكة (${maxRefundable.toLocaleString()} دج - ${unconsumedInCycle} حصص متبقية). / Le montant demandé (${data.amount.toLocaleString()} DZD) dépasse le plafond autorisé pour les séances non consommées (${maxRefundable.toLocaleString()} DZD - ${unconsumedInCycle} séances restantes).`,
        };
      }
    } else {
      // For non-class vouchers (e.g. workshops), validate against remaining balance only
      if (data.amount > remainingBalance) {
        return {
          success: false,
          error: true,
          message: `مبلغ الاسترداد (${data.amount.toLocaleString()} دج) يتجاوز الرصيد المتبقي المتاح للاسترداد (${remainingBalance.toLocaleString()} دج).`,
        };
      }
    }

    const newRemainingBalance = remainingBalance - data.amount;
    const isFullRefund = newRemainingBalance <= 0;
    const userIdentifier = session.userId || "admin";

    await prisma.$transaction(async (tx) => {
      // 1. Create Refund record
      await tx.refund.create({
        data: {
          voucherId: voucher.id,
          amount: new Prisma.Decimal(data.amount),
          reason: data.reason.trim(),
          refundedBy: userIdentifier,
          refundedAt: new Date(),
        },
      });

      // 2. Update Voucher
      await tx.voucher.update({
        where: { id: voucher.id },
        data: {
          remainingBalance: new Prisma.Decimal(newRemainingBalance),
          isVoided: isFullRefund ? true : voucher.isVoided,
          status: isFullRefund ? "REFUNDED" : "PARTIALLY_REFUNDED",
          lastEditedAt: new Date(),
          lastEditedBy: userIdentifier,
        },
      });

      // 3. Create VoucherEdit audit log
      await tx.voucherEdit.create({
        data: {
          voucherId: voucher.id,
          editedBy: userIdentifier,
          editedAt: new Date(),
          fieldName: isFullRefund ? "refund_full" : "refund_partial",
          oldValue: `الرصيد المتبقي: ${remainingBalance.toLocaleString()} دج`,
          newValue: `الرصيد المتبقي: ${newRemainingBalance.toLocaleString()} دج (استرداد ${data.amount.toLocaleString()} دج)`,
          reason: data.reason.trim(),
        },
      });

      // 4. Record refund in DailyLedger (§1.1, Phase 6)
      await upsertDailyLedger(tx, {
        branchId: voucher.targetBranchId,
        date: new Date(),
        type: "REFUND",
        amount: data.amount,
      });

      // 5. Create general AuditLog
      await tx.auditLog.create({
        data: {
          entityType: "Voucher",
          entityId: String(voucher.id),
          action: isFullRefund ? "REFUND_FULL" : "REFUND_PARTIAL",
          branchId: voucher.targetBranchId,
          userId: userIdentifier,
          userName: userIdentifier,
          oldValue: String(remainingBalance),
          newValue: String(newRemainingBalance),
          details: `استرداد ${isFullRefund ? "كامل" : "جزئي"} بمبلغ ${data.amount} دج للوصل #${voucher.number}. السبب: ${data.reason.trim()}`,
          timestamp: new Date(),
        },
      });
    });

    try {
      safeRevalidatePath(`/list/payments`);
      safeRevalidatePath(`/list/payments/class/${voucher.classId}`);
      safeRevalidatePath(`/list/students/${voucher.studentId}`);
      safeRevalidatePath(`/list/reports`);
      safeRevalidatePath(`/list/finance`);
      safeRevalidatePath(`/admin`);
    } catch {
      // Ignore revalidatePath errors in non-HTTP request contexts
    }

    return {
      success: true,
      error: false,
      message: isFullRefund
        ? `تم استرداد كامل قيمة الوصل #${voucher.number} (${data.amount.toLocaleString()} دج) وإلغاؤه بنجاح.`
        : `تم استرداد مبلغ جزئي (${data.amount.toLocaleString()} دج) من الوصل #${voucher.number} بنجاح. الرصيد المتبقي: ${newRemainingBalance.toLocaleString()} دج.`,
    };
  } catch (err: any) {
    console.error("createRefund error:", err);
    return { success: false, error: true, message: err?.message || "فشل في تسجيل عملية الاسترداد." };
  }
};

// =================================================================
// WORKSHOP ACTIONS
// =================================================================

export const createWorkshop = async (
  currentState: CurrentState,
  data: WorkshopSchema
) => {
  try {
    const session = await getAuthSession();
    const activeBranchId = await getActiveBranchId();
    const branchId = (data as any).branchId ? Number((data as any).branchId) : (activeBranchId || session.branchIds[0] || 1);
    await prisma.$transaction(async (tx) => {
      const newWorkshop = await tx.workshop.create({
        data: {
          title: data.title,
          description: data.description || "",
          totalPrice: data.price !== undefined ? data.price : ((data as any).totalPrice !== undefined ? (data as any).totalPrice : 0),
          guestTeacher: data.teacherName || (data as any).guestTeacher || (data as any).teacher || "Professeur Invité",
          branchId: branchId,
        },
      });

      if (data.sessions && data.sessions.length > 0) {
        await tx.workshopSession.createMany({
          data: data.sessions.map((session) => ({
            workshopId: newWorkshop.id,
            startsAt: new Date(session.startTime),
            endsAt: new Date(session.endTime),
          })),
        });
      }
    });

    safeRevalidatePath("/list/workshops");
    return { success: true, error: false, message: "Atelier créé avec succès / تم انشاء الدورة بنجاح." };
  } catch (err) {
    console.log(err);
    return { success: false, error: true, message: "Échec de la création de l'atelier / فشل في انشاء الدورة." };
  }
};

export const updateWorkshop = async (
  currentState: CurrentState,
  data: WorkshopSchema
) => {
  if (!data.id) {
    return { success: false, error: true, message: "Identifiant d'atelier manquant / لا يوجد معرف الدورة." };
  }
  try {
    await prisma.$transaction(async (tx) => {
      await tx.workshop.update({
        where: { id: data.id },
        data: {
          title: data.title,
          description: data.description || "",
          totalPrice: data.price !== undefined ? data.price : ((data as any).totalPrice !== undefined ? (data as any).totalPrice : 0),
          guestTeacher: data.teacherName || (data as any).guestTeacher || (data as any).teacher || "Professeur Invité",
        },
      });

      await tx.workshopSession.deleteMany({
        where: { workshopId: data.id },
      });

      if (data.sessions && data.sessions.length > 0) {
        await tx.workshopSession.createMany({
          data: data.sessions.map((session) => ({
            workshopId: data.id!,
            startsAt: new Date(session.startTime),
            endsAt: new Date(session.endTime),
          })),
        });
      }
    });

    safeRevalidatePath("/list/workshops");
    safeRevalidatePath(`/list/workshops/${data.id}`);
    return { success: true, error: false, message: "Atelier mis à jour avec succès / تم تحديث الدورة بنجاح." };
  } catch (err) {
    console.log(err);
    return { success: false, error: true, message: "Échec de la mise à jour de l'atelier / فشل في تحديث الدورة." };
  }
};


export const deleteWorkshop = async (
  currentState: CurrentState,
  data: FormData
) => {
  const id = data.get("id") as string;
  try {
    await prisma.workshop.delete({
      where: { id: parseInt(id) },
    });
    safeRevalidatePath("/list/workshops");
    return { success: true, error: false, message: "Atelier supprimé avec succès / تم حذف الدورة بنجاح." };
  } catch (err) {
    console.log(err);
    return { success: false, error: true, message: "Échec de la suppression de l'atelier / فشل في حذف الدورة." };
  }
};


// =================================================================
// WORKSHOP MANAGEMENT ACTIONS
// =================================================================

// Action to register a new participant and optionally record their first payment via Voucher
export const registerParticipant = async (
  currentState: CurrentState,
  data: RegisterParticipantSchema
) => {
  try {
    const session = await getAuthSession();
    const activeBranchId = await getActiveBranchId();
    const branchId = activeBranchId || session.branchIds[0] || 1;

    const workshop = await prisma.workshop.findUnique({
      where: { id: data.workshopId },
    });
    if (!workshop) {
      return { success: false, error: true, message: "Atelier introuvable / الورشة المحددة غير موجودة." };
    }

    const targetBranchId = workshop.branchId;
    const isCrossBranch = branchId !== targetBranchId;
    const seriesScope = isCrossBranch ? "CROSS_BRANCH" : "LOCAL_LEVEL";
    const initialAmount = data.amount && data.amount > 0 ? Number(data.amount) : 0;

    let series: any = null;
    if (initialAmount > 0) {
      series = await prisma.voucherSeries.findFirst({
        where: {
          issuingBranchId: branchId,
          scope: seriesScope,
          ...(isCrossBranch ? { targetBranchId: targetBranchId } : {}),
        },
        orderBy: { id: "asc" },
      });

      if (!series) {
        series = await prisma.voucherSeries.create({
          data: {
            issuingBranchId: branchId,
            scope: seriesScope,
            targetBranchId: isCrossBranch ? targetBranchId : null,
            currentNumber: isCrossBranch ? 50 : 100,
          },
        });
      }
    }

    let createdVoucherNumber: number | null = null;

    await prisma.$transaction(async (tx) => {
      let student = await tx.student.findFirst({
        where: { name: data.name, ...(data.phone ? { phone: data.phone } : {}) },
      });
      if (!student) {
        const globalNumber = await getNextGlobalStudentNumber(tx);
        student = await tx.student.create({
          data: {
            id: `student_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
            globalNumber,
            name: data.name,
            phone: data.phone || null,
            registeredBranchId: branchId,
          },
        });
      }

      if (initialAmount > 0 && series) {
        const updatedSeries = await tx.voucherSeries.update({
          where: { id: series.id },
          data: { currentNumber: { increment: 1 } },
        });
        createdVoucherNumber = updatedSeries.currentNumber;

        await tx.voucher.create({
          data: {
            seriesId: series.id,
            number: updatedSeries.currentNumber,
            studentId: student.id,
            workshopId: workshop.id,
            classId: null,
            issuingBranchId: branchId,
            targetBranchId: targetBranchId,
            paymentType: "WORKSHOP",
            amount: new Prisma.Decimal(initialAmount),
            isPartial: initialAmount < Number(workshop.totalPrice),
            remainingBalance: initialAmount < Number(workshop.totalPrice) ? new Prisma.Decimal(Number(workshop.totalPrice) - initialAmount) : null,
            issuedBy: session.userId || "admin",
            isVoided: false,
            status: "ACTIVE",
          },
        });

        // Update DailyLedger at target branch (§1.1, §1.7)
        await upsertDailyLedger(tx, {
          branchId: targetBranchId,
          date: new Date(),
          type: "ATELIER_FORMATION",
          amount: initialAmount,
        });
      }

      const isPaidInFull = initialAmount >= Number(workshop.totalPrice);

      // Auto-assign chair number for this gender in this workshop (§7.14)
      // Continuous counter starting at 1, kept separately per gender (boys 1,2,3...; girls 1,2,3... independently)
      const participantGender = data.gender || "MALE";
      const maxChair = await tx.workshopParticipant.aggregate({
        where: {
          workshopId: data.workshopId,
          gender: participantGender,
        },
        _max: { chairNumber: true },
      });
      const nextChairNumber = (maxChair._max.chairNumber || 0) + 1;

      await tx.workshopParticipant.create({
        data: {
          workshopId: data.workshopId,
          studentId: student.id,
          gender: participantGender,
          chairNumber: nextChairNumber,
          status: isPaidInFull ? "PAID_IN_FULL" : "OWED",
          totalPaid: initialAmount,
          totalRefunded: 0,
        },
      });
    });

    try {
      safeRevalidatePath(`/list/workshops/${data.workshopId}`);
    } catch (_) {}
    return { 
      success: true, 
      error: false, 
      message: createdVoucherNumber 
        ? `Participant inscrit avec succès (Reçu #${createdVoucherNumber}) / تم تسجيل التلميذ بنجاح وإصدار وصل رقم #${createdVoucherNumber}.`
        : "Participant inscrit avec succès / تم تسجيل التلميذ بنجاح." 
    };
  } catch (err) {
    console.error("registerParticipant error:", err);
    return { success: false, error: true, message: "Échec de l'inscription du participant / فشل في تسجيل التلميذ." };
  }
};

// Action to update an existing participant's details
export const updateWorkshopParticipant = async (
  currentState: CurrentState,
  data: RegisterParticipantSchema & { id: number } // Reuse schema, but ensure ID is present
) => {
  if (!data.id) {
    return { success: false, error: true, message: "لا يوجد معرف للتلميذ." };
  }
  try {
    const participant = await prisma.workshopParticipant.findUnique({
      where: { id: data.id },
    });
    if (participant) {
      await prisma.student.update({
        where: { id: participant.studentId },
        data: {
          name: data.name,
          phone: data.phone || null,
        },
      });

      const participantGender = data.gender || participant.gender;
      let chairNumber = participant.chairNumber;

      // If gender was changed or chairNumber was missing, recalculate next chair number for the new gender
      if (data.gender && data.gender !== participant.gender) {
        const maxChair = await prisma.workshopParticipant.aggregate({
          where: {
            workshopId: participant.workshopId,
            gender: participantGender,
          },
          _max: { chairNumber: true },
        });
        chairNumber = (maxChair._max.chairNumber || 0) + 1;
      } else if (!chairNumber) {
        const maxChair = await prisma.workshopParticipant.aggregate({
          where: {
            workshopId: participant.workshopId,
            gender: participantGender,
          },
          _max: { chairNumber: true },
        });
        chairNumber = (maxChair._max.chairNumber || 0) + 1;
      }

      await prisma.workshopParticipant.update({
        where: { id: participant.id },
        data: {
          gender: participantGender,
          chairNumber: chairNumber,
        },
      });
    }

    try {
      safeRevalidatePath(`/list/workshops/${data.workshopId}`);
    } catch (_) {}
    return { success: true, error: false, message: "تم تحديث معلومات التلميذ بنجاح." };
  } catch (err) {
    console.log(err);
    return { success: false, error: true, message: "فشل في تحديث معلومات التلميذ." };
  }
};

export const deleteWorkshopParticipant = async (
  currentState: CurrentState,
  data: FormData
) => {
  const id = data.get("id") as string;
  const workshopId = data.get("workshopId") as string;
  try {
    await prisma.workshopParticipant.delete({
      where: { id: parseInt(id) },
    });
    safeRevalidatePath(`/list/workshops/${workshopId}`);
    return { success: true, error: false, message: "تم حذف التلميذ بنجاح." };
  } catch (err) {
    console.log(err);
    return { success: false, error: true, message: "فشل في حذف التلميذ." };
  }
};

// Action to record a subsequent payment for a workshop participant via digital Voucher (§1.2 & §1.7)
export const addWorkshopPayment = async (
  currentState: CurrentState,
  data: WorkshopPaymentSchema
) => {
  try {
    const session = await getAuthSession();
    const activeBranchId = await getActiveBranchId();
    const issuingBranchId = activeBranchId || session.branchIds[0] || 1;

    const participant = await prisma.workshopParticipant.findUnique({
      where: { id: data.participantId },
      include: { workshop: true, Student: true },
    });
    if (!participant) {
      return { success: false, error: true, message: "المشارك غير موجود." };
    }

    const workshop = participant.workshop;
    const targetBranchId = workshop.branchId;
    const isCrossBranch = issuingBranchId !== targetBranchId;
    const seriesScope = isCrossBranch ? "CROSS_BRANCH" : "LOCAL_LEVEL";
    const paymentAmount = Number(data.amount);

    let series = await prisma.voucherSeries.findFirst({
      where: {
        issuingBranchId: issuingBranchId,
        scope: seriesScope,
        ...(isCrossBranch ? { targetBranchId: targetBranchId } : {}),
      },
      orderBy: { id: "asc" },
    });

    if (!series) {
      series = await prisma.voucherSeries.create({
        data: {
          issuingBranchId: issuingBranchId,
          scope: seriesScope,
          targetBranchId: isCrossBranch ? targetBranchId : null,
          currentNumber: isCrossBranch ? 50 : 100,
        },
      });
    }

    let createdVoucher: any = null;

    await prisma.$transaction(async (tx) => {
      const updatedSeries = await tx.voucherSeries.update({
        where: { id: series.id },
        data: { currentNumber: { increment: 1 } },
      });
      const voucherNumber = updatedSeries.currentNumber;

      const newTotalPaid = Number(participant.totalPaid) + paymentAmount;
      const netPaid = newTotalPaid - Number(participant.totalRefunded || 0);
      const isPaidInFull = netPaid >= Number(workshop.totalPrice);

      createdVoucher = await tx.voucher.create({
        data: {
          seriesId: series.id,
          number: voucherNumber,
          studentId: participant.studentId,
          workshopId: workshop.id,
          classId: null,
          issuingBranchId: issuingBranchId,
          targetBranchId: targetBranchId,
          paymentType: "WORKSHOP",
          amount: new Prisma.Decimal(paymentAmount),
          isPartial: !isPaidInFull,
          remainingBalance: !isPaidInFull ? new Prisma.Decimal(Number(workshop.totalPrice) - netPaid) : null,
          issuedBy: session.userId || "admin",
          isVoided: false,
          status: "ACTIVE",
        },
      });

      // Update DailyLedger at target branch (§1.1)
      await upsertDailyLedger(tx, {
        branchId: targetBranchId,
        date: new Date(),
        type: "ATELIER_FORMATION",
        amount: paymentAmount,
      });

      // Update workshopParticipant totalPaid and status
      await tx.workshopParticipant.update({
        where: { id: participant.id },
        data: {
          totalPaid: { increment: paymentAmount },
          status: isPaidInFull ? "PAID_IN_FULL" : "OWED",
        },
      });
    });

    safeRevalidatePath(`/list/workshops/${data.workshopId}`);
    return { 
      success: true, 
      error: false, 
      message: `تم إصدار الوصل رقم #${createdVoucher?.number} وتسجيل الدفع بنجاح.` 
    };
  } catch (err) {
    console.error("addWorkshopPayment error:", err);
    return { success: false, error: true, message: "فشل في تسجيل الدفع وإصدار الوصل." };
  }
};

// Action to update an existing workshop payment
export const updateWorkshopPayment = async (
  currentState: CurrentState,
  data: WorkshopPaymentSchema
) => {
  if (!data.id) {
    return { success: false, error: true, message: "لا يوجد معرف لعملية الدفع." };
  }
  try {
    await prisma.workshopParticipant.update({
      where: { id: data.participantId },
      data: {
        totalPaid: data.amount,
      },
    });
    safeRevalidatePath(`/list/workshops/${data.workshopId}`);
    return { success: true, error: false, message: "تم تحديث عملية الدفع بنجاح." };
  } catch (err) {
    console.log(err);
    return { success: false, error: true, message: "فشل في تحديث عملية الدفع." };
  }
};



// Action to save attendance for a specific workshop session
export const saveWorkshopAttendance = async (
  sessionId: number,
  currentState: CurrentState,
  data: FormData
) => {
  const attendanceEntries = Array.from(data.entries()).filter(([key]) =>
    key.startsWith("attendance[")
  );

  if (attendanceEntries.length === 0) {
    return { success: false, error: true, message: "لم يتم إرسال بيانات الحضور." };
  }

  const workshopSession = await prisma.workshopSession.findUnique({ where: { id: sessionId }});
  if (!workshopSession) {
    return { success: false, error: true, message: "لم يتم العثور على حصص الدورة." };
  }

  try {
    for (const [key, value] of attendanceEntries) {
      const participantId = parseInt(key.substring(key.indexOf("[") + 1, key.indexOf("]")));
      const isPresent = (value as string) === "PRESENT";
      const participant = await prisma.workshopParticipant.findUnique({ where: { id: participantId } });
      if (!participant) continue;

      const existing = await prisma.workshopAttendance.findFirst({
        where: { sessionId, studentId: participant.studentId },
      });
      if (existing) {
        await prisma.workshopAttendance.update({
          where: { id: existing.id },
          data: { status: isPresent ? "PRESENT" : "ABSENT" },
        });
      } else {
        await prisma.workshopAttendance.create({
          data: {
            sessionId,
            studentId: participant.studentId,
            status: isPresent ? "PRESENT" : "ABSENT",
          },
        });
      }
    }

    safeRevalidatePath(`/list/workshops/${workshopSession.workshopId}`);
    return { success: true, error: false, message: "تم حفظ الحضور بنجاح." };
  } catch (err: any) {
    console.log(err);
    return { success: false, error: true, message: "فشل في حفظ الحضور." };
  }
};


// =================================================================
// DAILY LEDGER ACTIONS
// =================================================================

export const generateDailyLedger = async (date: Date) => {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  try {
    const vouchersToday = await prisma.voucher.findMany({
      where: {
        isVoided: false,
        issuedAt: { gte: startOfDay, lte: endOfDay },
      },
    });

    const activeBranchId = await getActiveBranchId();
    const branchVouchers = vouchersToday.filter(v => v.targetBranchId === activeBranchId);
    const totalToday = branchVouchers.reduce((sum, v) => sum + Number(v.amount), 0);

    if (totalToday > 0) {
      await prisma.dailyLedger.create({
        data: {
          branchId: activeBranchId,
          date: startOfDay,
          type: "SUMMARY",
          amount: new Prisma.Decimal(totalToday),
        },
      });
    }

    // Include refunds as a distinct negative line (§1.1)
    const refundsToday = await prisma.refund.findMany({
      where: {
        refundedAt: { gte: startOfDay, lte: endOfDay },
        voucher: { targetBranchId: activeBranchId },
      },
    });
    const totalRefundsToday = refundsToday.reduce((sum, r) => sum + Number(r.amount), 0);

    if (totalRefundsToday > 0) {
      await prisma.dailyLedger.create({
        data: {
          branchId: activeBranchId,
          date: startOfDay,
          type: "REFUND",
          amount: new Prisma.Decimal(-totalRefundsToday),
        },
      });
    }

    return { success: true, message: "تم تحديث دفتر الحسابات بنجاح." };
  } catch (err) {
    console.error("Failed to generate daily ledger:", err);
    return { success: false, error: true, message: "فشل في إنشاء دفتر الحسابات." };
  }
};

// =================================================================
// EXCEL EXPORT ACTIONS
// =================================================================

export const exportToExcel = async (
    type: string, 
    options?: { 
        classId?: number; 
        workshopId?: number; 
        dateFrom?: string; 
        dateTo?: string; 
        lessonId?: number;
        branchId?: number | "all" | string;
        periodMode?: "daily" | "weekly" | "monthly";
    }
) => {
  "use server";

  try {
    const workbook = new ExcelJS.Workbook();
    let filename = `${type}_export_${new Date().toISOString().split('T')[0]}.xlsx`;

    // Define columns and fetch data based on the export type
    switch (type) {
      case "students":
        const studentsSheet = workbook.addWorksheet("Students");
        const students = await prisma.student.findMany({
          include: {
            registeredBranch: true,
            enrollments: { include: { class: true } },
            family: true,
          },
          orderBy: { name: 'asc' }
        });
        studentsSheet.columns = [
          { header: "N° ID", key: "globalNumber", width: 12 },
          { header: "Nom et Prénom", key: "name", width: 25 },
          { header: "Téléphone", key: "phone", width: 20 },
          { header: "Branche d'inscription", key: "branch", width: 20 },
          { header: "Groupes inscrits", key: "classes", width: 35 },
          { header: "Famille / Rôle", key: "family", width: 25 },
        ];
        const studentsData = students.map(s => {
          const isPayer = s.family?.payerStudentId === s.id;
          const hasFamily = Boolean(s.familyId);
          const familyText = hasFamily ? (isPayer ? "Famille (Payeur désigné)" : "Famille (Élève exempté)") : "Individuel";
          return {
            globalNumber: s.globalNumber,
            name: s.name,
            phone: s.phone || "-",
            branch: s.registeredBranch?.name || "-",
            classes: s.enrollments.map(e => e.class.name).join(", "),
            family: familyText,
          };
        });
        studentsSheet.addRows(studentsData);
        studentsSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        studentsSheet.getRow(1).fill = { type: 'pattern', pattern:'solid', fgColor:{argb:'FF2F85FC'} };
        break;

      case "payments":
        if (!options?.classId) {
            return { success: false, error: true, message: "مطلوب معرف القسم (Class ID) لتصدير سجلات الدفع." };
        }
        const classTarget = await prisma.class.findUnique({
            where: { id: options.classId },
            include: {
              branch: true,
              enrollments: {
                include: {
                  student: {
                    include: {
                      registeredBranch: true,
                      family: true,
                      enrollments: { include: { class: { include: { branch: true } } } },
                    },
                  },
                  transfersFrom: true,
                  transfersTo: true,
                },
                orderBy: { enrolledAt: 'asc' },
              },
              vouchers: {
                where: { isVoided: false },
                orderBy: { issuedAt: 'asc' },
              },
              lessons: {
                where: { isFree: false },
                include: { attendances: { where: { status: 'PRESENT' } } },
              },
            },
        });

        if (!classTarget) {
            return { success: false, error: true, message: "لم يتم العثور على القسم." };
        }
        
        filename = `${classTarget.name.replace(/ /g, "_")}_grille_paiements_${new Date().toISOString().split('T')[0]}.xlsx`;
        const paymentSheet = workbook.addWorksheet(`${classTarget.name} - Grille`);

        const hasBooks = classTarget.hasBooks;

        paymentSheet.columns = [
            { header: "التلميذ", key: "studentName", width: 25 },
            { header: "رقم الهاتف", key: "phone", width: 16 },
            { header: "الفرع الأصلي", key: "registeredBranch", width: 16 },
            { header: "فروع أخرى مسجل بها", key: "otherBranches", width: 22 },
            { header: "حقوق التسجيل", key: "inscriptionFee", width: 18 },
            ...(hasBooks ? [{ header: "حقوق الكتاب", key: "bookFee", width: 16 }] : []),
            { header: "دورة 1 (حصص 1-4)", key: "cycle1", width: 16 },
            { header: "دورة 2 (حصص 5-8)", key: "cycle2", width: 16 },
            { header: "دورة 3 (حصص 9-12)", key: "cycle3", width: 16 },
            { header: "دورة 4 (حصص 13-16)", key: "cycle4", width: 16 },
            { header: "الحصص المستهلكة", key: "consumedSessions", width: 16 },
            { header: "الرصيد المتبقي", key: "remainingSessions", width: 16 },
            { header: "الحالة", key: "status", width: 18 },
        ];

        const paymentExportData: any[] = [];
        classTarget.enrollments.forEach((enrollment) => {
            const student = enrollment.student;
            const studentVouchers = classTarget.vouchers.filter(v => v.studentId === student.id);
            
            // Inscription fee status
            let inscriptionStatus = "غير مدفوع";
            if (enrollment.feeOverriddenByOwner && !enrollment.inscriptionFeeCharged) {
              inscriptionStatus = "معفى (استثناء مالك)";
            } else if (!enrollment.inscriptionFeeCharged) {
              inscriptionStatus = "معفى (4 فما فوق)";
            } else {
              const inscVoucher = studentVouchers.find(v => v.paymentType === "INSCRIPTION");
              if (inscVoucher) {
                inscriptionStatus = `مدفوع (${Number(inscVoucher.amount).toFixed()} دج)`;
              }
            }

            // Book fee status
            let bookStatus = "-";
            if (hasBooks) {
              const bookVoucher = studentVouchers.find(v => v.paymentType === "BOOK");
              bookStatus = bookVoucher ? `مدفوع (${Number(bookVoucher.amount).toFixed()} دج)` : "غير مدفوع";
            }

            // Sibling discount waiver
            const family = student.family;
            const isWaivedSibling = Boolean(
              family && family.payerStudentId && family.payerStudentId !== student.id
            );

            // Tuition vouchers calculation
            const tuitionVouchers = studentVouchers.filter(v => v.paymentType === "TUITION_4SESSION");
            
            const cyclePrice = Number(classTarget.pricePerCycle || 0);
            const lessonPrice = cyclePrice > 0 ? cyclePrice / 4 : 0;
            let totalTuitionSessions = 0;
            if (isWaivedSibling) {
              totalTuitionSessions = 16; // sibling has 100% tuition waiver
            } else if (lessonPrice > 0) {
              let totalPaidTuition = 0;
              tuitionVouchers.forEach((v) => {
                const vAmount = Number(v.amount || 0);
                const vRefunded = (v as any).refunds?.reduce((sum: number, r: any) => sum + Number(r.amount || 0), 0) || 0;
                totalPaidTuition += Math.max(0, vAmount - vRefunded);
              });
              totalTuitionSessions = Math.floor(totalPaidTuition / lessonPrice);
            } else {
              tuitionVouchers.forEach(() => {
                totalTuitionSessions += 4;
              });
            }

            // Credit transfers
            const outbound = enrollment.transfersFrom.reduce((sum, t) => sum + t.transferredSessions, 0);
            const inbound = enrollment.transfersTo.reduce((sum, t) => sum + t.transferredSessions, 0);

            // Consumed sessions from non-free lessons attended
            let consumed = 0;
            classTarget.lessons.forEach(l => {
              const att = l.attendances.find(a => a.studentId === student.id);
              if (att && att.status === "PRESENT") {
                consumed++;
              }
            });

            const remaining = (totalTuitionSessions + inbound - outbound) - consumed;

            // Status label
            let statusText = "غير دافع";
            if (isWaivedSibling) {
              statusText = "معفى (خصم الإخوة)";
            } else if (remaining >= 2) {
              statusText = "دافع";
            } else if (remaining === 1) {
              statusText = "قريب الانتهاء";
            }

            // Other branches enrolled
            const otherBranches = Array.from(
              new Set(
                student.enrollments
                  .map(e => e.class.branch.name)
                  .filter(bName => bName !== classTarget.branch.name)
              )
            ).join(", ") || "لا يوجد";

            // Cycles representation
            const c1 = isWaivedSibling ? "معفى" : (totalTuitionSessions >= 4 ? "مدفوع" : "غير مدفوع");
            const c2 = isWaivedSibling ? "معفى" : (totalTuitionSessions >= 8 ? "مدفوع" : "غير مدفوع");
            const c3 = isWaivedSibling ? "معفى" : (totalTuitionSessions >= 12 ? "مدفوع" : "غير مدفوع");
            const c4 = isWaivedSibling ? "معفى" : (totalTuitionSessions >= 16 ? "مدفوع" : "غير مدفوع");

            paymentExportData.push({
              studentName: student.name,
              phone: student.phone || "-",
              registeredBranch: student.registeredBranch?.name || "-",
              otherBranches: otherBranches,
              inscriptionFee: inscriptionStatus,
              ...(hasBooks ? { bookFee: bookStatus } : {}),
              cycle1: c1,
              cycle2: c2,
              cycle3: c3,
              cycle4: c4,
              consumedSessions: consumed,
              remainingSessions: isWaivedSibling ? "معفى" : remaining,
              status: statusText,
            });
        });

        paymentSheet.addRows(paymentExportData);
        paymentSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        paymentSheet.getRow(1).fill = { type: 'pattern', pattern:'solid', fgColor:{argb:'FF2F85FC'} };
        break;

      case "attendance":
        // 1. Safely get the filter options from the request
        const { classId, dateFrom, dateTo } = options || {};

        if (!classId) {
            return { success: false, error: true, message: "مطلوب معرف القسم (Class ID) لتصدير سجلات الحضور." };
        }




        const classData = await prisma.class.findUnique({
            where: { id: classId },
            include: {
                enrollments: {
                    include: {
                        student: {
                            include: {
                                attendances: {
                                    where: {
                                        lesson: {
                                            classId: classId,
                                            ...(dateFrom && dateTo ? {
                                                startsAt: {
                                                    gte: new Date(dateFrom),
                                                    lte: new Date(dateTo + "T23:59:59.999"),
                                                }
                                            } : {})
                                        }
                                    },
                                    include: {
                                        lesson: true
                                    }
                                }
                            }
                        }
                    }
                },
                lessons: {
                    where: {
                        ...(dateFrom && dateTo ? {
                            startsAt: {
                                gte: new Date(dateFrom),
                                lte: new Date(dateTo + "T23:59:59.999"),
                            }
                        } : {})
                    },
                    orderBy: { startsAt: 'asc' }
                }
            }
        });

        if (!classData) {
            return { success: false, error: true, message: "لم يتم العثور على القسم." };
        }

        const attendanceSheet = workbook.addWorksheet("Attendance Grid");
        filename = `Attendance_${classData.name.replace(/ /g, "_")}_${new Date().toISOString().split('T')[0]}.xlsx`;

        // Create column headers from lessons
        attendanceSheet.columns = [
            { header: "التلميذ", key: "studentName", width: 25 },
            ...classData.lessons.map(lesson => ({
                header: `حصة ${lesson.id}\n${new Date(lesson.startsAt).toLocaleDateString('fr-DZ')}`,
                key: `lesson_${lesson.id}`,
                width: 18,
            }))
        ];

        const studentRows = classData.enrollments.map(en => {
            const student = en.student;
            const row: { [key: string]: any } = {
                studentName: student.name,
            };
            classData.lessons.forEach(l => {
                const att = student.attendances.find(a => a.lessonId === l.id);
                row[`lesson_${l.id}`] = att ? (att.status === 'PRESENT' ? 'Present' : 'Absent') : '-';
            });
            return row;
        });

        attendanceSheet.addRows(studentRows);

        // Styling
        const headerRow = attendanceSheet.getRow(1);
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.fill = { type: 'pattern', pattern:'solid', fgColor:{argb:'FF2F85FC'} };
        headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        
        attendanceSheet.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }];

        attendanceSheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
            if (rowNumber > 1) {
                row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
                    if (colNumber > 1) {
                        cell.alignment = { vertical: 'middle', horizontal: 'center' };
                        if (cell.value === 'Present') {
                            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6EFCE' } };
                            cell.font = { color: { argb: 'FF006100' } };
                        } else if (cell.value === 'Absent') {
                            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC7CE' } };
                            cell.font = { color: { argb: 'FF9C0006' } };
                        }
                    }
                });
            }
        });
        break;

    case "workshop_details":
        if (!options?.workshopId) {
            return { success: false, error: true, message: "مطلوب معرف الدورة (Workshop ID) لإجراء عملية التصدير." };
        }
        const workshopSheet = workbook.addWorksheet("Workshop Roster");
        const workshopDetails = await prisma.workshop.findUnique({
            where: { id: options.workshopId },
            include: {
                sessions: {
                    include: {
                        attendances: true,
                    }
                },
                participants: {
                    include: {
                        Student: true,
                    }
                }
            }
        });

        if (!workshopDetails) {
            return { success: false, error: true, message: "لم يتم العثور على الدورة المطلوبة." };
        }

        filename = `${workshopDetails.title.replace(/ /g, "_")}_roster_${new Date().toISOString().split('T')[0]}.xlsx`;

        workshopSheet.columns = [
            { header: "Chair Number", key: "chairNumber", width: 15 },
            { header: "Participant Name", key: "name", width: 30 },
            { header: "Gender", key: "gender", width: 15 },
            { header: "Net Paid", key: "netPaid", width: 15, style: { numFmt: '"DZD"#,##0.00' } },
            { header: "Status", key: "paymentStatus", width: 20 },
            { header: "Sessions Attended", key: "sessionsAttended", width: 20 },
            { header: "Total Sessions", key: "totalSessions", width: 20 },
        ];

        const workshopData = workshopDetails.participants.map(p => {
            const netPaid = Number(p.totalPaid) - Number(p.totalRefunded);
            const sessionsAttended = workshopDetails.sessions
                .flatMap(s => s.attendances)
                .filter(a => a.studentId === p.studentId && a.status === 'PRESENT').length;

            return {
                chairNumber: p.chairNumber ?? "-",
                name: p.Student.name,
                gender: p.gender === "FEMALE" ? "Female / أنثى" : "Male / ذكر",
                netPaid: netPaid,
                paymentStatus: p.status,
                sessionsAttended: sessionsAttended,
                totalSessions: workshopDetails.sessions.length,
            };
        });

        workshopSheet.addRows(workshopData);
        workshopSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        workshopSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF800080' } };
        break;

      case "workshop_attendance":
        if (!options?.workshopId) {
            return { success: false, error: true, message: "مطلوب معرف الدورة (Workshop ID) لتصدير سجل الحضور." };
        }
        const wsData = await prisma.workshop.findUnique({
            where: { id: options.workshopId },
            include: {
                sessions: {
                    include: {
                        attendances: true,
                    },
                    orderBy: { startsAt: 'asc' }
                },
                participants: {
                    include: {
                        Student: true,
                    },
                    orderBy: [
                        { chairNumber: 'asc' },
                        { id: 'asc' }
                    ]
                }
            }
        });

        if (!wsData) {
            return { success: false, error: true, message: "لم يتم العثور على الدورة المطلوبة." };
        }

        filename = `Presence_${wsData.title.replace(/ /g, "_")}_${new Date().toISOString().split('T')[0]}.xlsx`;
        const wsAttendanceSheet = workbook.addWorksheet("Feuille de Présence");

        wsAttendanceSheet.columns = [
            { header: "N° Chaise / رقم الكرسي", key: "chairNumber", width: 14 },
            { header: "Élève / التلميذ", key: "studentName", width: 28 },
            { header: "Genre / الجنس", key: "gender", width: 14 },
            { header: "Téléphone / الهاتف", key: "phone", width: 16 },
            ...wsData.sessions.map((s, idx) => ({
                header: `Séance ${idx + 1}\n${new Date(s.startsAt).toLocaleDateString('fr-DZ')}`,
                key: `session_${s.id}`,
                width: 16,
            })),
            { header: "Total Présent / مجموع الحضور", key: "totalPresent", width: 18 },
            { header: "Taux / النسبة", key: "rate", width: 14 },
        ];

        const wsRows = wsData.participants.map(p => {
            let presentCount = 0;
            const row: { [key: string]: any } = {
                chairNumber: p.chairNumber != null ? `#${p.chairNumber}` : "-",
                studentName: p.Student?.name || `Élève #${p.studentId}`,
                gender: p.gender === "FEMALE" ? "Fille / أنثى" : "Garçon / ذكر",
                phone: p.Student?.phone || "-",
            };

            wsData.sessions.forEach(s => {
                const att = s.attendances.find(a => a.studentId === p.studentId);
                if (att) {
                    if (att.status === 'PRESENT') {
                        row[`session_${s.id}`] = 'Présent';
                        presentCount++;
                    } else {
                        row[`session_${s.id}`] = 'Absent';
                    }
                } else {
                    row[`session_${s.id}`] = '-';
                }
            });

            row.totalPresent = `${presentCount} / ${wsData.sessions.length}`;
            row.rate = wsData.sessions.length > 0 ? `${Math.round((presentCount / wsData.sessions.length) * 100)}%` : '0%';
            return row;
        });

        wsAttendanceSheet.addRows(wsRows);

        const wsHeaderRow = wsAttendanceSheet.getRow(1);
        wsHeaderRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        wsHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF800080' } };
        wsHeaderRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        wsAttendanceSheet.views = [{ state: 'frozen', xSplit: 2, ySplit: 1 }];

        wsAttendanceSheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
            if (rowNumber > 1) {
                row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
                    if (colNumber > 4 && colNumber <= 4 + wsData.sessions.length) {
                        cell.alignment = { vertical: 'middle', horizontal: 'center' };
                        if (cell.value === 'Présent') {
                            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6EFCE' } };
                            cell.font = { color: { argb: 'FF006100' } };
                        } else if (cell.value === 'Absent') {
                            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC7CE' } };
                            cell.font = { color: { argb: 'FF9C0006' } };
                        }
                    }
                });
            }
        });
        break;

      case "financial_report":
        const startOfRange = new Date(options?.dateFrom || new Date());
        startOfRange.setHours(0, 0, 0, 0);
        const endOfRange = new Date(options?.dateTo || options?.dateFrom || new Date());
        endOfRange.setHours(23, 59, 59, 999);

        const incomeSheet = workbook.addWorksheet("Income");
        const outcomeSheet = workbook.addWorksheet("Outcome (Refunds)");
        const summarySheet = workbook.addWorksheet("Summary");
        
        const incomeVouchers = await prisma.voucher.findMany({
          where: {
            isVoided: false,
            issuedAt: { gte: startOfRange, lte: endOfRange },
            ...(options?.classId && { classId: options.classId }),
          },
          include: { student: true, class: true, workshop: true },
        });

        const refunds = await prisma.refund.findMany({
          where: {
            refundedAt: { gte: startOfRange, lte: endOfRange },
            ...(options?.classId && { voucher: { classId: options.classId } }),
          },
          include: {
            voucher: {
              include: { student: true, class: true, workshop: true },
            },
          },
        });

        // --- Income Sheet ---
        const incomeColumns = [
            { header: "Date", key: "date", width: 15 },
            { header: "Type", key: "type", width: 20 },
            { header: "Source", key: "source", width: 25 },
            { header: "Student", key: "person", width: 25 },
            { header: "Amount (DZD)", key: "amount", width: 15 },
            { header: "Notes", key: "notes", width: 40 },
        ];
        incomeSheet.columns = incomeColumns;
        incomeSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        incomeSheet.getRow(1).fill = { type: 'pattern', pattern:'solid', fgColor:{argb:'FF2F85FC'} };
        
        const allIncome = incomeVouchers.map(v => ({
          date: v.issuedAt.toLocaleDateString(),
          type: v.paymentType,
          source: v.class?.name || v.workshop?.title || "ورشة عمل / دورة",
          person: v.student.name,
          amount: Number(v.amount),
          notes: `وصل رقم ${v.number}`,
        }));
        incomeSheet.addRows(allIncome);
        const totalIncome = allIncome.reduce((sum, i) => sum + i.amount, 0);
        
        // Add Total row for Income
        incomeSheet.addRow([]); // Spacer
        const incomeTotalRow = incomeSheet.addRow(['', '', '', 'Total Income:', totalIncome]);
        incomeTotalRow.getCell(4).font = { bold: true };
        incomeTotalRow.getCell(5).font = { bold: true, color: { argb: 'FF00B050' } };

        // --- Outcome Sheet (Refunds) ---
        const outcomeColumns = [
            { header: "Date", key: "date", width: 20 },
            { header: "Type", key: "type", width: 20 },
            { header: "Source", key: "source", width: 30 },
            { header: "Person", key: "person", width: 30 },
            { header: "Refunded By", key: "refundedBy", width: 20 },
            { header: "Amount", key: "amount", width: 20, style: { numFmt: '"DZD"#,##0.00' } },
            { header: "Reason", key: "notes", width: 40 },
        ];
        outcomeSheet.columns = outcomeColumns;
        outcomeSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        outcomeSheet.getRow(1).fill = { type: 'pattern', pattern:'solid', fgColor:{argb:'FFC00000'} };

        const allOutcomes = refunds.map(r => ({
            date: r.refundedAt.toLocaleDateString(),
            type: `استرداد (${r.voucher.paymentType})`,
            source: r.voucher.class?.name || `وصل #${r.voucher.number}`,
            person: r.voucher.student?.name || `تلميذ #${r.voucher.studentId}`,
            refundedBy: r.refundedBy,
            amount: Number(r.amount),
            notes: `وصل #${r.voucher.number} - ${r.reason}`,
        }));
        outcomeSheet.addRows(allOutcomes);
        const totalOutcome = allOutcomes.reduce((sum, o) => sum + o.amount, 0);

        // Add Total row for Outcome
        outcomeSheet.addRow([]); // Spacer
        const outcomeTotalRow = outcomeSheet.addRow(['', '', '', '', 'Total Outcome (Refunds):', totalOutcome]);
        outcomeTotalRow.getCell(5).font = { bold: true };
        outcomeTotalRow.getCell(6).font = { bold: true, color: { argb: 'FFFF0000' } };

        // --- Summary Sheet ---
        const netTotal = totalIncome - totalOutcome;

        // Add Report Header to Summary
        summarySheet.mergeCells('A1:B1');
        const titleCell = summarySheet.getCell('A1');
        titleCell.value = `Financial Summary`;
        titleCell.font = { size: 16, bold: true };
        titleCell.alignment = { vertical: 'middle', horizontal: 'center' };

        // --- UPDATED DATE RANGE LOGIC ---
        
        // Combine all fetched transactions to find the actual date span
        const allTransactions = [
          ...incomeVouchers.map(v => ({ date: v.issuedAt })),
          ...refunds.map(r => ({ date: r.refundedAt })),
        ];
        let dateRange = 'All Time';
        const dateOptions: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' };
        
        if (options?.dateFrom && options?.dateTo) {
            // Case 1: A specific date range was provided by the user.
            if (options.dateFrom === options.dateTo) {
                dateRange = new Date(options.dateFrom + 'T00:00:00').toLocaleDateString('fr-DZ', dateOptions);
            } else {
                const from = new Date(options.dateFrom + 'T00:00:00').toLocaleDateString('fr-DZ', dateOptions);
                const to = new Date(options.dateTo + 'T00:00:00').toLocaleDateString('fr-DZ', dateOptions);
                dateRange = `${from} to ${to}`;
            }
        } else if (allTransactions.length > 0) {
            // Case 2: No date range was provided, so we calculate it from the actual data.
            const allDates = allTransactions.map(t => t.date.getTime());
            const minDate = new Date(Math.min(...allDates));
            const maxDate = new Date(Math.max(...allDates));
            
            const from = minDate.toLocaleDateString('fr-DZ', dateOptions);
            const to = maxDate.toLocaleDateString('fr-DZ', dateOptions);
        
            // If the min and max date are the same day, just show one date.
            dateRange = from === to ? from : `${from} to ${to}`;
        } else {
            // Case 3: No date range provided AND no transactions were found.
            dateRange = "No transactions found";
        }
        
        summarySheet.mergeCells('A2:B2');
        const dateCell = summarySheet.getCell('A2');
        dateCell.value = `Date Range: ${dateRange}`;

        dateCell.font = { size: 12, italic: true };
        dateCell.alignment = { vertical: 'middle', horizontal: 'center' };
        summarySheet.addRow({}); // Spacer row

        summarySheet.columns = [ { header: 'Metric', key: 'metric', width: 25 }, { header: 'Amount', key: 'amount', width: 25, style: { numFmt: '"DZD"#,##0.00' } } ];
        const summaryHeaderRow = summarySheet.getRow(4);
        summaryHeaderRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        summaryHeaderRow.fill = { type: 'pattern', pattern:'solid', fgColor:{argb:'FF44546A'} };

        summarySheet.addRows([
            { metric: 'Total Income', amount: totalIncome },
            { metric: 'Total Outcome (Refunds)', amount: totalOutcome },
            { metric: 'Net Total', amount: netTotal },
        ]);

        const totalIncomeCell = summarySheet.getCell('B5');
        totalIncomeCell.font = { bold: true, color: { argb: 'FF00B050' } }; // Green
        const totalOutcomeCell = summarySheet.getCell('B6');
        totalOutcomeCell.font = { bold: true, color: { argb: totalOutcome > 0 ? 'FFFF0000' : 'FF000000' } }; // Red
        const netTotalCell = summarySheet.getCell('B7');
        netTotalCell.font = { bold: true, size: 12, color: { argb: netTotal >= 0 ? 'FF0070C0' : 'FFFF0000' } }; // Blue or Red
        
        break;

      case "daily_revenue":
        const branchParam = options?.branchId === "all" || !options?.branchId ? "all" : Number(options.branchId);
        const revenueData = await getDailyRevenueDashboardData({
          branchId: branchParam,
          dateFrom: options?.dateFrom,
          dateTo: options?.dateTo,
          periodMode: options?.periodMode || "daily",
        });

        const branchLabel = branchParam === "all" 
          ? "Toutes_les_branches" 
          : (revenueData.branches.find(b => b.id === branchParam)?.name || `Branche_${branchParam}`);
        
        filename = `Recettes_${branchLabel}_${options?.periodMode || "journalier"}_${new Date().toISOString().split('T')[0]}.xlsx`;

        // --- Sheet 1: Synthèse / Summary ---
        const revSummarySheet = workbook.addWorksheet("Synthèse financière");
        revSummarySheet.mergeCells("A1:D1");
        const revTitleCell = revSummarySheet.getCell("A1");
        revTitleCell.value = `Massinissa School - Rapport des Recettes (${branchParam === "all" ? "Consolidé - 3 Branches" : branchLabel})`;
        revTitleCell.font = { size: 14, bold: true, color: { argb: "FFFFFFFF" } };
        revTitleCell.alignment = { vertical: "middle", horizontal: "center" };
        revTitleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2F85FC" } };

        revSummarySheet.addRow([]);
        revSummarySheet.addRow(["Période du:", revenueData.dateFrom, "au:", revenueData.dateTo]);
        revSummarySheet.addRow(["Mode d'agrégation:", options?.periodMode || "daily", "Branche sélectionnée:", branchParam === "all" ? "Consolidé (3 branches)" : branchLabel]);
        revSummarySheet.addRow([]);

        revSummarySheet.addRow(["Catégorie de Recette", "Montant (DZD)", "Part du Brut (%)"]);
        const sumHeader = revSummarySheet.getRow(6);
        sumHeader.font = { bold: true, color: { argb: "FFFFFFFF" } };
        sumHeader.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF44546A" } };

        const gross = revenueData.summary.grossRevenue;
        const calcShare = (val: number) => (gross > 0 ? ((val / gross) * 100).toFixed(1) + "%" : "0.0%");

        revSummarySheet.addRows([
          ["Frais d'inscription (INSCRIPTION)", revenueData.summary.inscription, calcShare(revenueData.summary.inscription)],
          ["Frais de scolarité (TUITION)", revenueData.summary.tuition, calcShare(revenueData.summary.tuition)],
          ["Frais de livres (BOOK)", revenueData.summary.book, calcShare(revenueData.summary.book)],
          ["Ateliers & Formations (ATELIER / FORMATION)", revenueData.summary.atelierFormation, calcShare(revenueData.summary.atelierFormation)],
          [],
          ["TOTAL RECETTES BRUTES", revenueData.summary.grossRevenue, "100.0%"],
          ["REMBOURSEMENTS (REFUNDS - Déduits)", revenueData.summary.refunds, "-"],
          ["RECETTE NETTE FINALE", revenueData.summary.netRevenue, "-"],
        ]);

        revSummarySheet.getColumn(1).width = 45;
        revSummarySheet.getColumn(2).width = 25;
        revSummarySheet.getColumn(3).width = 20;
        revSummarySheet.getColumn(2).numFmt = '"DZD"#,##0.00';

        const rowGross = revSummarySheet.getRow(12);
        rowGross.font = { bold: true, color: { argb: "FF00B050" } };
        const rowRefunds = revSummarySheet.getRow(13);
        rowRefunds.font = { bold: true, color: { argb: "FFFF0000" } };
        const rowNet = revSummarySheet.getRow(14);
        rowNet.font = { bold: true, size: 12, color: { argb: "FF0070C0" } };

        // --- Sheet 2: Évolution par Période (Timeline) ---
        const timelineSheet = workbook.addWorksheet("Détail par période");
        timelineSheet.columns = [
          { header: "Période", key: "label", width: 25 },
          { header: "Date début", key: "dateStart", width: 15 },
          { header: "Date fin", key: "dateEnd", width: 15 },
          { header: "Inscription", key: "inscription", width: 18, style: { numFmt: '"DZD"#,##0.00' } },
          { header: "Scolarité", key: "tuition", width: 18, style: { numFmt: '"DZD"#,##0.00' } },
          { header: "Livres", key: "book", width: 18, style: { numFmt: '"DZD"#,##0.00' } },
          { header: "Atelier/Formation", key: "atelierFormation", width: 22, style: { numFmt: '"DZD"#,##0.00' } },
          { header: "Total Brut", key: "grossRevenue", width: 20, style: { numFmt: '"DZD"#,##0.00' } },
          { header: "Remboursements", key: "refunds", width: 20, style: { numFmt: '"DZD"#,##0.00' } },
          { header: "Total Net", key: "netRevenue", width: 20, style: { numFmt: '"DZD"#,##0.00' } },
        ];
        timelineSheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
        timelineSheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2F85FC" } };

        for (const tRow of revenueData.timeline) {
          timelineSheet.addRow({
            label: tRow.label,
            dateStart: tRow.dateStart,
            dateEnd: tRow.dateEnd,
            inscription: tRow.inscription,
            tuition: tRow.tuition,
            book: tRow.book,
            atelierFormation: tRow.atelierFormation,
            grossRevenue: tRow.grossRevenue,
            refunds: tRow.refunds,
            netRevenue: tRow.netRevenue,
          });
        }

        // --- Sheet 3: Comparaison des Branches (ECOLE, ANNEX, AMPHI) ---
        const branchSheet = workbook.addWorksheet("Comparaison des branches");
        branchSheet.columns = [
          { header: "Branche", key: "branchName", width: 20 },
          { header: "Inscription", key: "inscription", width: 18, style: { numFmt: '"DZD"#,##0.00' } },
          { header: "Scolarité", key: "tuition", width: 18, style: { numFmt: '"DZD"#,##0.00' } },
          { header: "Livres", key: "book", width: 18, style: { numFmt: '"DZD"#,##0.00' } },
          { header: "Atelier/Formation", key: "atelierFormation", width: 22, style: { numFmt: '"DZD"#,##0.00' } },
          { header: "Total Brut", key: "grossRevenue", width: 20, style: { numFmt: '"DZD"#,##0.00' } },
          { header: "Remboursements", key: "refunds", width: 20, style: { numFmt: '"DZD"#,##0.00' } },
          { header: "Total Net", key: "netRevenue", width: 20, style: { numFmt: '"DZD"#,##0.00' } },
        ];
        branchSheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
        branchSheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2F85FC" } };

        for (const bRow of revenueData.branchComparison) {
          branchSheet.addRow({
            branchName: bRow.branchName,
            inscription: bRow.inscription,
            tuition: bRow.tuition,
            book: bRow.book,
            atelierFormation: bRow.atelierFormation,
            grossRevenue: bRow.grossRevenue,
            refunds: bRow.refunds,
            netRevenue: bRow.netRevenue,
          });
        }

        // --- Sheet 4: Détail des Remboursements (Phase 6 - Distincts, non-nettoyés) ---
        const refundSheet = workbook.addWorksheet("Remboursements (Détail)");
        refundSheet.columns = [
          { header: "Date", key: "date", width: 20 },
          { header: "Branche", key: "branch", width: 18 },
          { header: "N° Reçu", key: "voucherNumber", width: 15 },
          { header: "Élève", key: "student", width: 25 },
          { header: "Classe / Motif", key: "reason", width: 35 },
          { header: "Montant remboursé", key: "amount", width: 20, style: { numFmt: '"DZD"#,##0.00' } },
          { header: "Remboursé par", key: "refundedBy", width: 20 },
        ];
        refundSheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
        refundSheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9534F" } };

        const startOfRangeDate = new Date(revenueData.dateFrom + "T00:00:00.000Z");
        const endOfRangeDate = new Date(revenueData.dateTo + "T23:59:59.999Z");

        const detailedRefunds = await prisma.refund.findMany({
          where: {
            refundedAt: { gte: startOfRangeDate, lte: endOfRangeDate },
            ...(branchParam !== "all" ? { voucher: { targetBranchId: Number(branchParam) } } : {}),
          },
          include: {
            voucher: {
              include: {
                student: true,
                class: { include: { branch: true } },
              },
            },
          },
          orderBy: { refundedAt: "desc" },
        });

        for (const ref of detailedRefunds) {
          refundSheet.addRow({
            date: ref.refundedAt.toISOString().split("T")[0],
            branch: ref.voucher?.class?.branch?.name || "-",
            voucherNumber: `#${ref.voucher?.number || ref.voucherId}`,
            student: ref.voucher?.student?.name || "-",
            reason: ref.reason,
            amount: Number(ref.amount),
            refundedBy: ref.refundedBy,
          });
        }
        break;


      default:
        return { success: false, error: true, message: "Invalid export type specified." };
    }

    // Generate the Excel file buffer
    const buffer = await workbook.xlsx.writeBuffer();

    // Return the file data as a base64 encoded string for download
    return {
      success: true,
      error: false,
      file: {
        content: Buffer.from(buffer).toString("base64"),
        name: filename,
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    };

  } catch (err) {
    console.error("Export Error:", err);
    return { success: false, error: true, message: "Failed to export data." };
  }
};

// ============================================================================
// PAYROLL SERVER ACTIONS (§1.3, §2.5)
// ============================================================================

import {
  generatePayrollRun,
  updatePayrollRunStatus,
  deletePayrollRun,
} from "./payroll";

/**
 * Configure or update a teacher's pay rate (per-session or fixed-monthly),
 * and optionally set per-branch overrides on TeacherBranch.
 */
export async function saveTeacherPayRateAction(formData: {
  teacherId: string;
  ratePerSession?: number | null;
  fixedMonthly?: number | null;
  effectiveFrom?: string | Date;
  branchRates?: Array<{ branchId: number; payRate: number | null }>;
}) {
  try {
    const session = await getAuthSession();
    if (!session.isOwnerOrAdmin) {
      return { success: false, error: true, message: "غير مسموح بهذا الإجراء" };
    }

    const effectiveDate = formData.effectiveFrom
      ? new Date(formData.effectiveFrom)
      : new Date();

    await prisma.$transaction(async (tx) => {
      // 1. Create or update general pay rate
      await tx.teacherPayRate.create({
        data: {
          teacherId: formData.teacherId,
          ratePerSession:
            formData.ratePerSession !== undefined && formData.ratePerSession !== null
              ? new Prisma.Decimal(formData.ratePerSession)
              : null,
          fixedMonthly:
            formData.fixedMonthly !== undefined && formData.fixedMonthly !== null
              ? new Prisma.Decimal(formData.fixedMonthly)
              : null,
          effectiveFrom: effectiveDate,
        },
      });

      // 2. Update branch rate overrides if specified
      if (formData.branchRates && formData.branchRates.length > 0) {
        for (const br of formData.branchRates) {
          await tx.teacherBranch.upsert({
            where: {
              teacherId_branchId: {
                teacherId: formData.teacherId,
                branchId: br.branchId,
              },
            },
            create: {
              teacherId: formData.teacherId,
              branchId: br.branchId,
              payRate:
                br.payRate !== null && br.payRate !== undefined
                  ? new Prisma.Decimal(br.payRate)
                  : null,
            },
            update: {
              payRate:
                br.payRate !== null && br.payRate !== undefined
                  ? new Prisma.Decimal(br.payRate)
                  : null,
            },
          });
        }
      }
    });

    safeRevalidatePath("/list/payroll");
    safeRevalidatePath("/list/finance");
    safeRevalidatePath(`/list/teachers/${formData.teacherId}`);
    return { success: true, error: false, message: "تم تحديث تسعيرة الأستاذ بنجاح" };
  } catch (error: any) {
    console.error("Error in saveTeacherPayRateAction:", error);
    return { success: false, error: true, message: error.message || "فشل حفظ التسعيرة" };
  }
}

/**
 * Record Photocopy Cost for a teacher (§2.5).
 * Internal charge deducted from the teacher's next payslip, never student-facing.
 */
export async function recordPhotocopyChargeAction(formData: {
  teacherId: string;
  branchId: number;
  classId?: number | null;
  pages: number;
  costAmount: number;
  date?: string | Date;
}) {
  try {
    const session = await getAuthSession();
    if (!session.isOwnerOrAdmin) {
      return { success: false, error: true, message: "غير مسموح بهذا الإجراء" };
    }

    const recordedBy = session.userId || "admin";
    const chargeDate = formData.date ? new Date(formData.date) : new Date();

    const charge = await prisma.photocopyCharge.create({
      data: {
        teacherId: formData.teacherId,
        branchId: Number(formData.branchId),
        classId: formData.classId ? Number(formData.classId) : null,
        pages: Number(formData.pages),
        costAmount: new Prisma.Decimal(formData.costAmount),
        date: chargeDate,
        recordedBy,
      },
    });

    safeRevalidatePath("/list/payroll");
    safeRevalidatePath("/list/finance");
    safeRevalidatePath(`/list/teachers/${formData.teacherId}`);
    return {
      success: true,
      error: false,
      message: `تم تسجيل تكلفة النسخ (${formData.pages} صفحة - ${formData.costAmount} دج) واحتسابها كخصم قادم للأستاذ`,
      data: charge,
    };
  } catch (error: any) {
    console.error("Error in recordPhotocopyChargeAction:", error);
    return { success: false, error: true, message: error.message || "فشل تسجيل تكلفة النسخ" };
  }
}

/**
 * Record a Salary Advance for a teacher.
 * Auto-deducted from next payslip's net amount.
 */
export async function recordSalaryAdvanceAction(formData: {
  personId: string;
  amount: number;
  date?: string | Date;
}) {
  try {
    const session = await getAuthSession();
    if (!session.isOwnerOrAdmin) {
      return { success: false, error: true, message: "غير مسموح بهذا الإجراء" };
    }

    const advanceDate = formData.date ? new Date(formData.date) : new Date();

    const advance = await prisma.salaryAdvance.create({
      data: {
        personId: formData.personId,
        amount: new Prisma.Decimal(formData.amount),
        date: advanceDate,
      },
    });

    safeRevalidatePath("/list/payroll");
    safeRevalidatePath("/list/finance");
    return {
      success: true,
      error: false,
      message: `تم تسجيل التسبيق المالي (${formData.amount} دج) بنجاح`,
      data: advance,
    };
  } catch (error: any) {
    console.error("Error in recordSalaryAdvanceAction:", error);
    return { success: false, error: true, message: error.message || "فشل تسجيل التسبيق" };
  }
}

/**
 * Generate a new PayrollRun for a specified period.
 */
export async function generatePayrollRunAction(formData: {
  periodStart: string | Date;
  periodEnd: string | Date;
}) {
  try {
    const session = await getAuthSession();
    if (!session.isOwnerOrAdmin) {
      return { success: false, error: true, message: "غير مسموح بهذا الإجراء" };
    }

    const run = await generatePayrollRun(formData.periodStart, formData.periodEnd);

    safeRevalidatePath("/list/payroll");
    safeRevalidatePath("/list/finance");
    return {
      success: true,
      error: false,
      message: `تم إنشاء دورة الرواتب #${run.id} وحساب قسائم الرواتب الموحدة بنجاح`,
      runId: run.id,
    };
  } catch (error: any) {
    console.error("Error in generatePayrollRunAction:", error);
    return { success: false, error: true, message: error.message || "فشل إنشاء دورة الرواتب" };
  }
}

/**
 * Update the status of a PayrollRun (DRAFT | VALIDATED | PAID).
 */
export async function setPayrollRunStatusAction(formData: {
  payrollRunId: number;
  status: "DRAFT" | "VALIDATED" | "PAID";
}) {
  try {
    const session = await getAuthSession();
    if (!session.isOwnerOrAdmin) {
      return { success: false, error: true, message: "غير مسموح بهذا الإجراء" };
    }

    await updatePayrollRunStatus(formData.payrollRunId, formData.status);

    safeRevalidatePath("/list/payroll");
    safeRevalidatePath("/list/finance");
    safeRevalidatePath(`/list/payroll/payslips`);
    return {
      success: true,
      error: false,
      message: `تم تحديث حالة دورة الرواتب إلى ${formData.status}`,
    };
  } catch (error: any) {
    console.error("Error in setPayrollRunStatusAction:", error);
    return { success: false, error: true, message: error.message || "فشل تحديث حالة الدورة" };
  }
}

/**
 * Delete / undo a PayrollRun and its generated payslips.
 */
export async function deletePayrollRunAction(payrollRunId: number) {
  try {
    const session = await getAuthSession();
    if (!session.can("manage", "payroll") && !session.isOwner) {
      return { success: false, error: true, message: "غير مصرح لك بإلغاء دورة الرواتب." };
    }

    await deletePayrollRun(payrollRunId);

    safeRevalidatePath("/list/payroll");
    safeRevalidatePath("/list/finance");
    safeRevalidatePath(`/list/payroll/payslips`);

    return {
      success: true,
      error: false,
      message: "تم إلغاء وحذف دورة الرواتب بنجاح.",
    };
  } catch (error: any) {
    console.error("Error in deletePayrollRunAction:", error);
    return {
      success: false,
      error: true,
      message: error?.message || "فشل إلغاء دورة الرواتب.",
    };
  }
}

// =================================================================
// BOOK DROP & PHOTOCOPY ACTIONS (§2.5, §2.11)
// =================================================================

/**
 * Record a Book Drop for a teacher (§2.11).
 * Branch and date are captured automatically from the admin session and current date.
 * School Level is selected on creation (or existing Book chosen) — NOT individual groups.
 * Eligibility is automatically computed from Class.teacherId + Class.levelId.
 */
export async function recordBookDropAction(formData: {
  teacherId: string;
  bookId?: number;
  newBookTitle?: string;
  levelId?: number;
  quantity: number;
}) {
  try {
    const session = await getAuthSession();
    if (!session.isOwnerOrAdmin) {
      return { success: false, error: true, message: "غير مصرح لك بهذا الإجراء." };
    }

    const branchId = await getActiveBranchId();
    const recordedBy = session.userId || session.rawRole || "admin";
    const quantity = Number(formData.quantity);

    if (!quantity || quantity < 1) {
      return { success: false, error: true, message: "يجب إدخال كمية صحيحة أكبر من صفر." };
    }

    let targetBookId = formData.bookId ? Number(formData.bookId) : null;

    if (!targetBookId) {
      if (!formData.newBookTitle || !formData.levelId) {
        return { success: false, error: true, message: "يرجى إدخال عنوان الكتاب والمستوى الدراسي." };
      }

      // Find current active trimester or latest
      const currentTrimester = await prisma.trimester.findFirst({
        orderBy: { startDate: "desc" },
      });

      const newBook = await prisma.book.create({
        data: {
          teacherId: formData.teacherId,
          levelId: Number(formData.levelId),
          title: formData.newBookTitle.trim(),
          trimesterId: currentTrimester?.id ?? null,
        },
      });
      targetBookId = newBook.id;
    }

    const drop = await prisma.bookDrop.create({
      data: {
        bookId: targetBookId,
        branchId,
        quantity,
        dropDate: new Date(),
        recordedBy,
      },
      include: {
        book: {
          include: { level: true },
        },
        branch: true,
      },
    });

    if (drop.book.levelId) {
      await prisma.class.updateMany({
        where: {
          teacherId: formData.teacherId,
          levelId: drop.book.levelId,
        },
        data: {
          hasBooks: true,
        },
      });
    }

    safeRevalidatePath("/list/teachers");
    safeRevalidatePath(`/list/teachers/${formData.teacherId}`);
    safeRevalidatePath("/list/classes");

    return {
      success: true,
      error: false,
      message: `تم تسجيل إيداع ${quantity} نسخة من كتاب "${drop.book.title}" بنجاح.`,
      data: drop,
    };
  } catch (error: any) {
    console.error("Error in recordBookDropAction:", error);
    return { success: false, error: true, message: error.message || "فشل تسجيل إيداع الكتاب." };
  }
}

/**
 * Record a Photocopy Charge for a teacher (§2.5).
 * Opens with only a page-count input; the cost is auto-computed server-side from
 * Teacher.photocopyRatePerPage. Admin never sees or enters a cost calculation.
 * Branch and date are captured automatically from the admin session and current date.
 */
export async function recordTeacherPhotocopyAction(formData: {
  teacherId: string;
  pages: number;
  branchId?: number;
  classId?: number | null;
}) {
  try {
    const session = await getAuthSession();
    if (!session.isOwnerOrAdmin) {
      return { success: false, error: true, message: "غير مصرح لك بهذا الإجراء." };
    }

    const branchId = formData.branchId ? Number(formData.branchId) : await getActiveBranchId();
    const recordedBy = session.userId || session.rawRole || "admin";
    const pages = Number(formData.pages);

    if (!pages || pages < 1) {
      return { success: false, error: true, message: "يرجى إدخال عدد صفحات صالح (1 على الأقل)." };
    }

    const teacher = await prisma.teacher.findUnique({
      where: { id: formData.teacherId },
      select: { id: true, name: true, photocopyRatePerPage: true },
    });

    if (!teacher) {
      return { success: false, error: true, message: "لم يتم العثور على الأستاذ المطلوب." };
    }

    const rate = teacher.photocopyRatePerPage ? Number(teacher.photocopyRatePerPage) : 0;
    const costAmount = pages * rate;

    const charge = await prisma.photocopyCharge.create({
      data: {
        teacherId: formData.teacherId,
        branchId,
        classId: formData.classId ? Number(formData.classId) : null,
        pages,
        costAmount: new Prisma.Decimal(costAmount),
        date: new Date(),
        recordedBy,
      },
    });

    safeRevalidatePath("/list/teachers");
    safeRevalidatePath(`/list/teachers/${formData.teacherId}`);
    safeRevalidatePath("/list/payroll");

    return {
      success: true,
      error: false,
      message: `تم تسجيل ${pages} صفحة للأستاذ ${teacher.name} بنجاح.`,
      data: charge,
    };
  } catch (error: any) {
    console.error("Error in recordTeacherPhotocopyAction:", error);
    return { success: false, error: true, message: error.message || "فشل تسجيل تكلفة النسخ." };
  }
}

/**
 * Update a teacher's individual photocopyRatePerPage (Owner-only).
 */
export async function updateTeacherPhotocopyRateAction(formData: {
  teacherId: string;
  ratePerPage: number;
}) {
  try {
    const session = await getAuthSession();
    if (!session.isOwner) {
      return { success: false, error: true, message: "Action réservée au propriétaire / تحديد سعر النسخ متاح للمالك فقط." };
    }

    const rate = Number(formData.ratePerPage);
    if (isNaN(rate) || rate < 0) {
      return { success: false, error: true, message: "Tarif par page non valide / يرجى إدخال سعر صالح للصفحة." };
    }

    await prisma.teacher.update({
      where: { id: formData.teacherId },
      data: { photocopyRatePerPage: new Prisma.Decimal(rate) },
    });

    safeRevalidatePath("/list/teachers");
    safeRevalidatePath(`/list/teachers/${formData.teacherId}`);

    return {
      success: true,
      error: false,
      message: `Tarif de photocopie mis à jour à ${rate} DZD/page avec succès / تم تحديث سعر النسخ إلى ${rate} دج/صفحة بنجاح.`,
    };
  } catch (error: any) {
    console.error("Error in updateTeacherPhotocopyRateAction:", error);
    return { success: false, error: true, message: error.message || "Échec de mise à jour du tarif de photocopie / فشل تحديث سعر النسخ." };
  }
}

/**
 * Update a teacher's individual payroll percentage (percentageOfSessionFee) - OWNER-ONLY per §2.9.
 * Changing it immediately affects how this teacher's payroll is calculated going forward.
 */
export async function updateTeacherPayrollPercentageAction(formData: {
  teacherId: string;
  percentage: number;
}) {
  try {
    const session = await getAuthSession();
    if (!session.isOwner) {
      return { success: false, error: true, message: "Action réservée au propriétaire / تحديد نسبة الأستاذ متاح للمالك فقط." };
    }

    const percentage = Number(formData.percentage);
    if (isNaN(percentage) || percentage < 0 || percentage > 100) {
      return { success: false, error: true, message: "Pourcentage non valide (entre 0 et 100) / يرجى إدخال نسبة مئوية صالحة بين 0 و 100." };
    }

    const teacher = await prisma.teacher.findUnique({
      where: { id: formData.teacherId },
      select: { id: true, name: true },
    });

    if (!teacher) {
      return { success: false, error: true, message: "Enseignant introuvable / لم يتم العثور على الأستاذ المطلوب." };
    }

    // Immediately save new active rate
    await prisma.teacherPayRate.create({
      data: {
        teacherId: formData.teacherId,
        percentageOfSessionFee: new Prisma.Decimal(percentage),
        effectiveFrom: new Date(),
      },
    });

    safeRevalidatePath("/list/teachers");
    safeRevalidatePath(`/list/teachers/${formData.teacherId}`);
    safeRevalidatePath("/list/payroll");
    safeRevalidatePath("/list/finance");

    return {
      success: true,
      error: false,
      message: `Pourcentage de rémunération de l'enseignant ${teacher.name} mis à jour à ${percentage}% avec succès / تم تحديث نسبة أجر الأستاذ ${teacher.name} إلى ${percentage}% بنجاح.`,
    };
  } catch (error: any) {
    console.error("Error in updateTeacherPayrollPercentageAction:", error);
    return { success: false, error: true, message: error.message || "Échec de mise à jour de la rémunération / فشل تحديث نسبة الأستاذ." };
  }
}

// =================================================================
// MISSING MONEY ("MANQUE") ACTIONS (§7.11)
// =================================================================

export async function declareMissingMoneyAction(data: {
  branchId: number;
  amount: number;
  reason?: string;
}): Promise<{ success: boolean; error: boolean; message: string }> {
  try {
    const session = await getAuthSession();

    if (!session.isOwner && !session.isBranchAdmin) {
      return {
        success: false,
        error: true,
        message: "Accès non autorisé / غير مصرح بالعملية",
      };
    }

    const branchId = Number(data.branchId);
    if (isNaN(branchId)) {
      return {
        success: false,
        error: true,
        message: "Identifiant de branche invalide / معرف الفرع غير صالح",
      };
    }

    // Branch admins can strictly declare only for their own branch
    if (session.isBranchAdmin && !session.isOwner) {
      const userBranchId = session.branchIds[0];
      if (userBranchId !== branchId) {
        return {
          success: false,
          error: true,
          message: "Vous ne pouvez déclarer un manque que pour votre propre branche / يمكنك التصريح فقط لفرعك التابع له",
        };
      }
    }

    const amount = Number(data.amount);
    if (isNaN(amount) || amount <= 0) {
      return {
        success: false,
        error: true,
        message: "Veuillez saisir un montant manquant supérieur à 0 / يرجى إدخال مبلغ عجز أكبر من الصفر",
      };
    }

    const todayDate = normalizeDateToStartOfDay(new Date());

    await prisma.missingMoney.create({
      data: {
        branchId,
        date: todayDate,
        amount: new Prisma.Decimal(amount),
        reason: data.reason?.trim() || null,
        declaredBy: session.userId || session.rawRole || "admin",
        status: "PENDING",
      },
    });

    safeRevalidatePath("/list/daily-ledger");
    safeRevalidatePath("/list/finance");

    return {
      success: true,
      error: false,
      message: "Déclaration de manque enregistrée avec succès. En attente de confirmation par le propriétaire. / تم تسجيل عجز الصندوق بنجاح. في انتظار تأكيد المالك.",
    };
  } catch (err: any) {
    console.error("declareMissingMoneyAction error:", err);
    return {
      success: false,
      error: true,
      message: err.message || "Erreur lors de l'enregistrement / حدث خطأ أثناء التسجيل",
    };
  }
}

export async function confirmMissingMoneyAction(id: number): Promise<{
  success: boolean;
  error: boolean;
  message: string;
}> {
  try {
    const session = await getAuthSession();

    if (!session.isOwner) {
      return {
        success: false,
        error: true,
        message: "Seul le propriétaire peut confirmer un manque de caisse / هذا الإجراء متاح لمالك المؤسسة فقط",
      };
    }

    const missingRecord = await prisma.missingMoney.findUnique({
      where: { id },
    });

    if (!missingRecord) {
      return {
        success: false,
        error: true,
        message: "Enregistrement de manque introuvable / لم يتم العثور على سجل العجز",
      };
    }

    await prisma.missingMoney.update({
      where: { id },
      data: {
        status: "CONFIRMED",
        confirmedBy: session.userId || "owner",
        confirmedAt: new Date(),
      },
    });

    safeRevalidatePath("/list/daily-ledger");
    safeRevalidatePath("/list/finance");

    return {
      success: true,
      error: false,
      message: "Manque de caisse confirmé avec succès et déduit du revenu net. / تم تأكيد عجز الصندوق وخصمه من صافي المداخيل.",
    };
  } catch (err: any) {
    console.error("confirmMissingMoneyAction error:", err);
    return {
      success: false,
      error: true,
      message: err.message || "Erreur lors de la confirmation / حدث خطأ أثناء التأكيد",
    };
  }
}

export async function rejectMissingMoneyAction(id: number): Promise<{
  success: boolean;
  error: boolean;
  message: string;
}> {
  try {
    const session = await getAuthSession();

    if (!session.isOwner) {
      return {
        success: false,
        error: true,
        message: "Seul le propriétaire peut rejeter un manque de caisse / هذا الإجراء متاح لمالك المؤسسة فقط",
      };
    }

    await prisma.missingMoney.update({
      where: { id },
      data: {
        status: "REJECTED",
        confirmedBy: session.userId || "owner",
        confirmedAt: new Date(),
      },
    });

    safeRevalidatePath("/list/daily-ledger");
    safeRevalidatePath("/list/finance");

    return {
      success: true,
      error: false,
      message: "Déclaration de manque rejetée / تم رفض تصريح عجز الصندوق",
    };
  } catch (err: any) {
    console.error("rejectMissingMoneyAction error:", err);
    return {
      success: false,
      error: true,
      message: err.message || "Erreur lors du rejet / حدث خطأ أثناء الرفض",
    };
  }
}

export async function resetMissingMoneyAction(id: number): Promise<{
  success: boolean;
  error: boolean;
  message: string;
}> {
  try {
    const session = await getAuthSession();

    if (!session.isOwner) {
      return {
        success: false,
        error: true,
        message: "Seul le propriétaire peut modifier la confirmation / هذا الإجراء متاح لمالك المؤسسة فقط",
      };
    }

    await prisma.missingMoney.update({
      where: { id },
      data: {
        status: "PENDING",
        confirmedBy: null,
        confirmedAt: null,
      },
    });

    safeRevalidatePath("/list/daily-ledger");
    safeRevalidatePath("/list/finance");

    return {
      success: true,
      error: false,
      message: "Confirmation réinitialisée (remise en attente) / تمت إعادة الحالة إلى قيد الانتظار",
    };
  } catch (err: any) {
    console.error("resetMissingMoneyAction error:", err);
    return {
      success: false,
      error: true,
      message: err.message || "Erreur lors de la réinitialisation / حدث خطأ أثناء التحديث",
    };
  }
}

export async function declareSurplusMoneyAction(data: {
  branchId: number;
  amount: number;
  reason?: string;
}): Promise<{ success: boolean; error: boolean; message: string }> {
  try {
    const session = await getAuthSession();

    if (!session.isOwner && !session.isBranchAdmin) {
      return {
        success: false,
        error: true,
        message: "Accès non autorisé / غير مصرح بالعملية",
      };
    }

    const branchId = Number(data.branchId);
    if (isNaN(branchId)) {
      return {
        success: false,
        error: true,
        message: "Identifiant de branche invalide / معرف الفرع غير صالح",
      };
    }

    // Branch admins can strictly declare only for their own branch
    if (session.isBranchAdmin && !session.isOwner) {
      const userBranchId = session.branchIds[0];
      if (userBranchId !== branchId) {
        return {
          success: false,
          error: true,
          message: "Vous ne pouvez déclarer un surplus que pour votre propre branche / يمكنك التصريح فقط لفرعك التابع له",
        };
      }
    }

    const amount = Number(data.amount);
    if (isNaN(amount) || amount <= 0) {
      return {
        success: false,
        error: true,
        message: "Veuillez saisir un montant de surplus supérieur à 0 / يرجى إدخال مبلغ فائض أكبر من الصفر",
      };
    }

    const todayDate = normalizeDateToStartOfDay(new Date());

    await prisma.surplusMoney.create({
      data: {
        branchId,
        date: todayDate,
        amount: new Prisma.Decimal(amount),
        reason: data.reason?.trim() || null,
        declaredBy: session.userId || session.rawRole || "admin",
        status: "PENDING",
      },
    });

    safeRevalidatePath("/list/daily-ledger");
    safeRevalidatePath("/list/finance");

    return {
      success: true,
      error: false,
      message: "Déclaration de surplus enregistrée avec succès. En attente de confirmation par le propriétaire. / تم تسجيل فائض الصندوق بنجاح. في انتظار تأكيد المالك.",
    };
  } catch (err: any) {
    console.error("declareSurplusMoneyAction error:", err);
    return {
      success: false,
      error: true,
      message: err.message || "Erreur lors de l'enregistrement / حدث خطأ أثناء التسجيل",
    };
  }
}

export async function confirmSurplusMoneyAction(id: number): Promise<{
  success: boolean;
  error: boolean;
  message: string;
}> {
  try {
    const session = await getAuthSession();

    if (!session.isOwner) {
      return {
        success: false,
        error: true,
        message: "Seul le propriétaire peut confirmer un surplus de caisse / هذا الإجراء متاح لمالك المؤسسة فقط",
      };
    }

    const surplusRecord = await prisma.surplusMoney.findUnique({
      where: { id },
    });

    if (!surplusRecord) {
      return {
        success: false,
        error: true,
        message: "Enregistrement de surplus introuvable / لم يتم العثور على سجل الفائض",
      };
    }

    await prisma.surplusMoney.update({
      where: { id },
      data: {
        status: "CONFIRMED",
        confirmedBy: session.userId || "owner",
        confirmedAt: new Date(),
      },
    });

    safeRevalidatePath("/list/daily-ledger");
    safeRevalidatePath("/list/finance");

    return {
      success: true,
      error: false,
      message: "Surplus de caisse confirmé avec succès et ajouté au revenu net. / تم تأكيد فائض الصندوق وإضافته إلى صافي المداخيل.",
    };
  } catch (err: any) {
    console.error("confirmSurplusMoneyAction error:", err);
    return {
      success: false,
      error: true,
      message: err.message || "Erreur lors de la confirmation / حدث خطأ أثناء التأكيد",
    };
  }
}

export async function rejectSurplusMoneyAction(id: number): Promise<{
  success: boolean;
  error: boolean;
  message: string;
}> {
  try {
    const session = await getAuthSession();

    if (!session.isOwner) {
      return {
        success: false,
        error: true,
        message: "Seul le propriétaire peut rejeter un surplus de caisse / هذا الإجراء متاح لمالك المؤسسة فقط",
      };
    }

    await prisma.surplusMoney.update({
      where: { id },
      data: {
        status: "REJECTED",
        confirmedBy: session.userId || "owner",
        confirmedAt: new Date(),
      },
    });

    safeRevalidatePath("/list/daily-ledger");
    safeRevalidatePath("/list/finance");

    return {
      success: true,
      error: false,
      message: "Déclaration de surplus rejetée / تم رفض تصريح فائض الصندوق",
    };
  } catch (err: any) {
    console.error("rejectSurplusMoneyAction error:", err);
    return {
      success: false,
      error: true,
      message: err.message || "Erreur lors du rejet / حدث خطأ أثناء الرفض",
    };
  }
}

export async function resetSurplusMoneyAction(id: number): Promise<{
  success: boolean;
  error: boolean;
  message: string;
}> {
  try {
    const session = await getAuthSession();

    if (!session.isOwner) {
      return {
        success: false,
        error: true,
        message: "Seul le propriétaire peut modifier la confirmation / هذا الإجراء متاح لمالك المؤسسة فقط",
      };
    }

    await prisma.surplusMoney.update({
      where: { id },
      data: {
        status: "PENDING",
        confirmedBy: null,
        confirmedAt: null,
      },
    });

    safeRevalidatePath("/list/daily-ledger");
    safeRevalidatePath("/list/finance");

    return {
      success: true,
      error: false,
      message: "Confirmation réinitialisée (remise en attente) / تمت إعادة الحالة إلى قيد الانتظار",
    };
  } catch (err: any) {
    console.error("resetSurplusMoneyAction error:", err);
    return {
      success: false,
      error: true,
      message: err.message || "Erreur lors de la réinitialisation / حدث خطأ أثناء التحديث",
    };
  }
}

/**
 * Update student payer status flag (§7.18)
 * States: NORMAL (default) | NON_PAYER | SCHOOL_FEES_ONLY
 */
export async function updateStudentPayerStatusAction(
  studentId: string,
  newStatus: string
): Promise<{
  success: boolean;
  error: boolean;
  message: string;
  payerStatus?: string;
}> {
  try {
    const session = await getAuthSession();
    if (!session.userId && !session.isOwner && !session.isOwnerOrAdmin && !session.isBranchAdmin) {
      return {
        success: false,
        error: true,
        message: "Non autorisé / غير مصرح لك بهذا الإجراء",
      };
    }

    const validStatuses = ["NORMAL", "NON_PAYER", "SCHOOL_FEES_ONLY"];
    const targetStatus = validStatuses.includes(newStatus) ? newStatus : "NORMAL";

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: { id: true, name: true, registeredBranchId: true, payerStatus: true },
    });

    if (!student) {
      return {
        success: false,
        error: true,
        message: "Élève introuvable / لم يتم العثور على التلميذ",
      };
    }

    if (!session.isOwner && !canUserAccessBranch(session.rawRole, session.branchIds, student.registeredBranchId)) {
      return {
        success: false,
        error: true,
        message: "Non autorisé pour cette branche / غير مصرح لك بتعديل تلاميذ هذا الفرع",
      };
    }

    const oldStatus = student.payerStatus || "NORMAL";

    await prisma.$executeRaw`
      UPDATE "Student"
      SET "payerStatus" = ${targetStatus}
      WHERE id = ${studentId}
    `;

    // Audit trail
    try {
      await prisma.auditLog.create({
        data: {
          entityType: "STUDENT",
          entityId: studentId,
          action: "UPDATE_PAYER_STATUS",
          branchId: student.registeredBranchId,
          userId: session.userId || session.rawRole || "system",
          userName: session.userId || session.rawRole || "Admin",
          oldValue: oldStatus,
          newValue: targetStatus,
          details: `Statut de paiement modifié de ${oldStatus} à ${targetStatus}`,
        },
      });
    } catch (auditErr) {
      console.warn("Audit log creation skipped:", auditErr);
    }

    safeRevalidatePath(`/list/students/${studentId}`);
    safeRevalidatePath("/list/students");
    safeRevalidatePath("/list/payments");

    const statusLabelsFr: Record<string, string> = {
      NORMAL: "Normal (par défaut)",
      NON_PAYER: "Non-payeur (exonéré)",
      SCHOOL_FEES_ONLY: "Frais d'école uniquement",
    };
    const statusLabelsAr: Record<string, string> = {
      NORMAL: "عادي (افتراضي)",
      NON_PAYER: "معفى من الدفع",
      SCHOOL_FEES_ONLY: "مستحقات المدرسة فقط",
    };

    return {
      success: true,
      error: false,
      message: `Statut mis à jour : ${statusLabelsFr[targetStatus]} / تم تحديث الحالة: ${statusLabelsAr[targetStatus]}`,
      payerStatus: targetStatus,
    };
  } catch (err: any) {
    console.error("updateStudentPayerStatusAction error:", err);
    return {
      success: false,
      error: true,
      message: err.message || "Erreur lors de la mise à jour du statut / حدث خطأ أثناء تحديث الحالة",
    };
  }
}

/**
 * Update an enrollment's payerStatus per §7.18.
 * Allows toggling between NORMAL, NON_PAYER, and SCHOOL_FEES_ONLY for a specific enrolled group.
 * Preserves all historical vouchers and logs an immutable audit event.
 */
export async function updateEnrollmentPayerStatusAction(
  studentId: string,
  enrollmentId: number,
  newStatus: string
): Promise<{
  success: boolean;
  error: boolean;
  message: string;
  payerStatus?: string;
  enrollmentId?: number;
}> {
  try {
    const session = await getAuthSession();
    if (!session.userId && !session.isOwner && !session.isOwnerOrAdmin && !session.isBranchAdmin) {
      return {
        success: false,
        error: true,
        message: "Non autorisé / غير مصرح لك بهذا الإجراء",
      };
    }

    const validStatuses = ["NORMAL", "NON_PAYER", "SCHOOL_FEES_ONLY"];
    const targetStatus = validStatuses.includes(newStatus) ? newStatus : "NORMAL";

    const enrollment = await prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      include: {
        class: { include: { branch: true } },
        student: { select: { id: true, name: true, registeredBranchId: true } },
      },
    });

    if (!enrollment || enrollment.studentId !== studentId) {
      return {
        success: false,
        error: true,
        message: "Inscription introuvable / التسجيل غير موجود",
      };
    }

    const branchId = enrollment.class.branchId;
    if (!session.isOwner && !canUserAccessBranch(session.rawRole, session.branchIds, branchId)) {
      return {
        success: false,
        error: true,
        message: "Non autorisé pour cette branche / غير مصرح لك بتعديل أفواج هذا الفرع",
      };
    }

    const oldStatus = enrollment.payerStatus || "NORMAL";

    await prisma.$executeRaw`
      UPDATE "Enrollment"
      SET "payerStatus" = ${targetStatus}
      WHERE id = ${enrollmentId}
    `;

    // Audit trail
    try {
      await prisma.auditLog.create({
        data: {
          entityType: "ENROLLMENT",
          entityId: String(enrollmentId),
          action: "UPDATE_ENROLLMENT_PAYER_STATUS",
          branchId: branchId,
          userId: session.userId || session.rawRole || "system",
          userName: session.userId || session.rawRole || "Admin",
          oldValue: oldStatus,
          newValue: targetStatus,
          details: `Statut de paiement du groupe "${enrollment.class.name}" modifié de ${oldStatus} à ${targetStatus}`,
        },
      });
    } catch (auditErr) {
      console.warn("Audit log creation skipped:", auditErr);
    }

    safeRevalidatePath(`/list/students/${studentId}`);
    safeRevalidatePath("/list/students");
    safeRevalidatePath("/list/payments");
    safeRevalidatePath(`/list/classes/${enrollment.classId}`);

    const statusLabelsFr: Record<string, string> = {
      NORMAL: "Normal (par défaut)",
      NON_PAYER: "Non-payeur (exonéré)",
      SCHOOL_FEES_ONLY: "Frais d'école uniquement",
    };
    const statusLabelsAr: Record<string, string> = {
      NORMAL: "عادي (افتراضي)",
      NON_PAYER: "معفى من الدفع",
      SCHOOL_FEES_ONLY: "مستحقات المدرسة فقط",
    };

    return {
      success: true,
      error: false,
      message: `Groupe "${enrollment.class.name}" : statut mis à jour en ${statusLabelsFr[targetStatus]} / فوج "${enrollment.class.name}": تم تحديث الحالة إلى ${statusLabelsAr[targetStatus]}`,
      payerStatus: targetStatus,
      enrollmentId,
    };
  } catch (err: any) {
    console.error("updateEnrollmentPayerStatusAction error:", err);
    return {
      success: false,
      error: true,
      message: err.message || "Erreur lors de la mise à jour du statut / حدث خطأ أثناء تحديث الحالة",
    };
  }
}

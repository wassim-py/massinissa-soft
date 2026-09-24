"use server";

import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { getAuthSession, getActiveBranchId } from "@/lib/auth";
import { canUserAccessBranch } from "@/lib/settings";
import { serializeForClient } from "@/lib/utils";
import { upsertDailyLedger } from "@/lib/ledger";

function safeRevalidatePath(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // Ignore error when running outside of Next.js HTTP request context (e.g. scripts)
  }
}

export type ActionResponse<T = any> = {
  success: boolean;
  error: boolean;
  message: string;
  data?: T;
};

// =================================================================
// 1. LANGUAGE ACTIONS
// =================================================================

export async function createLanguage(data: { name: string }): Promise<ActionResponse> {
  try {
    const session = await getAuthSession();
    if (!session.isOwner) {
      return { success: false, error: true, message: "Action réservée au propriétaire / هذا الإجراء مخصص لمالك المؤسسة فقط" };
    }

    const trimmed = data.name.trim();
    if (!trimmed) {
      return { success: false, error: true, message: "Nom de langue obligatoire / اسم اللغة مطلوب" };
    }

    const existing = await prisma.language.findFirst({
      where: { name: { equals: trimmed, mode: "insensitive" } },
    });

    if (existing) {
      return { success: false, error: true, message: "Cette langue existe déjà / هذه اللغة موجودة بالفعل" };
    }

    const lang = await prisma.language.create({
      data: { name: trimmed },
    });

    safeRevalidatePath("/list/formations");
    return { success: true, error: false, message: "Langue créée avec succès / تم إنشاء اللغة بنجاح", data: lang };
  } catch (err: any) {
    console.error("Error creating language:", err);
    return { success: false, error: true, message: err?.message || "Échec de la création de la langue / فشل في إنشاء اللغة" };
  }
}

export async function updateLanguage(data: { id: number; name: string }): Promise<ActionResponse> {
  try {
    const session = await getAuthSession();
    if (!session.isOwner) {
      return { success: false, error: true, message: "Action réservée au propriétaire / هذا الإجراء مخصص لمالك المؤسسة فقط" };
    }

    const trimmed = data.name.trim();
    if (!trimmed) {
      return { success: false, error: true, message: "Nom de langue obligatoire / اسم اللغة مطلوب" };
    }

    const updated = await prisma.language.update({
      where: { id: data.id },
      data: { name: trimmed },
    });

    safeRevalidatePath("/list/formations");
    return { success: true, error: false, message: "Langue modifiée avec succès / تم تعديل اللغة بنجاح", data: updated };
  } catch (err: any) {
    console.error("Error updating language:", err);
    return { success: false, error: true, message: err?.message || "Échec de la modification de la langue / فشل في تعديل اللغة" };
  }
}

export async function deleteLanguage(id: number): Promise<ActionResponse> {
  try {
    const session = await getAuthSession();
    if (!session.isOwner) {
      return { success: false, error: true, message: "Action réservée au propriétaire / هذا الإجراء مخصص لمالك المؤسسة فقط" };
    }

    // Check if there are formation classes attached
    const levels = await prisma.formationLevel.findMany({
      where: { languageId: id },
      include: { Class: true },
    });

    const hasClasses = levels.some((lvl) => lvl.Class.length > 0);
    if (hasClasses) {
      return {
        success: false,
        error: true,
        message: "Impossible de supprimer cette langue car des groupes y sont rattachés / لا يمكن حذف هذه اللغة لوجود أفواج تكوينية مرتبطة بمستوياتها",
      };
    }

    await prisma.$transaction(async (tx) => {
      await tx.formationLevel.deleteMany({ where: { languageId: id } });
      await tx.language.delete({ where: { id } });
    });

    safeRevalidatePath("/list/formations");
    return { success: true, error: false, message: "Langue supprimée avec succès / تم حذف اللغة بنجاح" };
  } catch (err: any) {
    console.error("Error deleting language:", err);
    return { success: false, error: true, message: err?.message || "Échec de la suppression de la langue / فشل في حذف اللغة" };
  }
}

// =================================================================
// 2. FORMATION LEVEL ACTIONS
// =================================================================

export async function createFormationLevel(data: {
  languageId: number;
  levelNumber?: number;
  name: string;
  lumpSumPrice?: number;
}): Promise<ActionResponse> {
  try {
    const session = await getAuthSession();
    if (!session.isOwnerOrAdmin && session.role !== "admin") {
      return { success: false, error: true, message: "Permissions insuffisantes / صلاحية غير كافية" };
    }

    const trimmedName = data.name.trim();
    if (!trimmedName) {
      return { success: false, error: true, message: "Nom du niveau obligatoire / اسم المستوى مطلوب" };
    }

    // Determine level number if not provided
    let levelNum = data.levelNumber;
    if (!levelNum || levelNum < 1) {
      const highest = await prisma.formationLevel.findFirst({
        where: { languageId: data.languageId },
        orderBy: { levelNumber: "desc" },
      });
      levelNum = highest ? highest.levelNumber + 1 : 1;
    }

    const price = data.lumpSumPrice && data.lumpSumPrice >= 0 ? data.lumpSumPrice : 0;

    const level = await prisma.formationLevel.create({
      data: {
        languageId: data.languageId,
        levelNumber: levelNum,
        name: trimmedName,
        lumpSumPrice: new Prisma.Decimal(price),
      },
    });

    safeRevalidatePath("/list/formations");
    return { success: true, error: false, message: "Niveau de formation ajouté avec succès / تمت إضافة المستوى التكويني بنجاح", data: serializeForClient(level) };
  } catch (err: any) {
    console.error("Error creating formation level:", err);
    return { success: false, error: true, message: err?.message || "Échec de l'ajout du niveau de formation / فشل في إضافة المستوى التكويني" };
  }
}

export async function updateFormationLevel(data: {
  id: number;
  name: string;
  levelNumber?: number;
  lumpSumPrice?: number;
}): Promise<ActionResponse> {
  try {
    const session = await getAuthSession();
    if (!session.isOwnerOrAdmin && session.role !== "admin") {
      return { success: false, error: true, message: "Permissions insuffisantes / صلاحية غير كافية" };
    }

    const updateData: any = {
      name: data.name.trim(),
    };

    if (data.levelNumber !== undefined) {
      updateData.levelNumber = data.levelNumber;
    }
    if (data.lumpSumPrice !== undefined) {
      updateData.lumpSumPrice = new Prisma.Decimal(data.lumpSumPrice);
    }

    const updated = await prisma.formationLevel.update({
      where: { id: data.id },
      data: updateData,
    });

    safeRevalidatePath("/list/formations");
    return { success: true, error: false, message: "Niveau de formation mis à jour avec succès / تم تحديث المستوى بنجاح", data: serializeForClient(updated) };
  } catch (err: any) {
    console.error("Error updating formation level:", err);
    return { success: false, error: true, message: err?.message || "Échec de la mise à jour du niveau / فشل في تحديث المستوى" };
  }
}

export async function executeSafeDeleteFormationLevel(
  tx: any,
  levelId: number
): Promise<{ success: boolean; deletedName: string }> {
  const level = await tx.formationLevel.findUnique({
    where: { id: levelId },
    include: {
      Language: true,
      Class: {
        include: {
          enrollments: { select: { id: true } },
          vouchers: { where: { isVoided: false }, select: { id: true } },
        },
      },
      LevelTest: { select: { id: true } },
    },
  });

  if (!level) {
    throw new Error("Niveau de formation introuvable / المستوى غير موجود");
  }

  // 1. Check if any student is actively enrolled in any class of this level
  const totalEnrollments = level.Class.reduce(
    (sum: number, c: any) => sum + c.enrollments.length,
    0
  );
  if (totalEnrollments > 0) {
    throw new Error(
      `Impossible de supprimer le niveau "${level.name}" car il contient des élèves inscrits (${totalEnrollments} élève(s)) / لا يمكن حذف المستوى (${level.name}) لاحتوائه على تلاميذ مسجلين (${totalEnrollments})`
    );
  }

  // 2. Check if any active payment vouchers exist
  const totalActiveVouchers = level.Class.reduce(
    (sum: number, c: any) => sum + c.vouchers.length,
    0
  );
  if (totalActiveVouchers > 0) {
    throw new Error(
      `Impossible de supprimer le niveau "${level.name}" car des reçus de paiement actifs y sont associés / لا يمكن حذف المستوى (${level.name}) لوجود وصولات دفع نشطة مسجلة عليه`
    );
  }

  const classIds = level.Class.map((c: any) => c.id);

  if (classIds.length > 0) {
    // 3. Lessons & attendances
    const lessons = await tx.lesson.findMany({
      where: { classId: { in: classIds } },
      select: { id: true },
    });
    const lessonIds = lessons.map((l: any) => l.id);

    if (lessonIds.length > 0) {
      await tx.catchUpAttendance.deleteMany({
        where: {
          OR: [
            { missedLessonId: { in: lessonIds } },
            { catchUpLessonId: { in: lessonIds } },
          ],
        },
      });
      await tx.attendance.deleteMany({
        where: { lessonId: { in: lessonIds } },
      });
      await tx.lesson.deleteMany({
        where: { id: { in: lessonIds } },
      });
    }

    // 4. Level tests
    await tx.levelTest.deleteMany({
      where: {
        OR: [
          { classId: { in: classIds } },
          { formationLevelId: levelId },
        ],
      },
    });

    // 5. Photocopy charges
    await tx.photocopyCharge.deleteMany({
      where: { classId: { in: classIds } },
    });

    // 6. Voided vouchers (detach classId)
    await tx.voucher.updateMany({
      where: { classId: { in: classIds } },
      data: { classId: null },
    });

    // 7. Orphaned enrollments / transfers (if any 0-student entries remain)
    const enrollments = await tx.enrollment.findMany({
      where: { classId: { in: classIds } },
      select: { id: true },
    });
    const enrollmentIds = enrollments.map((e: any) => e.id);
    if (enrollmentIds.length > 0) {
      await tx.enrollmentTransfer.deleteMany({
        where: {
          OR: [
            { fromEnrollmentId: { in: enrollmentIds } },
            { toEnrollmentId: { in: enrollmentIds } },
          ],
        },
      });
      await tx.enrollment.deleteMany({
        where: { id: { in: enrollmentIds } },
      });
    }

    // 8. Announcements
    await tx.announcement.deleteMany({
      where: { classId: { in: classIds } },
    });

    // 9. Delete classes
    await tx.class.deleteMany({
      where: { id: { in: classIds } },
    });
  } else {
    // Also clean up any level tests referencing this formationLevelId directly
    await tx.levelTest.deleteMany({
      where: { formationLevelId: levelId },
    });
  }

  // 10. Delete the formation level
  await tx.formationLevel.delete({
    where: { id: levelId },
  });

  return { success: true, deletedName: level.name };
}

export async function deleteFormationLevel(id: number): Promise<ActionResponse> {
  try {
    const session = await getAuthSession();
    if (!session.isOwnerOrAdmin && session.role !== "admin") {
      return { success: false, error: true, message: "Permissions insuffisantes / صلاحية غير كافية" };
    }

    const result = await prisma.$transaction(async (tx) => {
      return await executeSafeDeleteFormationLevel(tx, id);
    });

    safeRevalidatePath("/list/formations");
    safeRevalidatePath("/admin/configuration");
    safeRevalidatePath("/fr/admin/configuration");
    safeRevalidatePath("/ar/admin/configuration");

    return {
      success: true,
      error: false,
      message: `Niveau "${result.deletedName}" supprimé avec succès / تم حذف المستوى بنجاح`,
    };
  } catch (err: any) {
    console.error("Error deleting formation level:", err);
    return {
      success: false,
      error: true,
      message: err?.message || "Échec de la suppression du niveau / فشل في حذف المستوى",
    };
  }
}

// =================================================================
// 3. FORMATION GROUP (CLASS) ACTIONS
// =================================================================

export async function createFormationGroup(data: {
  name: string;
  branchId?: number;
  formationLevelId: number;
  ageGroup: string;
  pricePerCycle: number;
  inscriptionFee?: number;
  hasBooks?: boolean;
  bookFee?: number;
}): Promise<ActionResponse> {
  try {
    const session = await getAuthSession();
    const activeBranchId = await getActiveBranchId();
    const targetBranchId = data.branchId || activeBranchId || 1;

    if (session.branchIds.length > 0 && !canUserAccessBranch(session.rawRole, session.branchIds, targetBranchId)) {
      return { success: false, error: true, message: "Non autorisé à créer un groupe dans cette succursale / غير مصرح لك بإنشاء فوج تكويني في هذا الفرع" };
    }

    const level = await prisma.formationLevel.findUnique({
      where: { id: data.formationLevelId },
    });
    if (!level) {
      return { success: false, error: true, message: "Niveau de formation introuvable / المستوى التكويني المحدد غير موجود" };
    }

    const formationClass = await prisma.class.create({
      data: {
        name: data.name.trim(),
        branchId: targetBranchId,
        isFormation: true,
        formationLevelId: data.formationLevelId,
        ageGroup: (data.ageGroup || "Adultes").trim(),
        pricePerCycle: new Prisma.Decimal(data.pricePerCycle || 0),
        inscriptionFee: new Prisma.Decimal(data.inscriptionFee || 0),
        hasBooks: !!data.hasBooks,
        bookFee: data.hasBooks && data.bookFee ? new Prisma.Decimal(data.bookFee) : null,
      },
    });

    safeRevalidatePath("/list/formations");
    safeRevalidatePath("/list/classes");
    return { success: true, error: false, message: "Groupe de formation créé avec succès / تم إنشاء الفوج التكويني بنجاح", data: serializeForClient(formationClass) };
  } catch (err: any) {
    console.error("Error creating formation group:", err);
    return { success: false, error: true, message: err?.message || "Échec de la création du groupe / فشل في إنشاء الفوج التكويني" };
  }
}

// =================================================================
// 4. STUDENT ENROLLMENT INTO FORMATION GROUP
// =================================================================

export async function enrollStudentInFormationGroup(data: {
  studentId: string;
  classId: number;
  academicYearId?: number;
}): Promise<ActionResponse> {
  try {
    const session = await getAuthSession();

    const targetClass = await prisma.class.findUnique({
      where: { id: data.classId },
      include: { FormationLevel: true },
    });

    if (!targetClass || !targetClass.isFormation) {
      return { success: false, error: true, message: "Groupe introuvable ou non conforme / الفوج المحدد غير موجود أو ليس فوج تكوين لغوي" };
    }

    if (session.branchIds.length > 0 && !canUserAccessBranch(session.rawRole, session.branchIds, targetClass.branchId)) {
      return { success: false, error: true, message: "Non autorisé à inscrire dans cette succursale / غير مصرح لك بالتسجيل في هذا الفرع" };
    }

    const student = await prisma.student.findUnique({
      where: { id: data.studentId },
    });
    if (!student) {
      return { success: false, error: true, message: "Élève introuvable / التلميذ غير موجود" };
    }

    // Resolve academic year
    let academicYearId = data.academicYearId;
    if (!academicYearId) {
      const year = await prisma.academicYear.findFirst({
        orderBy: { startDate: "desc" },
      });
      academicYearId = year ? year.id : 1;
    }

    // Check if already enrolled in this exact class
    const existing = await prisma.enrollment.findFirst({
      where: {
        studentId: data.studentId,
        classId: data.classId,
        academicYearId: academicYearId,
      },
    });

    if (existing) {
      return { success: false, error: true, message: "L'élève est déjà inscrit dans ce groupe / التلميذ مسجل بالفعل في هذا الفوج التكويني" };
    }

    // Rule §2.1: Count prior charged enrollments in current academic year
    const chargedCount = await prisma.enrollment.count({
      where: {
        studentId: data.studentId,
        academicYearId: academicYearId,
        inscriptionFeeCharged: true,
      },
    });

    const shouldChargeInscription = chargedCount < 3;
    const feeAmount = shouldChargeInscription ? targetClass.inscriptionFee : null;

    const enrollment = await prisma.enrollment.create({
      data: {
        studentId: data.studentId,
        classId: data.classId,
        academicYearId: academicYearId,
        inscriptionFeeCharged: shouldChargeInscription,
        inscriptionFeeAmount: feeAmount,
        enrolledAt: new Date(),
      },
    });

    safeRevalidatePath("/list/formations");
    safeRevalidatePath(`/list/payments/class/${targetClass.id}`);
    return {
      success: true,
      error: false,
      message: `Élève inscrit avec succès dans (${targetClass.name}) / تم تسجيل التلميذ بنجاح في الفوج (${targetClass.name})`,
      data: serializeForClient(enrollment),
    };
  } catch (err: any) {
    console.error("Error enrolling student in formation group:", err);
    return { success: false, error: true, message: err?.message || "Échec de l'inscription de l'élève / فشل في تسجيل التلميذ" };
  }
}

// =================================================================
// 5. LEVEL TEST (TEST DE NIVEAU) ACTIONS
// =================================================================

export async function recordLevelTest(data: {
  studentId: string;
  classId: number;
  formationLevelId: number;
  testDate: Date | string;
  score?: number | null;
  passed: boolean;
  administeredBy: string;
}): Promise<ActionResponse> {
  try {
    const session = await getAuthSession();

    // Verify student is enrolled in this formation group
    const enrollment = await prisma.enrollment.findFirst({
      where: {
        studentId: data.studentId,
        classId: data.classId,
      },
    });

    if (!enrollment) {
      return {
        success: false,
        error: true,
        message: "L'élève n'est pas inscrit dans ce groupe / التلميذ غير مسجل في هذا الفوج التكويني",
      };
    }

    const currentLevel = await prisma.formationLevel.findUnique({
      where: { id: data.formationLevelId },
      include: { Language: true },
    });

    if (!currentLevel) {
      return { success: false, error: true, message: "Niveau de formation introuvable / المستوى التكويني غير موجود" };
    }

    const dateVal = new Date(data.testDate);

    const levelTest = await prisma.levelTest.create({
      data: {
        studentId: data.studentId,
        classId: data.classId,
        formationLevelId: data.formationLevelId,
        testDate: dateVal,
        score: data.score !== undefined && data.score !== null ? new Prisma.Decimal(data.score) : null,
        passed: !!data.passed,
        administeredBy: data.administeredBy.trim() || session.userId || "Admin",
      },
      include: {
        FormationLevel: { include: { Language: true } },
        Class: true,
        Student: true,
      },
    });

    // Check if next level exists for this language
    let nextLevel: any = null;
    let availableNextGroups: any[] = [];

    if (levelTest.passed) {
      nextLevel = await prisma.formationLevel.findFirst({
        where: {
          languageId: currentLevel.languageId,
          levelNumber: currentLevel.levelNumber + 1,
        },
      });

      if (nextLevel) {
        availableNextGroups = await prisma.class.findMany({
          where: {
            isFormation: true,
            formationLevelId: nextLevel.id,
          },
          include: {
            branch: true,
            lessons: {
              include: { classroom: true, teacher: true },
              orderBy: { startsAt: "asc" },
            },
            _count: { select: { enrollments: true } },
          },
        });
      }
    }

    safeRevalidatePath("/list/formations");
    return {
      success: true,
      error: false,
      message: levelTest.passed
        ? `Test réussi ! Prêt pour le niveau supérieur / تم تسجيل اجتياز التلميذ لاختبار المستوى بنجاح!`
        : `Test échoué. L'élève reste au niveau actuel / تم تسجيل نتيجة الاختبار (راسب). يبقى التلميذ في مستواه الحالي.`,
      data: serializeForClient({
        levelTest,
        nextLevel,
        availableNextGroups,
      }),
    };
  } catch (err: any) {
    console.error("Error recording level test:", err);
    return { success: false, error: true, message: err?.message || "Échec de l'enregistrement du test / فشل في تسجيل اختبار المستوى" };
  }
}

// =================================================================
// 6. ASSISTED LEVEL-UP ACTION
// =================================================================

export async function getNextLevelFormationGroups(nextLevelId: number): Promise<ActionResponse> {
  try {
    const groups = await prisma.class.findMany({
      where: {
        isFormation: true,
        formationLevelId: nextLevelId,
      },
      include: {
        branch: true,
        lessons: {
          include: { classroom: true, teacher: true },
          orderBy: { startsAt: "asc" },
        },
        _count: { select: { enrollments: true } },
      },
      orderBy: { name: "asc" },
    });

    return {
      success: true,
      error: false,
      message: "Groupes disponibles récupérés avec succès / تم جلب الأفواج المتاحة",
      data: serializeForClient(groups),
    };
  } catch (err: any) {
    console.error("Error fetching next level groups:", err);
    return { success: false, error: true, message: err?.message || "Échec de la récupération des groupes / فشل في جلب الأفواج" };
  }
}

export async function levelUpStudent(data: {
  studentId: string;
  levelTestId: number;
  targetClassId: number;
  academicYearId?: number;
}): Promise<ActionResponse> {
  try {
    const session = await getAuthSession();

    // 1. Verify LevelTest was passed
    const test = await prisma.levelTest.findUnique({
      where: { id: data.levelTestId },
      include: {
        FormationLevel: true,
        Class: true,
      },
    });

    if (!test) {
      return { success: false, error: true, message: "Fiche de test introuvable / سجل اختبار المستوى غير موجود" };
    }

    if (test.studentId !== data.studentId) {
      return { success: false, error: true, message: "Identifiant élève non conforme / معرف التلميذ لا يتطابق مع اختبار المستوى" };
    }

    if (!test.passed) {
      return { success: false, error: true, message: "Promotion impossible (test non réussi) / لا يمكن ترقية التلميذ لأنه لم يجتز الاختبار بنجاح" };
    }

    // 2. Verify target class is a formation group at the next level
    const targetClass = await prisma.class.findUnique({
      where: { id: data.targetClassId },
      include: {
        FormationLevel: true,
        branch: true,
      },
    });

    if (!targetClass || !targetClass.isFormation || !targetClass.FormationLevel) {
      return { success: false, error: true, message: "Groupe cible invalide / الفوج المستهدف غير صالح" };
    }

    if (targetClass.FormationLevel.languageId !== test.FormationLevel.languageId) {
      return { success: false, error: true, message: "La langue du groupe ne correspond pas au test / لغة الفوج المستهدف لا تطابق لغة الاختبار" };
    }

    if (targetClass.FormationLevel.levelNumber !== test.FormationLevel.levelNumber + 1) {
      return {
        success: false,
        error: true,
        message: `Niveau incohérent : (${targetClass.FormationLevel.name}) vs (${test.FormationLevel.levelNumber + 1}) / الفوج المستهدف في المستوى (${targetClass.FormationLevel.name})، والمطلوب المستوى التالي (${test.FormationLevel.levelNumber + 1})`,
      };
    }

    // 3. Resolve Academic Year
    let yearId = data.academicYearId;
    if (!yearId) {
      const year = await prisma.academicYear.findFirst({
        orderBy: { startDate: "desc" },
      });
      yearId = year ? year.id : 1;
    }

    // 4. Check if student is already enrolled in the target class
    const existingEnrollment = await prisma.enrollment.findFirst({
      where: {
        studentId: data.studentId,
        classId: data.targetClassId,
        academicYearId: yearId,
      },
    });

    if (existingEnrollment) {
      return {
        success: false,
        error: true,
        message: `L'élève est déjà inscrit dans le groupe (${targetClass.name}) / التلميذ مسجل بالفعل في الفوج المستهدف (${targetClass.name})`,
      };
    }

    // 5. Inscription fee handling per §2.1
    const chargedCount = await prisma.enrollment.count({
      where: {
        studentId: data.studentId,
        academicYearId: yearId,
        inscriptionFeeCharged: true,
      },
    });

    const shouldChargeInscription = chargedCount < 3;
    const feeAmount = shouldChargeInscription ? targetClass.inscriptionFee : null;

    // 6. Create the new Enrollment (assisted level up)
    const newEnrollment = await prisma.enrollment.create({
      data: {
        studentId: data.studentId,
        classId: data.targetClassId,
        academicYearId: yearId,
        inscriptionFeeCharged: shouldChargeInscription,
        inscriptionFeeAmount: feeAmount,
        enrolledAt: new Date(),
      },
      include: {
        class: {
          include: { FormationLevel: true, branch: true },
        },
        student: true,
      },
    });

    safeRevalidatePath("/list/formations");
    safeRevalidatePath("/list/classes");
    safeRevalidatePath(`/list/payments/class/${targetClass.id}`);

    return {
      success: true,
      error: false,
      message: `تم ترقية التلميذ (${newEnrollment.student.name}) بنجاح إلى المستوى ${targetClass.FormationLevel.name} في الفوج (${targetClass.name})!`,
      data: serializeForClient(newEnrollment),
    };
  } catch (err: any) {
    console.error("Error leveling up student:", err);
    return { success: false, error: true, message: err?.message || "فشل في ترقية التلميذ." };
  }
}

// =================================================================
// 7. STUDENT LANGUAGE PROGRESSION HISTORY
// =================================================================

export async function getStudentLanguageProgression(studentId: string, languageId: number) {
  try {
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: { id: true, name: true, phone: true },
    });

    if (!student) {
      return { success: false, error: true, message: "Élève introuvable / التلميذ غير موجود" };
    }

    const language = await prisma.language.findUnique({
      where: { id: languageId },
      include: {
        FormationLevel: {
          orderBy: { levelNumber: "asc" },
        },
      },
    });

    if (!language) {
      return { success: false, error: true, message: "Langue introuvable / اللغة غير موجودة" };
    }

    // Get all enrollments for this student in classes of this language
    const enrollments = await prisma.enrollment.findMany({
      where: {
        studentId: studentId,
        class: {
          isFormation: true,
          FormationLevel: {
            languageId: languageId,
          },
        },
      },
      include: {
        class: {
          include: {
            FormationLevel: true,
            branch: true,
          },
        },
        academicYear: true,
      },
      orderBy: { enrolledAt: "asc" },
    });

    // Get all level tests taken by this student for this language
    const levelTests = await prisma.levelTest.findMany({
      where: {
        studentId: studentId,
        FormationLevel: {
          languageId: languageId,
        },
      },
      include: {
        FormationLevel: true,
        Class: true,
      },
      orderBy: { testDate: "asc" },
    });

    return {
      success: true,
      error: false,
      message: "Parcours de formation récupéré avec succès / تم جلب سجل المسار التكويني بنجاح",
      data: serializeForClient({
        student,
        language,
        enrollments,
        levelTests,
      }),
    };
  } catch (err: any) {
    console.error("Error fetching student language progression:", err);
    return { success: false, error: true, message: err?.message || "فشل في جلب سجل التلميذ." };
  }
}

// =================================================================
// 8. UNIFIED FORMATION CREATION (LANGUAGE + MULTI-LEVEL + INITIAL GROUP)
// =================================================================

export async function createFormationWithLevels(data: {
  languageName: string;
  languageId?: number;
  levels: Array<{
    name: string;
    lumpSumPrice: number;
  }>;
  branchId: number;
  teacherId?: string | null;
  ageGroup?: string;
  initialGroupName?: string;
  hasBooks?: boolean;
  bookFee?: number;
  inscriptionFee?: number;
}): Promise<ActionResponse> {
  try {
    const session = await getAuthSession();
    if (!session.isOwnerOrAdmin && session.role !== "admin") {
      return { success: false, error: true, message: "Permissions insuffisantes pour créer une formation / صلاحية غير كافية لإنشاء تكوين جديد" };
    }

    if (session.branchIds.length > 0 && !canUserAccessBranch(session.rawRole, session.branchIds, data.branchId)) {
      return { success: false, error: true, message: "Non autorisé à créer un groupe dans cette succursale / غير مصرح لك بإنشاء فوج في هذا الفرع" };
    }

    const trimmedLangName = data.languageName?.trim();
    if (!trimmedLangName && !data.languageId) {
      return { success: false, error: true, message: "Veuillez sélectionner la langue / يرجى تحديد لغة التكوين" };
    }

    if (!data.levels || data.levels.length === 0) {
      return { success: false, error: true, message: "Au moins un niveau est requis / يجب تحديد مستوى تكويني واحد على الأقل" };
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Find or create Language
      let language: any;
      if (data.languageId) {
        language = await tx.language.findUnique({ where: { id: data.languageId } });
      } else {
        language = await tx.language.findFirst({
          where: { name: { equals: trimmedLangName, mode: "insensitive" } },
        });
        if (!language) {
          language = await tx.language.create({
            data: { name: trimmedLangName! },
          });
        }
      }

      // 2. Determine base levelNumber
      const highestLevel = await tx.formationLevel.findFirst({
        where: { languageId: language.id },
        orderBy: { levelNumber: "desc" },
      });
      const baseLevelNum = highestLevel ? highestLevel.levelNumber : 0;

      // 3. Create levels
      const createdLevels: any[] = [];
      for (let i = 0; i < data.levels.length; i++) {
        const lvlData = data.levels[i];
        const lvl = await tx.formationLevel.create({
          data: {
            languageId: language.id,
            levelNumber: baseLevelNum + i + 1,
            name: lvlData.name.trim(),
            lumpSumPrice: new Prisma.Decimal(lvlData.lumpSumPrice || 0),
          },
        });
        createdLevels.push(lvl);
      }

      // 4. Create initial groups (Class) for ALL newly created levels so students can start from any level
      let initialFormationGroup: any = null;
      for (let i = 0; i < createdLevels.length; i++) {
        const lvl = createdLevels[i];
        const groupName =
          i === 0 && data.initialGroupName?.trim()
            ? data.initialGroupName.trim()
            : `${language.name} - ${lvl.name}`;

        const cls = await tx.class.create({
          data: {
            name: groupName,
            branchId: data.branchId,
            teacherId: data.teacherId || null,
            isFormation: true,
            formationLevelId: lvl.id,
            ageGroup: data.ageGroup?.trim() || "Adultes (15+ ans)",
            pricePerCycle: lvl.lumpSumPrice, // lump-sum price stored as pricePerCycle
            hasBooks: !!data.hasBooks,
            bookFee: data.hasBooks && data.bookFee ? new Prisma.Decimal(data.bookFee) : null,
            inscriptionFee: new Prisma.Decimal(data.inscriptionFee || 0),
          },
        });
        if (i === 0) {
          initialFormationGroup = cls;
        }
      }

      return { language, levels: createdLevels, group: initialFormationGroup };
    });

    safeRevalidatePath("/list/formations");
    safeRevalidatePath("/list/classes");
    return {
      success: true,
      error: false,
      message: "Formation et groupe créés avec succès ! / تم إنشاء التكوين والمستويات والفوج بنجاح!",
      data: serializeForClient(result),
    };
  } catch (err: any) {
    console.error("Error creating formation with levels:", err);
    return { success: false, error: true, message: err?.message || "فشل في إنشاء التكوين." };
  }
}

// =================================================================
// 9. FORMATION LUMP-SUM PAYMENT & VOUCHER ACTIONS
// =================================================================

export async function recordFormationLumpSumPayment(data: {
  studentId: string;
  classId: number;
  amount: number;
  bookFeeAmount?: number;
  isPartial?: boolean;
  remainingBalance?: number;
  completesVoucherId?: number;
  notes?: string;
  isRetake?: boolean;
}): Promise<ActionResponse> {
  try {
    const session = await getAuthSession();
    const activeBranchId = await getActiveBranchId();

    const targetClass = await prisma.class.findUnique({
      where: { id: data.classId },
      include: { FormationLevel: true, branch: true },
    });

    if (!targetClass || !targetClass.isFormation) {
      return { success: false, error: true, message: "Groupe de formation introuvable / الفوج التكويني المحدد غير موجود" };
    }

    const issuingBranchId = activeBranchId || targetClass.branchId;

    if (session.branchIds.length > 0 && !canUserAccessBranch(session.rawRole, session.branchIds, issuingBranchId)) {
      return { success: false, error: true, message: "Non autorisé à émettre des reçus dans cette succursale / غير مصرح لك بإصدار وصولات من هذا الفرع" };
    }

    const student = await prisma.student.findUnique({
      where: { id: data.studentId },
    });
    if (!student) {
      return { success: false, error: true, message: "Élève sélectionné introuvable / التلميذ المحدد غير موجود" };
    }

    const finalAmount = Number(data.amount) || 0;
    const bookFee = Number(data.bookFeeAmount) || 0;

    if (finalAmount <= 0 && bookFee <= 0) {
      return { success: false, error: true, message: "Montant ou frais de livres invalides / يرجى إدخال مبلغ دفع صالح أو رسوم كتب صالحة" };
    }

    // Resolve continuous voucher series
    const isCrossBranch = issuingBranchId !== targetClass.branchId;
    const seriesScope = isCrossBranch ? "CROSS_BRANCH" : "LOCAL_LEVEL";

    let series = await prisma.voucherSeries.findFirst({
      where: {
        issuingBranchId: issuingBranchId,
        scope: seriesScope,
        ...(isCrossBranch ? { targetBranchId: targetClass.branchId } : {}),
      },
      orderBy: { id: "asc" },
    });

    if (!series) {
      series = await prisma.voucherSeries.create({
        data: {
          issuingBranchId: issuingBranchId,
          scope: seriesScope,
          targetBranchId: isCrossBranch ? targetClass.branchId : null,
          currentNumber: isCrossBranch ? 50 : 100,
        },
      });
    }

    const noteAdd = data.isRetake ? "[إعادة المستوى / Retake]" : "";
    const combinedNotes = [data.notes, noteAdd].filter(Boolean).join(" ");

    let createdVoucher: any = null;
    let createdBookVoucher: any = null;

    await prisma.$transaction(async (tx) => {
      // 1. If tuition paid, issue FORMATION voucher
      if (finalAmount > 0) {
        const updatedSeries = await tx.voucherSeries.update({
          where: { id: series.id },
          data: { currentNumber: { increment: 1 } },
        });
        const voucherNumber = updatedSeries.currentNumber;

        createdVoucher = await tx.voucher.create({
          data: {
            seriesId: series.id,
            number: voucherNumber,
            studentId: data.studentId,
            classId: data.classId,
            issuingBranchId: issuingBranchId,
            targetBranchId: targetClass.branchId,
            paymentType: "FORMATION",
            amount: new Prisma.Decimal(finalAmount),
            isPartial: !!data.isPartial,
            completesVoucherId: data.completesVoucherId || null,
            remainingBalance: data.remainingBalance ? new Prisma.Decimal(data.remainingBalance) : null,
            issuedBy: session.userId || "admin",
            isVoided: false,
          },
          include: {
            class: true,
            student: true,
            series: true,
          },
        });

        // Update DailyLedger at target branch (type ATELIER_FORMATION)
        await upsertDailyLedger(tx, {
          branchId: targetClass.branchId,
          date: new Date(),
          type: "ATELIER_FORMATION",
          amount: finalAmount,
        });
      }

      // 2. If book fee paid, issue BOOK voucher (§1.2 & §2.11)
      if (bookFee > 0) {
        const bookSeriesUpdate = await tx.voucherSeries.update({
          where: { id: series.id },
          data: { currentNumber: { increment: 1 } },
        });
        let activeTrimesterId: number | null = null;
        try {
          const activeTrimester = await tx.trimester.findFirst({
            where: { status: "active" },
          });
          activeTrimesterId = activeTrimester?.id ?? null;
        } catch {
          // Fallback if status not recognized in stale client
        }

        createdBookVoucher = await tx.voucher.create({
          data: {
            seriesId: series.id,
            number: bookSeriesUpdate.currentNumber,
            studentId: data.studentId,
            classId: data.classId,
            issuingBranchId: issuingBranchId,
            targetBranchId: targetClass.branchId,
            paymentType: "BOOK",
            amount: new Prisma.Decimal(bookFee),
            isPartial: false,
            issuedBy: session.userId || "admin",
            isVoided: false,
            trimesterId: activeTrimesterId,
          },
          include: {
            class: true,
            student: true,
            series: true,
          },
        });

        // Update DailyLedger at target branch (type BOOK)
        await upsertDailyLedger(tx, {
          branchId: targetClass.branchId,
          date: new Date(),
          type: "BOOK",
          amount: bookFee,
        });
      }
    });

    safeRevalidatePath("/list/formations");
    safeRevalidatePath(`/list/formations/${data.classId}`);

    const voucherNumbers: number[] = [];
    if (createdVoucher?.number) voucherNumbers.push(createdVoucher.number);
    if (createdBookVoucher?.number) voucherNumbers.push(createdBookVoucher.number);

    return {
      success: true,
      error: false,
      message: `تم تسجيل الدفع بنجاح (وصول رقم: ${voucherNumbers.map((n) => `#${n}`).join(", ")}).`,
      data: serializeForClient({
        formationVoucher: createdVoucher,
        bookVoucher: createdBookVoucher,
      }),
    };
  } catch (err: any) {
    console.error("Error recording formation lump sum payment:", err);
    return { success: false, error: true, message: err?.message || "فشل في تسجيل دفع التكوين." };
  }
}

// =================================================================
// 9b. MANUAL LEVEL COMPLETION ACTIONS (§7.15)
// =================================================================

export async function finishFormationLevel(classId: number): Promise<ActionResponse> {
  try {
    const session = await getAuthSession();
    if (!session.isOwnerOrAdmin && session.role !== "admin") {
      return {
        success: false,
        error: true,
        message: "صلاحية غير كافية لإنهاء دورة المستوى / Permission refusée pour terminer le cycle.",
      };
    }

    const targetClass = await prisma.class.findUnique({
      where: { id: classId },
      include: { FormationLevel: true },
    });

    if (!targetClass || !targetClass.isFormation) {
      return {
        success: false,
        error: true,
        message: "الفوج التكويني المحدد غير موجود / Groupe de formation introuvable.",
      };
    }

    if (session.branchIds.length > 0 && !canUserAccessBranch(session.rawRole, session.branchIds, targetClass.branchId)) {
      return {
        success: false,
        error: true,
        message: "غير مصرح لك بإدارة هذا الفرع / Non autorisé pour cette branche.",
      };
    }

    const updated = await prisma.class.update({
      where: { id: classId },
      data: {
        isCompleted: true,
        completedAt: new Date(),
      },
      include: { FormationLevel: true, branch: true },
    });

    safeRevalidatePath("/list/formations");
    safeRevalidatePath(`/list/formations/${classId}`);
    return {
      success: true,
      error: false,
      message: "تم إنهاء دورة المستوى بنجاح / Le cycle du niveau a été marqué comme terminé avec succès.",
      data: serializeForClient(updated),
    };
  } catch (err: any) {
    console.error("Error finishing formation level:", err);
    return {
      success: false,
      error: true,
      message: err?.message || "فشل في إنهاء دورة المستوى / Échec de finalisation du niveau.",
    };
  }
}

export async function reopenFormationLevel(classId: number): Promise<ActionResponse> {
  try {
    const session = await getAuthSession();
    if (!session.isOwnerOrAdmin && session.role !== "admin") {
      return {
        success: false,
        error: true,
        message: "صلاحية غير كافية / Permission refusée.",
      };
    }

    const targetClass = await prisma.class.findUnique({
      where: { id: classId },
    });

    if (!targetClass || !targetClass.isFormation) {
      return {
        success: false,
        error: true,
        message: "الفوج التكويني غير موجود / Groupe introuvable.",
      };
    }

    const updated = await prisma.class.update({
      where: { id: classId },
      data: {
        isCompleted: false,
        completedAt: null,
      },
      include: { FormationLevel: true, branch: true },
    });

    safeRevalidatePath("/list/formations");
    safeRevalidatePath(`/list/formations/${classId}`);
    return {
      success: true,
      error: false,
      message: "تمت إعادة فتح دورة المستوى بنجاح / Le cycle du niveau a été réouvert avec succès.",
      data: serializeForClient(updated),
    };
  } catch (err: any) {
    console.error("Error reopening formation level:", err);
    return {
      success: false,
      error: true,
      message: err?.message || "فشل في إعادة فتح دورة المستوى.",
    };
  }
}

// =================================================================
// 9c. CASCADING LEVEL CLOSURE & PROGRESSION ACTIONS
// =================================================================

export async function getFormationClosurePreview(classId: number): Promise<ActionResponse> {
  try {
    const session = await getAuthSession();
    if (!session.isOwnerOrAdmin && session.role !== "admin") {
      return { success: false, error: true, message: "Permission refusée." };
    }

    const currentClass = await prisma.class.findUnique({
      where: { id: classId },
      include: {
        FormationLevel: {
          include: {
            Language: true,
          },
        },
        enrollments: {
          include: {
            student: {
              select: { id: true, name: true, phone: true, globalNumber: true },
            },
          },
        },
        LevelTest: {
          orderBy: { testDate: "desc" },
        },
      },
    });

    if (!currentClass || !currentClass.isFormation || !currentClass.FormationLevel) {
      return { success: false, error: true, message: "Groupe de formation introuvable." };
    }

    const currentLevel = currentClass.FormationLevel;
    const language = currentLevel.Language;

    // Find latest test per student in this class
    const latestTestByStudent = new Map<string, any>();
    for (const test of currentClass.LevelTest) {
      if (!latestTestByStudent.has(test.studentId)) {
        latestTestByStudent.set(test.studentId, test);
      }
    }

    const succeededStudents: Array<{ id: string; name: string; score: number | null }> = [];
    const otherStudents: Array<{ id: string; name: string; reason: string }> = [];

    for (const enr of currentClass.enrollments) {
      const test = latestTestByStudent.get(enr.studentId);
      if (test && test.passed) {
        succeededStudents.push({
          id: enr.student.id,
          name: enr.student.name,
          score: test.score ? Number(test.score) : null,
        });
      } else if (test && !test.passed) {
        otherStudents.push({
          id: enr.student.id,
          name: enr.student.name,
          reason: "Test non réussi",
        });
      } else {
        otherStudents.push({
          id: enr.student.id,
          name: enr.student.name,
          reason: "Aucun test passé",
        });
      }
    }

    // Find subsequent levels in this formation
    const nextLevels = await prisma.formationLevel.findMany({
      where: {
        languageId: language.id,
        levelNumber: { gt: currentLevel.levelNumber },
      },
      include: {
        Class: {
          include: {
            _count: { select: { enrollments: true } },
            teacher: { select: { id: true, name: true } },
          },
          orderBy: { id: "desc" },
        },
        LevelTest: {
          orderBy: { testDate: "desc" },
        },
      },
      orderBy: { levelNumber: "asc" },
    });

    const subsequentLevelsData = nextLevels.map((lvl) => {
      const activeClass = lvl.Class.find((c) => !c.isCompleted) || lvl.Class[0] || null;
      // Also get passed students for this level's active class (in case it gets closed too)
      let activeClassPassedCount = 0;
      if (activeClass) {
        const testsForActive = lvl.LevelTest.filter((t) => t.classId === activeClass.id);
        const map = new Map<string, boolean>();
        for (const t of testsForActive) {
          if (!map.has(t.studentId)) {
            map.set(t.studentId, t.passed);
          }
        }
        for (const passed of map.values()) {
          if (passed) activeClassPassedCount++;
        }
      }

      return {
        levelId: lvl.id,
        levelNumber: lvl.levelNumber,
        levelName: lvl.name,
        lumpSumPrice: Number(lvl.lumpSumPrice || 0),
        activeClass: activeClass
          ? {
              id: activeClass.id,
              name: activeClass.name,
              isCompleted: activeClass.isCompleted,
              enrolledCount: activeClass._count.enrollments,
              passedStudentsCount: activeClassPassedCount,
              teacherName: activeClass.teacher?.name || null,
            }
          : null,
      };
    });

    return {
      success: true,
      error: false,
      message: "Aperçu de clôture récupéré avec succès.",
      data: serializeForClient({
        currentLevel: {
          id: currentLevel.id,
          levelNumber: currentLevel.levelNumber,
          name: currentLevel.name,
        },
        language: {
          id: language.id,
          name: language.name,
        },
        currentClass: {
          id: currentClass.id,
          name: currentClass.name,
          isCompleted: currentClass.isCompleted,
          totalEnrolled: currentClass.enrollments.length,
        },
        succeededStudents,
        otherStudents,
        subsequentLevels: subsequentLevelsData,
      }),
    };
  } catch (err: any) {
    console.error("Error fetching closure preview:", err);
    return { success: false, error: true, message: err?.message || "Erreur lors du chargement de l'aperçu." };
  }
}

export async function closeFormationLevelsWithCascade(data: {
  startingClassId: number;
  closureDecisions: Array<{ levelNumber: number; isClosed: boolean }>;
}): Promise<ActionResponse> {
  try {
    const session = await getAuthSession();
    if (!session.isOwnerOrAdmin && session.role !== "admin") {
      return { success: false, error: true, message: "Permission refusée / صلاحية غير كافية." };
    }

    const startingClass = await prisma.class.findUnique({
      where: { id: data.startingClassId },
      include: {
        FormationLevel: {
          include: { Language: true },
        },
      },
    });

    if (!startingClass || !startingClass.isFormation || !startingClass.FormationLevel) {
      return { success: false, error: true, message: "Groupe de formation introuvable." };
    }

    if (session.branchIds.length > 0 && !canUserAccessBranch(session.rawRole, session.branchIds, startingClass.branchId)) {
      return { success: false, error: true, message: "Non autorisé pour cette succursale." };
    }

    const languageId = startingClass.FormationLevel.languageId;
    const languageName = startingClass.FormationLevel.Language.name;
    const startLevelNum = startingClass.FormationLevel.levelNumber;

    // Fetch all levels of this language
    const allLevels = await prisma.formationLevel.findMany({
      where: { languageId },
      include: {
        Class: {
          include: {
            enrollments: { select: { studentId: true } },
            LevelTest: { orderBy: { testDate: "desc" } },
          },
          orderBy: { id: "desc" },
        },
      },
      orderBy: { levelNumber: "asc" },
    });

    // Resolve current academic year
    const academicYear = await prisma.academicYear.findFirst({
      orderBy: { startDate: "desc" },
    });
    const yearId = academicYear ? academicYear.id : 1;

    // Map decisions: levelNumber -> isClosed
    const decisionsMap = new Map<number, boolean>();
    for (const d of data.closureDecisions) {
      decisionsMap.set(d.levelNumber, d.isClosed);
    }

    // Determine which levels are being closed:
    // Starting level is always closed.
    // Subsequent levels are closed if decision says true.
    const levelsToClose: number[] = [startLevelNum];
    for (let lNum = startLevelNum + 1; ; lNum++) {
      const isLvlClosed = decisionsMap.get(lNum);
      if (isLvlClosed === true) {
        levelsToClose.push(lNum);
      } else {
        break; // chain stops as soon as a level is NOT closed
      }
    }

    const resultSummary: {
      closedLevels: number[];
      promotions: Array<{ fromLevel: number; toLevel: number; studentCount: number; isFresh: boolean }>;
    } = {
      closedLevels: [],
      promotions: [],
    };

    await prisma.$transaction(async (tx) => {
      // We process from highest closed level down to starting level
      // That way, when Level 2 is closed, its students move to Level 3 first,
      // and then Level 2 has its fresh class ready for Level 1 students!
      const sortedLevelsToClose = [...levelsToClose].sort((a, b) => b - a);

      // Cache of fresh classes created per levelNumber:
      const freshClassesCreated = new Map<number, any>();

      for (const lNum of sortedLevelsToClose) {
        const lvlDef = allLevels.find((l) => l.levelNumber === lNum);
        if (!lvlDef) continue;

        // Find the active class for this level
        let activeClass =
          lNum === startLevelNum
            ? startingClass
            : lvlDef.Class.find((c) => !c.isCompleted) || lvlDef.Class[0];

        if (!activeClass) continue;

        // 1. Mark this active class as completed
        await tx.class.update({
          where: { id: activeClass.id },
          data: {
            isCompleted: true,
            completedAt: new Date(),
          },
        });
        resultSummary.closedLevels.push(lNum);

        // 2. Find students who succeeded in this class
        const tests = await tx.levelTest.findMany({
          where: { classId: activeClass.id },
          orderBy: { testDate: "desc" },
        });

        const testStatusMap = new Map<string, boolean>();
        for (const t of tests) {
          if (!testStatusMap.has(t.studentId)) {
            testStatusMap.set(t.studentId, t.passed);
          }
        }

        const enrollments = await tx.enrollment.findMany({
          where: { classId: activeClass.id },
        });

        const succeededStudentIds = enrollments
          .filter((enr) => testStatusMap.get(enr.studentId) === true)
          .map((enr) => enr.studentId);

        // 3. If there is a next level, promote succeeded students
        const nextLevelDef = allLevels.find((l) => l.levelNumber === lNum + 1);
        if (nextLevelDef && succeededStudentIds.length > 0) {
          const nextLevelIsClosed = decisionsMap.get(lNum + 1) === true;

          let targetClass: any = null;

          if (nextLevelIsClosed) {
            // Next level was closed, so its list should be fresh!
            // Check if fresh class already created, otherwise create it
            if (freshClassesCreated.has(nextLevelDef.levelNumber)) {
              targetClass = freshClassesCreated.get(nextLevelDef.levelNumber);
            } else {
              targetClass = await tx.class.create({
                data: {
                  name: `${languageName} - ${nextLevelDef.name}`,
                  branchId: activeClass.branchId,
                  teacherId: activeClass.teacherId,
                  isFormation: true,
                  formationLevelId: nextLevelDef.id,
                  ageGroup: activeClass.ageGroup || "Adultes",
                  pricePerCycle: nextLevelDef.lumpSumPrice,
                  hasBooks: activeClass.hasBooks,
                  bookFee: activeClass.bookFee,
                  inscriptionFee: activeClass.inscriptionFee,
                  isCompleted: false,
                },
              });
              freshClassesCreated.set(nextLevelDef.levelNumber, targetClass);
            }
          } else {
            // Next level is NOT closed: enroll with old registered students in existing active class
            targetClass = nextLevelDef.Class.find((c) => !c.isCompleted);
            if (!targetClass) {
              targetClass = await tx.class.create({
                data: {
                  name: `${languageName} - ${nextLevelDef.name}`,
                  branchId: activeClass.branchId,
                  teacherId: activeClass.teacherId,
                  isFormation: true,
                  formationLevelId: nextLevelDef.id,
                  ageGroup: activeClass.ageGroup || "Adultes",
                  pricePerCycle: nextLevelDef.lumpSumPrice,
                  hasBooks: activeClass.hasBooks,
                  bookFee: activeClass.bookFee,
                  inscriptionFee: activeClass.inscriptionFee,
                  isCompleted: false,
                },
              });
            }
          }

          // Enroll each succeeded student into targetClass
          let enrolledCount = 0;
          for (const sId of succeededStudentIds) {
            const existingEnr = await tx.enrollment.findFirst({
              where: {
                studentId: sId,
                classId: targetClass.id,
                academicYearId: yearId,
              },
            });

            if (!existingEnr) {
              const chargedCount = await tx.enrollment.count({
                where: {
                  studentId: sId,
                  academicYearId: yearId,
                  inscriptionFeeCharged: true,
                },
              });

              const shouldCharge = chargedCount < 3;
              const feeAmount = shouldCharge ? targetClass.inscriptionFee : null;

              await tx.enrollment.create({
                data: {
                  studentId: sId,
                  classId: targetClass.id,
                  academicYearId: yearId,
                  inscriptionFeeCharged: shouldCharge,
                  inscriptionFeeAmount: feeAmount,
                },
              });
              enrolledCount++;
            }
          }

          resultSummary.promotions.push({
            fromLevel: lNum,
            toLevel: lNum + 1,
            studentCount: enrolledCount,
            isFresh: nextLevelIsClosed,
          });
        }
      }
    });

    safeRevalidatePath("/list/formations");
    safeRevalidatePath(`/list/formations/${data.startingClassId}`);

    return {
      success: true,
      error: false,
      message: `Clôture effectuée avec succès (${resultSummary.closedLevels.length} niveau(x) clôturé(s)).`,
      data: serializeForClient(resultSummary),
    };
  } catch (err: any) {
    console.error("Error closing formation levels with cascade:", err);
    return {
      success: false,
      error: true,
      message: err?.message || "Échec de la clôture des niveaux.",
    };
  }
}

export async function enrollGraduatedStudentsInNewFormation(data: {
  studentIds: string[];
  targetClassId: number;
  academicYearId?: number;
}): Promise<ActionResponse> {
  try {
    const session = await getAuthSession();
    if (!session.isOwnerOrAdmin && session.role !== "admin") {
      return { success: false, error: true, message: "Permission refusée." };
    }

    if (!data.studentIds || data.studentIds.length === 0) {
      return { success: false, error: true, message: "Aucun élève sélectionné." };
    }

    const targetClass = await prisma.class.findUnique({
      where: { id: data.targetClassId },
      include: { FormationLevel: true },
    });

    if (!targetClass || !targetClass.isFormation) {
      return { success: false, error: true, message: "Groupe cible invalide." };
    }

    let yearId = data.academicYearId;
    if (!yearId) {
      const year = await prisma.academicYear.findFirst({
        orderBy: { startDate: "desc" },
      });
      yearId = year ? year.id : 1;
    }

    let enrolledCount = 0;
    await prisma.$transaction(async (tx) => {
      for (const sId of data.studentIds) {
        const existing = await tx.enrollment.findFirst({
          where: {
            studentId: sId,
            classId: data.targetClassId,
            academicYearId: yearId,
          },
        });

        if (!existing) {
          const chargedCount = await tx.enrollment.count({
            where: {
              studentId: sId,
              academicYearId: yearId,
              inscriptionFeeCharged: true,
            },
          });

          const shouldCharge = chargedCount < 3;
          const feeAmount = shouldCharge ? targetClass.inscriptionFee : null;

          await tx.enrollment.create({
            data: {
              studentId: sId,
              classId: data.targetClassId,
              academicYearId: yearId,
              inscriptionFeeCharged: shouldCharge,
              inscriptionFeeAmount: feeAmount,
            },
          });
          enrolledCount++;
        }
      }
    });

    safeRevalidatePath("/list/formations");
    safeRevalidatePath(`/list/formations/${data.targetClassId}`);

    return {
      success: true,
      error: false,
      message: `${enrolledCount} élève(s) inscrit(s) dans la nouvelle formation avec succès.`,
    };
  } catch (err: any) {
    console.error("Error enrolling graduated students:", err);
    return {
      success: false,
      error: true,
      message: err?.message || "Échec de l'inscription.",
    };
  }
}

// =================================================================
// 10. FORMATION ATTENDANCE & SESSION ACTIONS
// =================================================================

export async function saveFormationAttendance(
  lessonId: number,
  attendanceRecords: Record<string, "PRESENT" | "ABSENT">
): Promise<ActionResponse> {
  try {
    const session = await getAuthSession();

    const lesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { class: true },
    });

    if (!lesson) {
      return { success: false, error: true, message: "Séance introuvable / الحصة غير موجودة" };
    }

    if (session.branchIds.length > 0 && !canUserAccessBranch(session.rawRole, session.branchIds, lesson.branchId)) {
      return { success: false, error: true, message: "Non autorisé à enregistrer la présence dans cette succursale / غير مصرح لك بتسجيل الحضور في هذا الفرع" };
    }

    const studentIds = Object.keys(attendanceRecords);
    if (studentIds.length === 0) {
      return { success: false, error: true, message: "Aucune donnée de présence envoyée / لم يتم إرسال بيانات حضور" };
    }

    await prisma.$transaction(async (tx) => {
      for (const [studentId, status] of Object.entries(attendanceRecords)) {
        const existing = await tx.attendance.findFirst({
          where: { lessonId, studentId },
        });

        if (existing) {
          await tx.attendance.update({
            where: { id: existing.id },
            data: { status },
          });
        } else {
          await tx.attendance.create({
            data: {
              lessonId,
              studentId,
              status,
            },
          });
        }
      }
    });

    safeRevalidatePath(`/list/formations/${lesson.classId}`);
    return { success: true, error: false, message: "Présence enregistrée avec succès / تم حفظ الحضور بنجاح" };
  } catch (err: any) {
    console.error("Error saving formation attendance:", err);
    return { success: false, error: true, message: err?.message || "Échec de l'enregistrement de présence / فشل في حفظ الحضور" };
  }
}

export async function addFormationSession(data: {
  classId: number;
  startsAt: string | Date;
  endsAt: string | Date;
  teacherId?: string;
  classroomId?: number;
}): Promise<ActionResponse> {
  try {
    const session = await getAuthSession();

    const targetClass = await prisma.class.findUnique({
      where: { id: data.classId },
    });

    if (!targetClass) {
      return { success: false, error: true, message: "Groupe introuvable / الفوج غير موجود" };
    }

    if (session.branchIds.length > 0 && !canUserAccessBranch(session.rawRole, session.branchIds, targetClass.branchId)) {
      return { success: false, error: true, message: "Non autorisé à programmer une séance dans cette succursale / غير مصرح لك ببرمجة حصة في هذا الفرع" };
    }

    const teacherId = data.teacherId || targetClass.teacherId;
    if (!teacherId) {
      return { success: false, error: true, message: "Veuillez assigner un enseignant / يرجى تعيين أستاذ للحصة" };
    }

    // If classroomId not provided, look for one in that branch or default
    let classroomId = data.classroomId;
    if (!classroomId) {
      const defaultRoom = await prisma.classroom.findFirst({
        where: { branchId: targetClass.branchId },
      });
      if (defaultRoom) {
        classroomId = defaultRoom.id;
      }
    }

    if (!classroomId) {
      return { success: false, error: true, message: "Veuillez spécifier la salle / يرجى تحديد القاعة لهذه الحصة" };
    }

    const lesson = await prisma.lesson.create({
      data: {
        classId: data.classId,
        branchId: targetClass.branchId,
        teacherId: teacherId,
        classroomId: classroomId,
        startsAt: new Date(data.startsAt),
        endsAt: new Date(data.endsAt),
      },
    });

    // Automatically create school-wide Arabic announcement expiring when lesson ends
    try {
      const branchRecord = await prisma.branch.findUnique({ where: { id: targetClass.branchId } });
      const classroomRecord = await prisma.classroom.findUnique({ where: { id: classroomId } });
      const startsDate = new Date(data.startsAt);
      const endsDate = new Date(data.endsAt);
      const startsDateStr = startsDate.toLocaleDateString("ar-DZ", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      const startTimeStr = startsDate.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
      const endTimeStr = endsDate.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

      const desc = `حصة تكوينية جديدة لفوج ${targetClass.name} في ${branchRecord?.name || ""} ${classroomRecord ? `- قاعة ${classroomRecord.name}` : ""} بتاريخ ${startsDateStr} من ${startTimeStr} إلى ${endTimeStr}`;

      await prisma.announcement.create({
        data: {
          title: "حصة تكوينية جديدة",
          description: desc,
          classId: data.classId,
          branchId: null, // school-wide
          lessonId: lesson.id,
          createdBy: session.userId || "admin",
          pinned: true,
          expiresAt: endsDate,
        },
      });
      safeRevalidatePath("/list/announcements");
    } catch (annErr) {
      console.warn("Could not create automatic formation session announcement:", annErr);
    }

    safeRevalidatePath(`/list/formations/${data.classId}`);
    return { success: true, error: false, message: "Séance ajoutée avec succès / تمت إضافة الحصة بنجاح", data: serializeForClient(lesson) };
  } catch (err: any) {
    console.error("Error adding formation session:", err);
    return { success: false, error: true, message: err?.message || "Échec de l'ajout de la séance / فشل في إضافة الحصة" };
  }
}

export async function deleteFormationGroup(classId: number): Promise<ActionResponse> {
  try {
    const session = await getAuthSession();
    if (!session.isOwnerOrAdmin && session.role !== "admin") {
      return { success: false, error: true, message: "Permissions insuffisantes pour supprimer le groupe / صلاحية غير كافية لحذف الفوج" };
    }

    const targetClass = await prisma.class.findUnique({
      where: { id: classId },
      include: {
        vouchers: { where: { isVoided: false } },
      },
    });

    if (!targetClass) {
      return { success: false, error: true, message: "Groupe introuvable / الفوج غير موجود" };
    }

    if (targetClass.vouchers.length > 0) {
      return {
        success: false,
        error: true,
        message: "Impossible de supprimer ce groupe car des reçus actifs y sont associés / لا يمكن حذف هذا الفوج لوجود وصولات دفع نشطة مسجلة عليه",
      };
    }

    await prisma.$transaction(async (tx) => {
      const lessons = await tx.lesson.findMany({ where: { classId }, select: { id: true } });
      const lessonIds = lessons.map((l) => l.id);
      if (lessonIds.length > 0) {
        await tx.attendance.deleteMany({ where: { lessonId: { in: lessonIds } } });
        await tx.lesson.deleteMany({ where: { id: { in: lessonIds } } });
      }
      await tx.levelTest.deleteMany({ where: { classId } });
      await tx.enrollment.deleteMany({ where: { classId } });
      await tx.class.delete({ where: { id: classId } });
    });

    safeRevalidatePath("/list/formations");
    return { success: true, error: false, message: "Groupe supprimé avec succès / تم حذف الفوج بنجاح" };
  } catch (err: any) {
    console.error("Error deleting formation group:", err);
    return { success: false, error: true, message: err?.message || "Échec de la suppression du groupe / فشل في حذف الفوج" };
  }
}

export async function updateFormationGroup(data: {
  id: number;
  name: string;
  teacherId?: string | null;
  ageGroup?: string;
  hasBooks?: boolean;
  bookFee?: number | null;
}): Promise<ActionResponse> {
  try {
    const session = await getAuthSession();
    if (!session.isOwnerOrAdmin && session.role !== "admin") {
      return { success: false, error: true, message: "Permissions insuffisantes pour modifier le groupe / صلاحية غير كافية لتعديل الفوج" };
    }

    const updated = await prisma.class.update({
      where: { id: data.id },
      data: {
        name: data.name.trim(),
        teacherId: data.teacherId || null,
        ageGroup: data.ageGroup?.trim() || null,
        hasBooks: !!data.hasBooks,
        bookFee: data.hasBooks && data.bookFee ? new Prisma.Decimal(data.bookFee) : null,
      },
    });

    safeRevalidatePath("/list/formations");
    safeRevalidatePath(`/list/formations/${data.id}`);
    return { success: true, error: false, message: "Groupe mis à jour avec succès / تم تحديث بيانات الفوج بنجاح", data: serializeForClient(updated) };
  } catch (err: any) {
    console.error("Error updating formation group:", err);
    return { success: false, error: true, message: err?.message || "فشل في تحديث بيانات الفوج." };
  }
}

export async function updateFormationWithLevels(data: {
  id: number;
  name: string;
  teacherId?: string | null;
  ageGroup?: string;
  hasBooks?: boolean;
  bookFee?: number | null;
  levels?: Array<{
    id?: number;
    name: string;
    lumpSumPrice: number;
    isDeleted?: boolean;
  }>;
}): Promise<ActionResponse> {
  try {
    const session = await getAuthSession();
    if (!session.isOwnerOrAdmin && session.role !== "admin") {
      return { success: false, error: true, message: "Permissions insuffisantes pour modifier le groupe / صلاحية غير كافية لتعديل الفوج" };
    }

    const targetClass = await prisma.class.findUnique({
      where: { id: data.id },
      include: { FormationLevel: true },
    });

    if (!targetClass || !targetClass.isFormation || !targetClass.FormationLevel) {
      return { success: false, error: true, message: "Groupe de formation introuvable." };
    }

    const languageId = targetClass.FormationLevel.languageId;

    await prisma.$transaction(async (tx) => {
      // 1. Update the class itself
      await tx.class.update({
        where: { id: data.id },
        data: {
          name: data.name.trim(),
          teacherId: data.teacherId || null,
          ageGroup: data.ageGroup?.trim() || null,
          hasBooks: !!data.hasBooks,
          bookFee: data.hasBooks && data.bookFee ? new Prisma.Decimal(data.bookFee) : null,
        },
      });

      // 2. Process levels if provided
      if (data.levels && data.levels.length > 0) {
        const existingLevels = await tx.formationLevel.findMany({
          where: { languageId },
          include: {
            Class: {
              select: { id: true, enrollments: { select: { id: true } } },
            },
            LevelTest: { select: { id: true } },
          },
          orderBy: { levelNumber: "asc" },
        });

        // 2a. Validate that at least one level remains active
        const remainingActive = data.levels.filter((l) => !l.isDeleted);
        if (remainingActive.length === 0) {
          throw new Error(
            "Impossible de supprimer tous les niveaux. Une formation doit comporter au moins un niveau / لا يمكن حذف جميع المستويات. يجب أن يحتوي التكوين على مستوى واحد على الأقل"
          );
        }

        // 2b. Process deletions safely
        for (const lvl of data.levels) {
          if (lvl.id && lvl.isDeleted) {
            await executeSafeDeleteFormationLevel(tx, lvl.id);
          }
        }

        // 2b. Process updates on existing non-deleted levels
        for (const lvl of data.levels) {
          if (lvl.id && !lvl.isDeleted) {
            await tx.formationLevel.update({
              where: { id: lvl.id },
              data: {
                name: lvl.name.trim(),
                lumpSumPrice: new Prisma.Decimal(lvl.lumpSumPrice || 0),
              },
            });

            if (lvl.id === targetClass.formationLevelId) {
              await tx.class.update({
                where: { id: targetClass.id },
                data: {
                  pricePerCycle: new Prisma.Decimal(lvl.lumpSumPrice || 0),
                },
              });
            }
          }
        }

        // 2c. Process creations for new levels
        let highestLevelNum = existingLevels.reduce(
          (max, el) => Math.max(max, el.levelNumber),
          0
        );

        for (const lvl of data.levels) {
          if (!lvl.id && !lvl.isDeleted && lvl.name.trim()) {
            highestLevelNum += 1;
            await tx.formationLevel.create({
              data: {
                languageId,
                levelNumber: highestLevelNum,
                name: lvl.name.trim(),
                lumpSumPrice: new Prisma.Decimal(lvl.lumpSumPrice || 0),
              },
            });
          }
        }
      }
    });

    safeRevalidatePath("/list/formations");
    safeRevalidatePath(`/list/formations/${data.id}`);

    return {
      success: true,
      error: false,
      message: "Formation et niveaux mis à jour avec succès / تم تحديث بيانات التكوين والمستويات بنجاح",
    };
  } catch (err: any) {
    console.error("Error updating formation with levels:", err);
    return {
      success: false,
      error: true,
      message: err?.message || "Échec de la mise à jour de la formation et des niveaux.",
    };
  }
}

export async function deleteFormationAction(
  currentState: any,
  formData: FormData
): Promise<ActionResponse> {
  const id = formData.get("id") as string;
  try {
    return await deleteFormationGroup(parseInt(id));
  } catch (err: any) {
    return { success: false, error: true, message: err?.message || "فشل في حذف الفوج التكويني." };
  }
}

// =================================================================
// 12. DELETE REGISTERED STUDENT(S) FROM FORMATION LEVEL
// =================================================================

export async function deleteStudentFromFormationLevel(data: {
  enrollmentId: number;
  classId: number;
  studentId: string;
}): Promise<ActionResponse> {
  try {
    const session = await getAuthSession();
    if (!session.isOwnerOrAdmin && session.role !== "admin") {
      return {
        success: false,
        error: true,
        message: "Permissions insuffisantes pour supprimer cet élève / صلاحية غير كافية لحذف التلميذ",
      };
    }

    const enrollment = await prisma.enrollment.findUnique({
      where: { id: data.enrollmentId },
      include: {
        class: true,
        student: true,
      },
    });

    if (!enrollment || enrollment.classId !== data.classId) {
      return {
        success: false,
        error: true,
        message: "Inscription introuvable / التسجيل غير موجود",
      };
    }

    if (
      session.branchIds.length > 0 &&
      !canUserAccessBranch(session.rawRole, session.branchIds, enrollment.class.branchId)
    ) {
      return {
        success: false,
        error: true,
        message: "Non autorisé pour cette succursale / غير مصرح لك بهذا الفرع",
      };
    }

    await prisma.$transaction(async (tx) => {
      // 1. Remove enrollment transfers referencing this enrollment
      await tx.enrollmentTransfer.deleteMany({
        where: {
          OR: [
            { fromEnrollmentId: data.enrollmentId },
            { toEnrollmentId: data.enrollmentId },
          ],
        },
      });

      // 2. Remove level test records for this student in this formation group
      await tx.levelTest.deleteMany({
        where: {
          studentId: data.studentId,
          classId: data.classId,
        },
      });

      // 3. Remove attendances for lessons of this formation group
      const lessons = await tx.lesson.findMany({
        where: { classId: data.classId },
        select: { id: true },
      });
      const lessonIds = lessons.map((l) => l.id);
      if (lessonIds.length > 0) {
        await tx.attendance.deleteMany({
          where: {
            studentId: data.studentId,
            lessonId: { in: lessonIds },
          },
        });
      }

      // 4. Delete the enrollment record
      await tx.enrollment.delete({
        where: { id: data.enrollmentId },
      });
    });

    safeRevalidatePath("/list/formations");
    safeRevalidatePath(`/list/formations/${data.classId}`);
    safeRevalidatePath(`/list/payments/class/${data.classId}`);
    safeRevalidatePath("/list/students");

    return {
      success: true,
      error: false,
      message: "Élève désinscrit du niveau avec succès (profil conservé) / تم إلغاء تسجيل التلميذ من المستوى بنجاح (الملف محفوظ)",
    };
  } catch (err: any) {
    console.error("Error un-enrolling student from formation level:", err);
    return {
      success: false,
      error: true,
      message: err?.message || "Échec de la désinscription de l'élève / فشل في إلغاء تسجيل التلميذ من المستوى",
    };
  }
}

export async function deleteMultipleStudentsFromFormationLevel(data: {
  classId: number;
  enrollments: Array<{ enrollmentId: number; studentId: string }>;
}): Promise<ActionResponse> {
  try {
    const session = await getAuthSession();
    if (!session.isOwnerOrAdmin && session.role !== "admin") {
      return {
        success: false,
        error: true,
        message: "Permissions insuffisantes / صلاحية غير كافية",
      };
    }

    const cls = await prisma.class.findUnique({
      where: { id: data.classId },
      select: { id: true, branchId: true },
    });
    if (!cls) {
      return { success: false, error: true, message: "Groupe introuvable / الفوج غير موجود" };
    }

    if (
      session.branchIds.length > 0 &&
      !canUserAccessBranch(session.rawRole, session.branchIds, cls.branchId)
    ) {
      return {
        success: false,
        error: true,
        message: "Non autorisé pour cette succursale / غير مصرح لك بهذا الفرع",
      };
    }

    const enrollmentIds = data.enrollments.map((e) => e.enrollmentId);
    const studentIds = data.enrollments.map((e) => e.studentId);

    await prisma.$transaction(async (tx) => {
      await tx.enrollmentTransfer.deleteMany({
        where: {
          OR: [
            { fromEnrollmentId: { in: enrollmentIds } },
            { toEnrollmentId: { in: enrollmentIds } },
          ],
        },
      });

      await tx.levelTest.deleteMany({
        where: {
          classId: data.classId,
          studentId: { in: studentIds },
        },
      });

      const lessons = await tx.lesson.findMany({
        where: { classId: data.classId },
        select: { id: true },
      });
      const lessonIds = lessons.map((l) => l.id);
      if (lessonIds.length > 0) {
        await tx.attendance.deleteMany({
          where: {
            studentId: { in: studentIds },
            lessonId: { in: lessonIds },
          },
        });
      }

      await tx.enrollment.deleteMany({
        where: { id: { in: enrollmentIds } },
      });
    });

    safeRevalidatePath("/list/formations");
    safeRevalidatePath(`/list/formations/${data.classId}`);
    safeRevalidatePath(`/list/payments/class/${data.classId}`);
    safeRevalidatePath("/list/students");

    return {
      success: true,
      error: false,
      message: `${enrollmentIds.length} élève(s) désinscrit(s) du niveau avec succès / تم إلغاء تسجيل التلاميذ بنجاح`,
    };
  } catch (err: any) {
    console.error("Error batch un-enrolling students from formation level:", err);
    return {
      success: false,
      error: true,
      message: err?.message || "Échec de la désinscription / فشل في إلغاء التسجيل",
    };
  }
}



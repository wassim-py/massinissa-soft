"use server";

import prisma from "@/lib/prisma";
import { getAuthSession } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { createClerkClient } from "@clerk/nextjs/server";
import {
  accountSchema,
  AccountSchema,
  branchSchema,
  BranchSchema,
  classroomConfigSchema,
  ClassroomConfigSchema,
  levelConfigSchema,
  LevelConfigSchema,
  formationLanguageConfigSchema,
  FormationLanguageConfigSchema,
  formationLevelConfigSchema,
  FormationLevelConfigSchema,
  academicYearConfigSchema,
  AcademicYearConfigSchema,
} from "@/lib/formValidationSchemas";
import { Role, Prisma } from "@prisma/client";
import { executeSafeDeleteFormationLevel } from "@/lib/formationActions";

export type CurrentState = {
  success: boolean;
  error: boolean;
  message?: string;
};

function safeRevalidatePath(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // Ignore outside Next.js request context (e.g. scripts/unit tests)
  }
}

// =================================================================
// 1. ACCOUNT MANAGEMENT ACTIONS (OWNER-ONLY)
// =================================================================

export async function createAccountAction(
  currentState: CurrentState,
  data: AccountSchema
): Promise<CurrentState> {
  try {
    const session = await getAuthSession();
    if (!session.isOwner) {
      return {
        success: false,
        error: true,
        message: "Action réservée au propriétaire / هذا الإجراء متاح لمالك المؤسسة فقط.",
      };
    }

    const validated = accountSchema.safeParse(data);
    if (!validated.success) {
      return {
        success: false,
        error: true,
        message: validated.error.errors[0]?.message || "Données non valides / بيانات غير صالحة",
      };
    }

    const { username, password, name, role, branchId, email } = validated.data;

    // Check if username already exists in database
    const existing = await prisma.userProfile.findFirst({
      where: {
        OR: [
          { username: username },
          ...(email ? [{ email: email }] : []),
        ],
      },
    });

    if (existing) {
      return {
        success: false,
        error: true,
        message: "Ce nom d'utilisateur ou email existe déjà / اسم المستخدم أو البريد موجود بالفعل",
      };
    }

    const resolvedEmail = email?.trim() || `${username.toLowerCase()}@massinissa-school.dz`;
    const resolvedPassword = password?.trim() || "password123";

    // 1. Synchronize creation with Clerk if configured
    let clerkUserId: string | null = null;
    const clerkSecret = process.env.CLERK_SECRET_KEY;
    if (clerkSecret) {
      try {
        const client = createClerkClient({ secretKey: clerkSecret });
        const clerkUser = await client.users.createUser({
          username,
          password: resolvedPassword,
          firstName: name,
          publicMetadata: {
            role,
            branchId: role === "OWNER" ? undefined : branchId || undefined,
            branchIds: role === "OWNER" ? [] : branchId ? [branchId] : [],
          },
        });
        clerkUserId = clerkUser.id;
      } catch (clerkErr: any) {
        console.warn("Clerk user creation error (fallback to DB only):", clerkErr?.message || clerkErr);
      }
    }

    // 2. Persist directly in PostgreSQL UserProfile table
    const profileId = clerkUserId || `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    await prisma.userProfile.create({
      data: {
        id: profileId,
        username,
        password: resolvedPassword,
        name,
        email: resolvedEmail,
        role: role as Role,
        branchId: role === "OWNER" ? null : (branchId ? Number(branchId) : null),
        updatedAt: new Date(),
      },
    });

    safeRevalidatePath("/admin/configuration");
    safeRevalidatePath("/fr/admin/configuration");
    safeRevalidatePath("/ar/admin/configuration");

    return {
      success: true,
      error: false,
      message: "Compte créé avec succès / تم إنشاء الحساب بنجاح",
    };
  } catch (err: any) {
    console.error("Error creating account:", err);
    return {
      success: false,
      error: true,
      message: err?.message || "Échec de création du compte / فشل في إنشاء الحساب",
    };
  }
}

export async function updateAccountAction(
  currentState: CurrentState,
  data: AccountSchema
): Promise<CurrentState> {
  try {
    const session = await getAuthSession();
    if (!session.isOwner) {
      return {
        success: false,
        error: true,
        message: "Action réservée au propriétaire / هذا الإجراء متاح لمالك المؤسسة فقط.",
      };
    }

    if (!data.id) {
      return {
        success: false,
        error: true,
        message: "Identifiant du compte manquant / معرف الحساب مفقود",
      };
    }

    const validated = accountSchema.safeParse(data);
    if (!validated.success) {
      return {
        success: false,
        error: true,
        message: validated.error.errors[0]?.message || "Données non valides / بيانات غير صالحة",
      };
    }

    const { id, username, password, name, role, branchId, email } = validated.data;
    if (!id) {
      return {
        success: false,
        error: true,
        message: "Identifiant du compte manquant / معرف الحساب مفقود",
      };
    }

    // Check duplicate username on other accounts
    const duplicate = await prisma.userProfile.findFirst({
      where: {
        username,
        NOT: { id },
      },
    });
    if (duplicate) {
      return {
        success: false,
        error: true,
        message: "Ce nom d'utilisateur est déjà utilisé / اسم المستخدم مستعمل بالفعل",
      };
    }

    // 1. Sync update with Clerk if configured
    const clerkSecret = process.env.CLERK_SECRET_KEY;
    if (clerkSecret) {
      try {
        const client = createClerkClient({ secretKey: clerkSecret });
        // Look up by id or search by current username
        let targetClerkId = id.startsWith("user_") ? id : null;
        if (!targetClerkId) {
          const search = await client.users.getUserList({ username: [username] });
          if (search.data && search.data.length > 0) {
            targetClerkId = search.data[0].id;
          }
        }

        if (targetClerkId) {
          const clerkParams: any = {
            username,
            firstName: name,
            publicMetadata: {
              role,
              branchId: role === "OWNER" ? undefined : branchId || undefined,
              branchIds: role === "OWNER" ? [] : branchId ? [branchId] : [],
            },
          };
          if (password && password.trim().length >= 6) {
            clerkParams.password = password.trim();
            clerkParams.skipPasswordChecks = true;
          }

          await client.users.updateUser(targetClerkId, clerkParams);
        }
      } catch (clerkErr: any) {
        console.warn("Clerk update error (fallback to DB only):", clerkErr?.message || clerkErr);
      }
    }

    // 2. Update database record directly
    const updateData: any = {
      username,
      name,
      role: role as Role,
      branchId: role === "OWNER" ? null : (branchId ? Number(branchId) : null),
      updatedAt: new Date(),
    };

    if (email && email.trim()) {
      updateData.email = email.trim();
    }
    if (password && password.trim().length >= 6) {
      updateData.password = password.trim();
    }

    await prisma.userProfile.update({
      where: { id },
      data: updateData,
    });

    safeRevalidatePath("/admin/configuration");
    safeRevalidatePath("/fr/admin/configuration");
    safeRevalidatePath("/ar/admin/configuration");

    return {
      success: true,
      error: false,
      message: "Compte mis à jour avec succès / تم تحديث الحساب بنجاح",
    };
  } catch (err: any) {
    console.error("Error updating account:", err);
    return {
      success: false,
      error: true,
      message: err?.message || "Échec de mise à jour du compte / فشل في تحديث الحساب",
    };
  }
}

export async function deleteAccountAction(
  currentState: CurrentState,
  data: FormData
): Promise<CurrentState> {
  try {
    const session = await getAuthSession();
    if (!session.isOwner) {
      return {
        success: false,
        error: true,
        message: "Action réservée au propriétaire / هذا الإجراء متاح لمالك المؤسسة فقط.",
      };
    }

    const id = data.get("id") as string;
    if (!id) {
      return {
        success: false,
        error: true,
        message: "Identifiant manquant / معرف الحساب مفقود",
      };
    }

    const target = await prisma.userProfile.findUnique({
      where: { id },
    });

    if (!target) {
      return {
        success: false,
        error: true,
        message: "Compte introuvable / الحساب غير موجود",
      };
    }

    // Prevent deleting owner's current account
    if (session.userId === id || target.role === "OWNER") {
      const ownerCount = await prisma.userProfile.count({
        where: { role: "OWNER" },
      });
      if (ownerCount <= 1) {
        return {
          success: false,
          error: true,
          message: "Impossible de supprimer le compte propriétaire principal / لا يمكن حذف حساب المالك الرئيسي",
        };
      }
    }

    // Delete in Clerk if applicable
    const clerkSecret = process.env.CLERK_SECRET_KEY;
    if (clerkSecret && id.startsWith("user_")) {
      try {
        const client = createClerkClient({ secretKey: clerkSecret });
        await client.users.deleteUser(id);
      } catch (e: any) {
        console.warn("Clerk delete error:", e?.message || e);
      }
    }

    await prisma.userProfile.delete({
      where: { id },
    });

    safeRevalidatePath("/admin/configuration");
    safeRevalidatePath("/fr/admin/configuration");
    safeRevalidatePath("/ar/admin/configuration");

    return {
      success: true,
      error: false,
      message: "Compte supprimé avec succès / تم حذف الحساب بنجاح",
    };
  } catch (err: any) {
    console.error("Error deleting account:", err);
    return {
      success: false,
      error: true,
      message: err?.message || "Échec de suppression du compte / فشل في حذف الحساب",
    };
  }
}

// =================================================================
// 2. BRANCH MANAGEMENT ACTIONS (OWNER-ONLY)
// =================================================================

export async function createBranchAction(
  currentState: CurrentState,
  data: BranchSchema
): Promise<CurrentState> {
  try {
    const session = await getAuthSession();
    if (!session.isOwner) {
      return {
        success: false,
        error: true,
        message: "Action réservée au propriétaire / هذا الإجراء متاح لمالك المؤسسة فقط.",
      };
    }

    const validated = branchSchema.safeParse(data);
    if (!validated.success) {
      return {
        success: false,
        error: true,
        message: validated.error.errors[0]?.message || "Données non valides / بيانات غير صالحة",
      };
    }

    const { name, address, phone, manager } = validated.data;

    // Check unique branch name
    const existing = await prisma.branch.findUnique({
      where: { name: name.trim() },
    });
    if (existing) {
      return {
        success: false,
        error: true,
        message: "Une branche avec ce nom existe déjà / يوجد فرع بهذا الاسم بالفعل",
      };
    }

    await prisma.branch.create({
      data: {
        name: name.trim(),
        address: address?.trim() || "",
        phone: phone?.trim() || null,
        manager: manager?.trim() || null,
      },
    });

    safeRevalidatePath("/admin/configuration");
    safeRevalidatePath("/fr/admin/configuration");
    safeRevalidatePath("/ar/admin/configuration");

    return {
      success: true,
      error: false,
      message: "Branche créée avec succès / تم إنشاء الفرع بنجاح",
    };
  } catch (err: any) {
    console.error("Error creating branch:", err);
    return {
      success: false,
      error: true,
      message: err?.message || "Échec de création de la branche / فشل في إنشاء الفرع",
    };
  }
}

export async function updateBranchAction(
  currentState: CurrentState,
  data: BranchSchema
): Promise<CurrentState> {
  try {
    const session = await getAuthSession();
    if (!session.isOwner) {
      return {
        success: false,
        error: true,
        message: "Action réservée au propriétaire / هذا الإجراء متاح لمالك المؤسسة فقط.",
      };
    }

    if (!data.id) {
      return {
        success: false,
        error: true,
        message: "Identifiant de la branche manquant / معرف الفرع مفقود",
      };
    }

    const validated = branchSchema.safeParse(data);
    if (!validated.success) {
      return {
        success: false,
        error: true,
        message: validated.error.errors[0]?.message || "Données non valides / بيانات غير صالحة",
      };
    }

    const { id, name, address, phone, manager } = validated.data;

    // Check duplicate name
    const duplicate = await prisma.branch.findFirst({
      where: {
        name: name.trim(),
        NOT: { id: Number(id) },
      },
    });
    if (duplicate) {
      return {
        success: false,
        error: true,
        message: "Ce nom de branche est déjà utilisé / اسم الفرع مستعمل بالفعل",
      };
    }

    await prisma.branch.update({
      where: { id: Number(id) },
      data: {
        name: name.trim(),
        address: address?.trim() || "",
        phone: phone?.trim() || null,
        manager: manager?.trim() || null,
      },
    });

    safeRevalidatePath("/admin/configuration");
    safeRevalidatePath("/fr/admin/configuration");
    safeRevalidatePath("/ar/admin/configuration");

    return {
      success: true,
      error: false,
      message: "Branche mise à jour avec succès / تم تحديث الفرع بنجاح",
    };
  } catch (err: any) {
    console.error("Error updating branch:", err);
    return {
      success: false,
      error: true,
      message: err?.message || "Échec de mise à jour de la branche / فشل في تحديث الفرع",
    };
  }
}

// =================================================================
// 3. CLASSROOM MANAGEMENT ACTIONS (OWNER-ONLY)
// =================================================================

export async function createClassroomAction(
  currentState: CurrentState,
  data: ClassroomConfigSchema
): Promise<CurrentState> {
  try {
    const session = await getAuthSession();
    if (!session.isOwner) {
      return {
        success: false,
        error: true,
        message: "Action réservée au propriétaire / هذا الإجراء متاح لمالك المؤسسة فقط.",
      };
    }

    const validated = classroomConfigSchema.safeParse(data);
    if (!validated.success) {
      return {
        success: false,
        error: true,
        message: validated.error.errors[0]?.message || "Données non valides / بيانات غير صالحة",
      };
    }

    const { name, branchId } = validated.data;

    // Check duplicate in same branch
    const existing = await prisma.classroom.findFirst({
      where: {
        name: name.trim(),
        branchId: Number(branchId),
      },
    });
    if (existing) {
      return {
        success: false,
        error: true,
        message: "Une salle avec ce nom existe déjà dans ce siège / توجد قاعة بهذا الاسم في هذا الفرع",
      };
    }

    await prisma.classroom.create({
      data: {
        name: name.trim(),
        branchId: Number(branchId),
      },
    });

    safeRevalidatePath("/admin/configuration");
    safeRevalidatePath("/fr/admin/configuration");
    safeRevalidatePath("/ar/admin/configuration");

    return {
      success: true,
      error: false,
      message: "Salle créée avec succès / تم إنشاء القاعة بنجاح",
    };
  } catch (err: any) {
    console.error("Error creating classroom:", err);
    return {
      success: false,
      error: true,
      message: err?.message || "Échec de création de la salle / فشل في إنشاء القاعة",
    };
  }
}

export async function updateClassroomAction(
  currentState: CurrentState,
  data: ClassroomConfigSchema
): Promise<CurrentState> {
  try {
    const session = await getAuthSession();
    if (!session.isOwner) {
      return {
        success: false,
        error: true,
        message: "Action réservée au propriétaire / هذا الإجراء متاح لمالك المؤسسة فقط.",
      };
    }

    if (!data.id) {
      return {
        success: false,
        error: true,
        message: "Identifiant de la salle manquant / معرف القاعة مفقود",
      };
    }

    const validated = classroomConfigSchema.safeParse(data);
    if (!validated.success) {
      return {
        success: false,
        error: true,
        message: validated.error.errors[0]?.message || "Données non valides / بيانات غير صالحة",
      };
    }

    const { id, name, branchId } = validated.data;

    // Check duplicate in same branch
    const duplicate = await prisma.classroom.findFirst({
      where: {
        name: name.trim(),
        branchId: Number(branchId),
        NOT: { id: Number(id) },
      },
    });
    if (duplicate) {
      return {
        success: false,
        error: true,
        message: "Ce nom de salle existe déjà dans ce siège / اسم القاعة مستعمل بالفعل في هذا الفرع",
      };
    }

    await prisma.classroom.update({
      where: { id: Number(id) },
      data: {
        name: name.trim(),
        branchId: Number(branchId),
      },
    });

    safeRevalidatePath("/admin/configuration");
    safeRevalidatePath("/fr/admin/configuration");
    safeRevalidatePath("/ar/admin/configuration");

    return {
      success: true,
      error: false,
      message: "Salle mise à jour avec succès / تم تحديث القاعة بنجاح",
    };
  } catch (err: any) {
    console.error("Error updating classroom:", err);
    return {
      success: false,
      error: true,
      message: err?.message || "Échec de mise à jour de la salle / فشل في تحديث القاعة",
    };
  }
}

export async function deleteClassroomAction(
  currentState: CurrentState,
  data: FormData
): Promise<CurrentState> {
  try {
    const session = await getAuthSession();
    if (!session.isOwner) {
      return {
        success: false,
        error: true,
        message: "Action réservée au propriétaire / هذا الإجراء متاح لمالك المؤسسة فقط.",
      };
    }

    const id = data.get("id") as string;
    if (!id) {
      return {
        success: false,
        error: true,
        message: "Identifiant manquant / معرف القاعة مفقود",
      };
    }

    const classroomId = Number(id);

    // Conflict detection: verify no scheduled lessons depend on this classroom
    const lessonCount = await prisma.lesson.count({
      where: { classroomId },
    });

    if (lessonCount > 0) {
      return {
        success: false,
        error: true,
        message: `Impossible de supprimer la salle (${lessonCount} cours programmés) / لا يمكن حذف القاعة لوجود (${lessonCount}) حصص مبرمجة بها`,
      };
    }

    await prisma.classroom.delete({
      where: { id: classroomId },
    });

    safeRevalidatePath("/admin/configuration");
    safeRevalidatePath("/fr/admin/configuration");
    safeRevalidatePath("/ar/admin/configuration");

    return {
      success: true,
      error: false,
      message: "Salle supprimée avec succès / تم حذف القاعة بنجاح",
    };
  } catch (err: any) {
    console.error("Error deleting classroom:", err);
    return {
      success: false,
      error: true,
      message: err?.message || "Échec de suppression de la salle / فشل في حذف القاعة",
    };
  }
}

// =================================================================
// 4. TRIMESTER MANAGEMENT ACTIONS (OWNER-ONLY, §7.20)
// =================================================================

export async function getActiveTrimester() {
  try {
    return await prisma.trimester.findFirst({
      where: { status: "active" },
      include: { academicYear: true },
    });
  } catch (err) {
    try {
      const rows = await prisma.$queryRaw<any[]>`
        SELECT t.*, row_to_json(a.*) as "academicYear"
        FROM "Trimester" t
        LEFT JOIN "AcademicYear" a ON a.id = t."academicYearId"
        WHERE t.status = 'active'
        LIMIT 1
      `;
      if (rows && rows.length > 0) {
        return rows[0];
      }
    } catch {
      // Ignore if query fails
    }
    return prisma.trimester.findFirst({
      include: { academicYear: true },
      orderBy: { startDate: "asc" },
    });
  }
}

export async function startNextTrimesterAction(
  currentState?: CurrentState
): Promise<CurrentState> {
  try {
    const session = await getAuthSession();
    if (!session.isOwner) {
      return {
        success: false,
        error: true,
        message: "Action réservée au propriétaire / هذا الإجراء متاح لمالك المؤسسة فقط.",
      };
    }

    // 1. Resolve current academic year
    const academicYear = await prisma.academicYear.findFirst({
      orderBy: { startDate: "desc" },
      include: {
        trimesters: {
          orderBy: { startDate: "asc" },
        },
      },
    });

    if (!academicYear || academicYear.trimesters.length === 0) {
      return {
        success: false,
        error: true,
        message: "Aucun trimestre configuré pour l'année scolaire / لم يتم العثور على فصول دراسية للسنة الحالية.",
      };
    }

    const trimesters = academicYear.trimesters;
    const activeTrimester = trimesters.find((t) => t.status === "active");

    // Determine target next trimester (T1 -> T2 -> T3)
    let nextTrimester: typeof trimesters[0] | undefined;

    if (!activeTrimester) {
      nextTrimester = trimesters.find((t) => t.status === "not_started");
      if (!nextTrimester) {
        return {
          success: false,
          error: true,
          message: "Tous les trimestres de cette année sont déjà terminés / جميع الفصول الدراسية لهذه السنة منتهية بالفعل.",
        };
      }
    } else {
      const currentIndex = trimesters.findIndex((t) => t.id === activeTrimester.id);
      if (currentIndex >= trimesters.length - 1) {
        return {
          success: false,
          error: true,
          message: "Le dernier trimestre (T3) est déjà en cours ou terminé / الفصل الأخير نشط بالفعل أو تم الانتهاء منه.",
        };
      }
      nextTrimester = trimesters[currentIndex + 1];
    }

    await prisma.$transaction(async (tx) => {
      // 1. Auto-finish previous active trimester if any
      if (activeTrimester) {
        await tx.trimester.update({
          where: { id: activeTrimester.id },
          data: { status: "finished" },
        });
      }

      // Ensure no other trimester is active
      await tx.trimester.updateMany({
        where: {
          id: { not: nextTrimester.id },
          status: "active",
        },
        data: { status: "finished" },
      });

      // 2. Activate the next trimester
      await tx.trimester.update({
        where: { id: nextTrimester.id },
        data: { status: "active" },
      });
    });

    safeRevalidatePath("/admin/configuration");
    safeRevalidatePath("/fr/admin/configuration");
    safeRevalidatePath("/ar/admin/configuration");
    safeRevalidatePath("/list/classes");
    safeRevalidatePath("/list/payments");
    safeRevalidatePath("/list/attendance");

    return {
      success: true,
      error: false,
      message: `Trimestre ${nextTrimester.label} démarré avec succès. L'ancien trimestre a été clôturé / تم تفعيل الفصل (${nextTrimester.label}) بنجاح وإنهاء الفصل السابق.`,
    };
  } catch (err: any) {
    console.error("Error starting next trimester:", err);
    return {
      success: false,
      error: true,
      message: err?.message || "Échec du démarrage du trimestre / فشل في بدء الفصل الدراسي",
    };
  }
}

export async function finishCurrentTrimesterAction(
  currentState?: CurrentState
): Promise<CurrentState> {
  try {
    const session = await getAuthSession();
    if (!session.isOwner) {
      return {
        success: false,
        error: true,
        message: "Action réservée au propriétaire / هذا الإجراء متاح لمالك المؤسسة فقط.",
      };
    }

    const activeTrimester = await prisma.trimester.findFirst({
      where: { status: "active" },
    });

    if (!activeTrimester) {
      return {
        success: false,
        error: true,
        message: "Aucun trimestre n'est actuellement actif / لا يوجد فصل دراسي نشط حالياً.",
      };
    }

    await prisma.trimester.update({
      where: { id: activeTrimester.id },
      data: { status: "finished" },
    });

    safeRevalidatePath("/admin/configuration");
    safeRevalidatePath("/fr/admin/configuration");
    safeRevalidatePath("/ar/admin/configuration");
    safeRevalidatePath("/list/classes");
    safeRevalidatePath("/list/payments");
    safeRevalidatePath("/list/attendance");

    return {
      success: true,
      error: false,
      message: `Le trimestre ${activeTrimester.label} a été clôturé et gelé en lecture seule / تم إنهاء الفصل (${activeTrimester.label}) وتجميده كأرشيف للقراءة فقط.`,
    };
  } catch (err: any) {
    console.error("Error finishing current trimester:", err);
    return {
      success: false,
      error: true,
      message: err?.message || "Échec de clôture du trimestre / فشل في إنهاء الفصل الدراسي",
    };
  }
}

export async function createAcademicYearAction(
  currentState: CurrentState,
  data: AcademicYearConfigSchema
): Promise<CurrentState> {
  try {
    const session = await getAuthSession();
    if (!session.isOwner) {
      return {
        success: false,
        error: true,
        message: "Action réservée au propriétaire / هذا الإجراء متاح لمالك المؤسسة فقط.",
      };
    }

    const validated = academicYearConfigSchema.safeParse(data);
    if (!validated.success) {
      return {
        success: false,
        error: true,
        message: validated.error.errors[0]?.message || "Données non valides / بيانات غير صالحة",
      };
    }

    const { label, startDate, endDate } = validated.data;
    const trimmedLabel = label.trim();

    const existing = await prisma.academicYear.findFirst({
      where: { label: { equals: trimmedLabel, mode: "insensitive" } },
    });

    if (existing) {
      return {
        success: false,
        error: true,
        message: "Cette année scolaire existe déjà / هذه السنة الدراسية موجودة بالفعل.",
      };
    }

    const sDate = new Date(startDate);
    const eDate = new Date(endDate);

    if (isNaN(sDate.getTime()) || isNaN(eDate.getTime())) {
      return {
        success: false,
        error: true,
        message: "Dates non valides / التواريخ المدخلة غير صالحة.",
      };
    }

    if (sDate >= eDate) {
      return {
        success: false,
        error: true,
        message: "La date de début doit être antérieure à la date de fin / يجب أن يكون تاريخ البداية قبل تاريخ النهاية.",
      };
    }

    const yearStart = sDate.getFullYear();
    const yearEnd = eDate.getFullYear();

    const trim1Start = sDate;
    const trim1End = new Date(Date.UTC(yearStart, 11, 31, 23, 59, 59));
    const trim2Start = new Date(Date.UTC(yearEnd, 0, 1, 0, 0, 0));
    const trim2End = new Date(Date.UTC(yearEnd, 2, 31, 23, 59, 59));
    const trim3Start = new Date(Date.UTC(yearEnd, 3, 1, 0, 0, 0));
    const trim3End = eDate;

    await prisma.academicYear.create({
      data: {
        label: trimmedLabel,
        startDate: sDate,
        endDate: eDate,
        trimesters: {
          create: [
            {
              name: "Trimestre 1",
              label: "T1",
              status: "active",
              startDate: trim1Start,
              endDate: trim1End,
            },
            {
              name: "Trimestre 2",
              label: "T2",
              status: "not_started",
              startDate: trim2Start,
              endDate: trim2End,
            },
            {
              name: "Trimestre 3",
              label: "T3",
              status: "not_started",
              startDate: trim3Start,
              endDate: trim3End,
            },
          ],
        },
      },
    });

    safeRevalidatePath("/admin/configuration");
    safeRevalidatePath("/fr/admin/configuration");
    safeRevalidatePath("/ar/admin/configuration");
    safeRevalidatePath("/list/classes");
    safeRevalidatePath("/list/students");

    return {
      success: true,
      error: false,
      message: "Année scolaire créée avec succès / تم إنشاء السنة الدراسية بنجاح.",
    };
  } catch (err: any) {
    console.error("Error creating academic year:", err);
    return {
      success: false,
      error: true,
      message: err?.message || "Échec de création de l'année scolaire / فشل في إنشاء السنة الدراسية.",
    };
  }
}

export async function deleteAcademicYearAction(
  currentState: CurrentState,
  data: FormData
): Promise<CurrentState> {
  try {
    const session = await getAuthSession();
    if (!session.isOwner) {
      return {
        success: false,
        error: true,
        message: "Action réservée au propriétaire / هذا الإجراء متاح لمالك المؤسسة فقط.",
      };
    }

    const idStr = data.get("id") as string;
    const id = parseInt(idStr, 10);
    if (isNaN(id)) {
      return {
        success: false,
        error: true,
        message: "Identifiant invalide / معرف غير صالح.",
      };
    }

    const enrollmentsCount = await prisma.enrollment.count({
      where: { academicYearId: id },
    });
    if (enrollmentsCount > 0) {
      return {
        success: false,
        error: true,
        message: `Impossible de supprimer : ${enrollmentsCount} inscription(s) liée(s) / لا يمكن الحذف: يوجد ${enrollmentsCount} تسجيل مرتبط بهذه السنة.`,
      };
    }

    const trimesters = await prisma.trimester.findMany({
      where: { academicYearId: id },
      select: { id: true },
    });
    const trimIds = trimesters.map((t) => t.id);
    const booksCount = await prisma.book.count({
      where: { trimesterId: { in: trimIds } },
    });
    if (booksCount > 0) {
      return {
        success: false,
        error: true,
        message: `Impossible de supprimer : ${booksCount} livre(s) lié(s) / لا يمكن الحذف: يوجد ${booksCount} كتاب مرتبط بهذه السنة.`,
      };
    }

    await prisma.trimester.deleteMany({
      where: { academicYearId: id },
    });
    await prisma.academicYear.delete({
      where: { id },
    });

    safeRevalidatePath("/admin/configuration");
    safeRevalidatePath("/fr/admin/configuration");
    safeRevalidatePath("/ar/admin/configuration");
    safeRevalidatePath("/list/classes");
    safeRevalidatePath("/list/students");

    return {
      success: true,
      error: false,
      message: "Année scolaire supprimée avec succès / تم حذف السنة الدراسية بنجاح.",
    };
  } catch (err: any) {
    console.error("Error deleting academic year:", err);
    return {
      success: false,
      error: true,
      message: err?.message || "Échec de suppression de l'année scolaire / فشل في حذف السنة الدراسية.",
    };
  }
}

// =================================================================
// 5. ACADEMIC LEVEL MANAGEMENT ACTIONS (OWNER-ONLY)
// =================================================================

export async function createLevelAction(
  currentState: CurrentState,
  data: LevelConfigSchema
): Promise<CurrentState> {
  try {
    const session = await getAuthSession();
    if (!session.isOwner) {
      return {
        success: false,
        error: true,
        message: "Action réservée au propriétaire / هذا الإجراء متاح لمالك المؤسسة فقط.",
      };
    }

    const validated = levelConfigSchema.safeParse(data);
    if (!validated.success) {
      return {
        success: false,
        error: true,
        message: validated.error.errors[0]?.message || "Données non valides / بيانات غير صالحة",
      };
    }

    const { name } = validated.data;
    const trimmed = name.trim();

    const existing = await prisma.level.findFirst({
      where: { name: { equals: trimmed, mode: "insensitive" } },
    });

    if (existing) {
      return {
        success: false,
        error: true,
        message: "Ce niveau scolaire existe déjà / هذا المستوى الدراسي موجود بالفعل",
      };
    }

    await prisma.level.create({
      data: { name: trimmed },
    });

    safeRevalidatePath("/admin/configuration");
    safeRevalidatePath("/fr/admin/configuration");
    safeRevalidatePath("/ar/admin/configuration");
    safeRevalidatePath("/list/classes");
    safeRevalidatePath("/list/teachers");

    return {
      success: true,
      error: false,
      message: "Niveau scolaire créé avec succès / تم إنشاء المستوى الدراسي بنجاح",
    };
  } catch (err: any) {
    console.error("Error creating level:", err);
    return {
      success: false,
      error: true,
      message: err?.message || "Échec de création du niveau / فشل في إنشاء المستوى",
    };
  }
}

export async function updateLevelAction(
  currentState: CurrentState,
  data: LevelConfigSchema
): Promise<CurrentState> {
  try {
    const session = await getAuthSession();
    if (!session.isOwner) {
      return {
        success: false,
        error: true,
        message: "Action réservée au propriétaire / هذا الإجراء متاح لمالك المؤسسة فقط.",
      };
    }

    if (!data.id) {
      return {
        success: false,
        error: true,
        message: "Identifiant du niveau manquant / معرف المستوى مفقود",
      };
    }

    const validated = levelConfigSchema.safeParse(data);
    if (!validated.success) {
      return {
        success: false,
        error: true,
        message: validated.error.errors[0]?.message || "Données non valides / بيانات غير صالحة",
      };
    }

    const { id, name } = validated.data;
    const trimmed = name.trim();

    const duplicate = await prisma.level.findFirst({
      where: {
        name: { equals: trimmed, mode: "insensitive" },
        NOT: { id: Number(id) },
      },
    });

    if (duplicate) {
      return {
        success: false,
        error: true,
        message: "Ce nom de niveau est déjà utilisé / اسم المستوى مستعمل بالفعل",
      };
    }

    await prisma.level.update({
      where: { id: Number(id) },
      data: { name: trimmed },
    });

    safeRevalidatePath("/admin/configuration");
    safeRevalidatePath("/fr/admin/configuration");
    safeRevalidatePath("/ar/admin/configuration");
    safeRevalidatePath("/list/classes");
    safeRevalidatePath("/list/teachers");

    return {
      success: true,
      error: false,
      message: "Niveau scolaire mis à jour avec succès / تم تحديث المستوى الدراسي بنجاح",
    };
  } catch (err: any) {
    console.error("Error updating level:", err);
    return {
      success: false,
      error: true,
      message: err?.message || "Échec de mise à jour du niveau / فشل في تحديث المستوى",
    };
  }
}

export async function deleteLevelAction(
  currentState: CurrentState,
  data: FormData
): Promise<CurrentState> {
  try {
    const session = await getAuthSession();
    if (!session.isOwner) {
      return {
        success: false,
        error: true,
        message: "Action réservée au propriétaire / هذا الإجراء متاح لمالك المؤسسة فقط.",
      };
    }

    const idStr = data.get("id") as string;
    if (!idStr) {
      return {
        success: false,
        error: true,
        message: "Identifiant manquant / معرف المستوى مفقود",
      };
    }

    const levelId = Number(idStr);

    // Conflict detection: verify no classes, books, or voucherSeries depend on this level
    const [classesCount, booksCount, voucherSeriesCount] = await Promise.all([
      prisma.class.count({ where: { levelId } }),
      prisma.book.count({ where: { levelId } }),
      prisma.voucherSeries.count({ where: { levelId } }),
    ]);

    if (classesCount > 0 || booksCount > 0 || voucherSeriesCount > 0) {
      const parts: string[] = [];
      const partsAr: string[] = [];
      if (classesCount > 0) {
        parts.push(`${classesCount} classe(s)`);
        partsAr.push(`${classesCount} فوج`);
      }
      if (booksCount > 0) {
        parts.push(`${booksCount} livre(s)`);
        partsAr.push(`${booksCount} كتاب`);
      }
      if (voucherSeriesCount > 0) {
        parts.push(`${voucherSeriesCount} série(s) de reçus`);
        partsAr.push(`${voucherSeriesCount} سلسلة وصولات`);
      }

      return {
        success: false,
        error: true,
        message: `Impossible de supprimer ce niveau car il est utilisé (${parts.join(", ")}) / لا يمكن حذف هذا المستوى لأنه قيد الاستخدام (${partsAr.join("، ")})`,
      };
    }

    await prisma.level.delete({
      where: { id: levelId },
    });

    safeRevalidatePath("/admin/configuration");
    safeRevalidatePath("/fr/admin/configuration");
    safeRevalidatePath("/ar/admin/configuration");
    safeRevalidatePath("/list/classes");
    safeRevalidatePath("/list/teachers");

    return {
      success: true,
      error: false,
      message: "Niveau scolaire supprimé avec succès / تم حذف المستوى الدراسي بنجاح",
    };
  } catch (err: any) {
    console.error("Error deleting level:", err);
    return {
      success: false,
      error: true,
      message: err?.message || "Échec de suppression du niveau / فشل في حذف المستوى",
    };
  }
}

// =================================================================
// 6. FORMATION LANGUAGE & FORMATION LEVEL ACTIONS (OWNER-ONLY)
// =================================================================

export async function createFormationLanguageAction(
  currentState: CurrentState,
  data: FormationLanguageConfigSchema
): Promise<CurrentState> {
  try {
    const session = await getAuthSession();
    if (!session.isOwner) {
      return {
        success: false,
        error: true,
        message: "Action réservée au propriétaire / هذا الإجراء متاح لمالك المؤسسة فقط.",
      };
    }

    const validated = formationLanguageConfigSchema.safeParse(data);
    if (!validated.success) {
      return {
        success: false,
        error: true,
        message: validated.error.errors[0]?.message || "Données non valides / بيانات غير صالحة",
      };
    }

    const trimmed = validated.data.name.trim();

    const existing = await prisma.language.findFirst({
      where: { name: { equals: trimmed, mode: "insensitive" } },
    });

    if (existing) {
      return {
        success: false,
        error: true,
        message: "Cette langue de formation existe déjà / هذه اللغة موجودة بالفعل",
      };
    }

    await prisma.language.create({
      data: { name: trimmed },
    });

    safeRevalidatePath("/admin/configuration");
    safeRevalidatePath("/fr/admin/configuration");
    safeRevalidatePath("/ar/admin/configuration");
    safeRevalidatePath("/list/formations");

    return {
      success: true,
      error: false,
      message: "Langue de formation créée avec succès / تم إنشاء لغة التكوين بنجاح",
    };
  } catch (err: any) {
    console.error("Error creating formation language:", err);
    return {
      success: false,
      error: true,
      message: err?.message || "Échec de la création de la langue / فشل في إنشاء اللغة",
    };
  }
}

export async function updateFormationLanguageAction(
  currentState: CurrentState,
  data: FormationLanguageConfigSchema
): Promise<CurrentState> {
  try {
    const session = await getAuthSession();
    if (!session.isOwner) {
      return {
        success: false,
        error: true,
        message: "Action réservée au propriétaire / هذا الإجراء متاح لمالك المؤسسة فقط.",
      };
    }

    if (!data.id) {
      return {
        success: false,
        error: true,
        message: "Identifiant de la langue manquant / معرف اللغة مفقود",
      };
    }

    const validated = formationLanguageConfigSchema.safeParse(data);
    if (!validated.success) {
      return {
        success: false,
        error: true,
        message: validated.error.errors[0]?.message || "Données non valides / بيانات غير صالحة",
      };
    }

    const { id, name } = validated.data;
    const trimmed = name.trim();

    const duplicate = await prisma.language.findFirst({
      where: {
        name: { equals: trimmed, mode: "insensitive" },
        NOT: { id: Number(id) },
      },
    });

    if (duplicate) {
      return {
        success: false,
        error: true,
        message: "Ce nom de langue est déjà utilisé / اسم اللغة مستعمل بالفعل",
      };
    }

    await prisma.language.update({
      where: { id: Number(id) },
      data: { name: trimmed },
    });

    safeRevalidatePath("/admin/configuration");
    safeRevalidatePath("/fr/admin/configuration");
    safeRevalidatePath("/ar/admin/configuration");
    safeRevalidatePath("/list/formations");

    return {
      success: true,
      error: false,
      message: "Langue de formation mise à jour avec succès / تم تحديث لغة التكوين بنجاح",
    };
  } catch (err: any) {
    console.error("Error updating formation language:", err);
    return {
      success: false,
      error: true,
      message: err?.message || "Échec de modification de la langue / فشل في تعديل اللغة",
    };
  }
}

export async function deleteFormationLanguageAction(
  currentState: CurrentState,
  data: FormData
): Promise<CurrentState> {
  try {
    const session = await getAuthSession();
    if (!session.isOwner) {
      return {
        success: false,
        error: true,
        message: "Action réservée au propriétaire / هذا الإجراء متاح لمالك المؤسسة فقط.",
      };
    }

    const idStr = data.get("id") as string;
    if (!idStr) {
      return {
        success: false,
        error: true,
        message: "Identifiant manquant / معرف اللغة مفقود",
      };
    }

    const id = Number(idStr);

    // Check if any formation level has classes attached
    const levels = await prisma.formationLevel.findMany({
      where: { languageId: id },
      include: { Class: true },
    });

    const totalClasses = levels.reduce((acc, lvl) => acc + lvl.Class.length, 0);
    if (totalClasses > 0) {
      return {
        success: false,
        error: true,
        message: `Impossible de supprimer cette langue car ${totalClasses} groupe(s) de formation y sont rattachés / لا يمكن حذف هذه اللغة لوجود (${totalClasses}) فوج تكويني مرتبط بمستوياتها`,
      };
    }

    await prisma.$transaction(async (tx) => {
      await tx.levelTest.deleteMany({
        where: { FormationLevel: { languageId: id } },
      });
      await tx.formationLevel.deleteMany({ where: { languageId: id } });
      await tx.language.delete({ where: { id } });
    });

    safeRevalidatePath("/admin/configuration");
    safeRevalidatePath("/fr/admin/configuration");
    safeRevalidatePath("/ar/admin/configuration");
    safeRevalidatePath("/list/formations");

    return {
      success: true,
      error: false,
      message: "Langue de formation supprimée avec succès / تم حذف لغة التكوين بنجاح",
    };
  } catch (err: any) {
    console.error("Error deleting formation language:", err);
    return {
      success: false,
      error: true,
      message: err?.message || "Échec de suppression de la langue / فشل في حذف اللغة",
    };
  }
}

export async function createFormationLevelConfigAction(
  currentState: CurrentState,
  data: FormationLevelConfigSchema
): Promise<CurrentState> {
  try {
    const session = await getAuthSession();
    if (!session.isOwner) {
      return {
        success: false,
        error: true,
        message: "Action réservée au propriétaire / هذا الإجراء متاح لمالك المؤسسة فقط.",
      };
    }

    const validated = formationLevelConfigSchema.safeParse(data);
    if (!validated.success) {
      return {
        success: false,
        error: true,
        message: validated.error.errors[0]?.message || "Données non valides / بيانات غير صالحة",
      };
    }

    const { languageId, name, levelNumber, lumpSumPrice } = validated.data;
    const trimmed = name.trim();

    let levelNum = levelNumber;
    if (!levelNum || levelNum < 1) {
      const highest = await prisma.formationLevel.findFirst({
        where: { languageId: Number(languageId) },
        orderBy: { levelNumber: "desc" },
      });
      levelNum = highest ? highest.levelNumber + 1 : 1;
    }

    const price = lumpSumPrice && lumpSumPrice >= 0 ? lumpSumPrice : 0;

    await prisma.formationLevel.create({
      data: {
        languageId: Number(languageId),
        levelNumber: levelNum,
        name: trimmed,
        lumpSumPrice: new Prisma.Decimal(price),
      },
    });

    safeRevalidatePath("/admin/configuration");
    safeRevalidatePath("/fr/admin/configuration");
    safeRevalidatePath("/ar/admin/configuration");
    safeRevalidatePath("/list/formations");

    return {
      success: true,
      error: false,
      message: "Niveau de formation ajouté avec succès / تم إضافة المستوى التكويني بنجاح",
    };
  } catch (err: any) {
    console.error("Error creating formation level:", err);
    return {
      success: false,
      error: true,
      message: err?.message || "Échec de l'ajout du niveau / فشل في إضافة المستوى",
    };
  }
}

export async function updateFormationLevelConfigAction(
  currentState: CurrentState,
  data: FormationLevelConfigSchema
): Promise<CurrentState> {
  try {
    const session = await getAuthSession();
    if (!session.isOwner) {
      return {
        success: false,
        error: true,
        message: "Action réservée au propriétaire / هذا الإجراء متاح لمالك المؤسسة فقط.",
      };
    }

    if (!data.id) {
      return {
        success: false,
        error: true,
        message: "Identifiant du niveau manquant / معرف المستوى مفقود",
      };
    }

    const validated = formationLevelConfigSchema.safeParse(data);
    if (!validated.success) {
      return {
        success: false,
        error: true,
        message: validated.error.errors[0]?.message || "Données non valides / بيانات غير صالحة",
      };
    }

    const { id, name, levelNumber, lumpSumPrice } = validated.data;
    const updateData: any = {
      name: name.trim(),
    };

    if (levelNumber !== undefined && levelNumber > 0) {
      updateData.levelNumber = levelNumber;
    }
    if (lumpSumPrice !== undefined && lumpSumPrice >= 0) {
      updateData.lumpSumPrice = new Prisma.Decimal(lumpSumPrice);
    }

    await prisma.formationLevel.update({
      where: { id: Number(id) },
      data: updateData,
    });

    safeRevalidatePath("/admin/configuration");
    safeRevalidatePath("/fr/admin/configuration");
    safeRevalidatePath("/ar/admin/configuration");
    safeRevalidatePath("/list/formations");

    return {
      success: true,
      error: false,
      message: "Niveau de formation mis à jour avec succès / تم تحديث المستوى التكويني بنجاح",
    };
  } catch (err: any) {
    console.error("Error updating formation level:", err);
    return {
      success: false,
      error: true,
      message: err?.message || "Échec de la mise à jour du niveau / فشل في تحديث المستوى",
    };
  }
}

export async function deleteFormationLevelConfigAction(
  currentState: CurrentState,
  data: FormData
): Promise<CurrentState> {
  try {
    const session = await getAuthSession();
    if (!session.isOwnerOrAdmin && session.role !== "admin") {
      return {
        success: false,
        error: true,
        message: "Permissions insuffisantes / صلاحية غير كافية",
      };
    }

    const idStr = data.get("id") as string;
    if (!idStr) {
      return {
        success: false,
        error: true,
        message: "Identifiant du niveau manquant / معرف المستوى مفقود",
      };
    }

    const id = Number(idStr);

    const result = await prisma.$transaction(async (tx) => {
      return await executeSafeDeleteFormationLevel(tx, id);
    });

    safeRevalidatePath("/admin/configuration");
    safeRevalidatePath("/fr/admin/configuration");
    safeRevalidatePath("/ar/admin/configuration");
    safeRevalidatePath("/list/formations");

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
      message: err?.message || "Échec de suppression du niveau / فشل في حذف المستوى",
    };
  }
}


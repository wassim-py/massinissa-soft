"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import prisma from "./prisma";
import { currentUser, getActiveBranchId, getAuthSession } from "./auth";
import { canUserAccessBranch } from "./settings";
import {
  getAlgiersDateInfo,
  getAlgiersDayBounds,
  getAlgiersTodayDateString,
} from "./algiersDate";

export type PhotocopyDatePreset = "today" | "yesterday" | "7d" | "month" | "date";
export type PhotocopyLockReason = "PREVIOUS_DAY" | "PAID_PAYROLL" | null;

export interface PhotocopyTeacherOption {
  id: string;
  name: string;
}

export interface PhotocopyTodayTeacherSummary {
  teacherId: string;
  teacherName: string;
  entriesCount: number;
  totalPages: number;
}

export interface PhotocopyEditMetadata {
  editorName: string;
  editedAt: string;
  prevTeacherId: string;
  prevTeacherName: string;
  newTeacherId: string;
  newTeacherName: string;
  prevPages: number;
  newPages: number;
}

export interface PhotocopyJournalEntryDto {
  id: number;
  teacherId: string;
  teacherName: string;
  branchId: number;
  branchName: string;
  classId: number | null;
  className: string | null;
  pages: number;
  costAmount?: number;
  date: string;
  algiersDateStr: string;
  algiersTimeStr: string;
  recordedBy: string;
  recordedByName: string;
  isEdited: boolean;
  lastEdit: PhotocopyEditMetadata | null;
  canEdit: boolean;
  canDelete: boolean;
  lockReason: PhotocopyLockReason;
}

export interface NavbarPhotocopyJournalData {
  branchId: number;
  branchName: string;
  isOwner: boolean;
  todayAlgiersDate: string;
  teachers: PhotocopyTeacherOption[];
  todaySummary: {
    entriesCount: number;
    totalPages: number;
    totalCost?: number;
    byTeacher: PhotocopyTodayTeacherSummary[];
  };
  filteredSummary: {
    entriesCount: number;
    totalPages: number;
    totalCost?: number;
  };
  entries: PhotocopyJournalEntryDto[];
}

export interface PhotocopyActionResult<T = unknown> {
  success: boolean;
  error: boolean;
  message: string;
  data?: T;
}

const getJournalInputSchema = z.object({
  branchId: z.coerce.number().int().positive().optional(),
  datePreset: z.enum(["today", "yesterday", "7d", "month", "date"]).default("today"),
  customDate: z.string().trim().optional(),
  teacherSearch: z.string().trim().max(120).optional(),
  teacherIdFilter: z.string().trim().optional(),
});

const recordPhotocopySchema = z.object({
  teacherId: z.string().trim().min(1),
  pages: z.coerce.number().int().min(1).max(50000),
  branchId: z.coerce.number().int().positive().optional(),
  classId: z.coerce.number().int().positive().nullable().optional(),
});

const updatePhotocopySchema = z.object({
  id: z.coerce.number().int().positive(),
  teacherId: z.string().trim().min(1),
  pages: z.coerce.number().int().min(1).max(50000),
  branchId: z.coerce.number().int().positive().optional(),
  classId: z.coerce.number().int().positive().nullable().optional(),
});

const deletePhotocopySchema = z.object({
  id: z.coerce.number().int().positive(),
});

function safeRevalidatePhotocopyPaths(teacherIds: string[]): void {
  const uniqueTeacherIds = Array.from(new Set(teacherIds.filter(Boolean)));
  const paths = [
    "/list/teachers",
    "/list/payroll",
    "/list/finance",
    "/list/daily-ledger",
    ...uniqueTeacherIds.map((id) => `/list/teachers/${id}`),
  ];

  try {
    for (const p of paths) {
      revalidatePath(p);
      revalidatePath(`/[locale]${p}`, "page");
      revalidatePath(`/fr${p}`);
      revalidatePath(`/ar${p}`);
    }
    revalidatePath("/");
    revalidatePath("/fr");
    revalidatePath("/ar");
    revalidatePath("/[locale]", "page");
    revalidatePath("/", "layout");
  } catch {
    // Safe fallback outside active Next.js request context (e.g., CLI verification scripts)
  }
}

function shiftAlgiersDateStr(dateStr: string, deltaDays: number): string {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!parts) return dateStr;
  const year = Number(parts[1]);
  const month = Number(parts[2]);
  const day = Number(parts[3]);
  const shifted = new Date(Date.UTC(year, month - 1, day + deltaDays));
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const d = String(shifted.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function computePresetDateRange(
  datePreset: PhotocopyDatePreset,
  customDate?: string
): {
  todayStr: string;
  todayStartUtc: Date;
  todayEndUtc: Date;
  startUtc: Date;
  endUtc: Date;
} {
  const todayStr = getAlgiersTodayDateString();
  const todayBounds = getAlgiersDayBounds(todayStr);

  if (datePreset === "yesterday") {
    const yesterdayStr = shiftAlgiersDateStr(todayStr, -1);
    const bounds = getAlgiersDayBounds(yesterdayStr);
    return {
      todayStr,
      todayStartUtc: todayBounds.startUtc,
      todayEndUtc: todayBounds.endUtc,
      startUtc: bounds.startUtc,
      endUtc: bounds.endUtc,
    };
  }

  if (datePreset === "7d") {
    const startStr = shiftAlgiersDateStr(todayStr, -6);
    const startBounds = getAlgiersDayBounds(startStr);
    return {
      todayStr,
      todayStartUtc: todayBounds.startUtc,
      todayEndUtc: todayBounds.endUtc,
      startUtc: startBounds.startUtc,
      endUtc: todayBounds.endUtc,
    };
  }

  if (datePreset === "month") {
    const monthStartStr = `${todayStr.slice(0, 7)}-01`;
    const startBounds = getAlgiersDayBounds(monthStartStr);
    return {
      todayStr,
      todayStartUtc: todayBounds.startUtc,
      todayEndUtc: todayBounds.endUtc,
      startUtc: startBounds.startUtc,
      endUtc: todayBounds.endUtc,
    };
  }

  if (
    datePreset === "date" &&
    customDate &&
    /^\d{4}-\d{2}-\d{2}$/.test(customDate)
  ) {
    const customBounds = getAlgiersDayBounds(customDate);
    return {
      todayStr,
      todayStartUtc: todayBounds.startUtc,
      todayEndUtc: todayBounds.endUtc,
      startUtc: customBounds.startUtc,
      endUtc: customBounds.endUtc,
    };
  }

  return {
    todayStr,
    todayStartUtc: todayBounds.startUtc,
    todayEndUtc: todayBounds.endUtc,
    startUtc: todayBounds.startUtc,
    endUtc: todayBounds.endUtc,
  };
}

async function resolveActorContext(requestedBranchId?: number) {
  const session = await getAuthSession();
  if (!session.isOwnerOrAdmin) {
    return {
      authorized: false as const,
      errorMessage: "Accès non autorisé / غير مصرح لك بهذا الإجراء.",
    };
  }

  const activeBranchId = await getActiveBranchId();
  let resolvedBranchId = activeBranchId;

  if (session.isOwner && requestedBranchId) {
    resolvedBranchId = requestedBranchId;
  } else if (!session.isOwner) {
    if (
      session.branchIds.length > 0 &&
      !canUserAccessBranch(session.rawRole, session.branchIds, activeBranchId)
    ) {
      return {
        authorized: false as const,
        errorMessage:
          "Accès refusé pour cette branche / غير مصرح لك بالوصول إلى هذا الفرع.",
      };
    }
    resolvedBranchId = activeBranchId;
  }

  return {
    authorized: true as const,
    session,
    branchId: resolvedBranchId,
  };
}

function assertBranchAccessForMutation(
  session: Awaited<ReturnType<typeof getAuthSession>>,
  activeBranchId: number,
  targetBranchId: number
): boolean {
  if (session.isOwner) return true;
  if (session.branchIds.length > 0) {
    return canUserAccessBranch(session.rawRole, session.branchIds, targetBranchId);
  }
  return targetBranchId === activeBranchId;
}

async function resolveActorDisplayName(
  session: Awaited<ReturnType<typeof getAuthSession>>
): Promise<{ actorId: string; actorName: string }> {
  const actorId = session.userId || session.rawRole || "admin";

  if (session.userId) {
    const profile = await prisma.userProfile.findUnique({
      where: { id: session.userId },
      select: { name: true, username: true },
    });
    if (profile?.name) {
      return { actorId, actorName: profile.name };
    }
    if (profile?.username) {
      return { actorId, actorName: profile.username };
    }

    try {
      const clerkUser = await currentUser({ treatPendingAsSignedOut: false });
      if (clerkUser && clerkUser.id === session.userId) {
        const fullName = clerkUser.lastName
          ? `${clerkUser.lastName} ${clerkUser.firstName || ""}`.trim()
          : clerkUser.firstName || clerkUser.username;
        if (fullName) {
          return { actorId, actorName: fullName };
        }
      }
    } catch {
      // Ignore Clerk lookup failures outside Next.js request context
    }
  }

  return {
    actorId,
    actorName: session.isOwner ? "Propriétaire" : "Responsable",
  };
}

async function resolveStaffNameMap(
  userIds: string[],
  currentSession: Awaited<ReturnType<typeof getAuthSession>>
): Promise<Map<string, string>> {
  const nameMap = new Map<string, string>();
  const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));
  if (uniqueIds.length === 0) return nameMap;

  const profiles = await prisma.userProfile.findMany({
    where: { id: { in: uniqueIds } },
    select: { id: true, name: true, username: true },
  });

  for (const profile of profiles) {
    nameMap.set(profile.id, profile.name || profile.username || profile.id);
  }

  if (currentSession.userId && uniqueIds.includes(currentSession.userId) && !nameMap.has(currentSession.userId)) {
    const resolved = await resolveActorDisplayName(currentSession);
    nameMap.set(currentSession.userId, resolved.actorName);
  }

  return nameMap;
}

function formatFallbackStaffLabel(rawRecordedBy: string): string {
  const trimmed = (rawRecordedBy || "").trim();
  if (!trimmed) return "Admin";
  const lower = trimmed.toLowerCase();
  if (lower === "admin" || lower === "owner") return "Admin";
  if (lower === "branch_admin" || lower === "branch") return "Admin siège";
  if (trimmed.startsWith("user_") || trimmed.startsWith("usr_")) {
    return "Admin";
  }
  return trimmed;
}

async function findPaidPayrollLockRangesByTeacher(
  teacherIds: string[],
  minDate: Date,
  maxDate: Date
): Promise<Map<string, Array<{ startMs: number; endMs: number }>>> {
  const map = new Map<string, Array<{ startMs: number; endMs: number }>>();
  const uniqueIds = Array.from(new Set(teacherIds.filter(Boolean)));
  if (uniqueIds.length === 0) return map;

  const paidSlips = await prisma.payslip.findMany({
    where: {
      personType: "TEACHER",
      personId: { in: uniqueIds },
      PayrollRun: {
        status: "PAID",
        periodStart: { lte: maxDate },
        periodEnd: { gte: minDate },
      },
    },
    select: {
      personId: true,
      PayrollRun: {
        select: {
          periodStart: true,
          periodEnd: true,
        },
      },
    },
  });

  for (const slip of paidSlips) {
    const existing = map.get(slip.personId) || [];
    existing.push({
      startMs: slip.PayrollRun.periodStart.getTime(),
      endMs: slip.PayrollRun.periodEnd.getTime(),
    });
    map.set(slip.personId, existing);
  }

  return map;
}

function hasPaidPayrollCoveringDate(
  paidRangesMap: Map<string, Array<{ startMs: number; endMs: number }>>,
  teacherId: string,
  chargeDate: Date
): boolean {
  const ranges = paidRangesMap.get(teacherId);
  if (!ranges || ranges.length === 0) return false;
  const ts = chargeDate.getTime();
  return ranges.some((r) => ts >= r.startMs && ts <= r.endMs);
}

function parseJsonObject(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function fetchLatestPhotocopyEdits(
  chargeIds: number[]
): Promise<Map<number, PhotocopyEditMetadata>> {
  const result = new Map<number, PhotocopyEditMetadata>();
  if (chargeIds.length === 0) return result;

  const logs = await prisma.auditLog.findMany({
    where: {
      entityType: "PhotocopyCharge",
      action: "PHOTOCOPY_UPDATED",
      entityId: { in: chargeIds.map(String) },
    },
    orderBy: [{ timestamp: "desc" }, { id: "desc" }],
    select: {
      entityId: true,
      userName: true,
      oldValue: true,
      newValue: true,
      timestamp: true,
    },
  });

  for (const log of logs) {
    const numericId = Number(log.entityId);
    if (!Number.isFinite(numericId) || result.has(numericId)) continue;

    const oldObj = parseJsonObject(log.oldValue);
    const newObj = parseJsonObject(log.newValue);
    if (!oldObj || !newObj) continue;

    result.set(numericId, {
      editorName: log.userName || "Admin",
      editedAt: log.timestamp.toISOString(),
      prevTeacherId: String(oldObj.teacherId || ""),
      prevTeacherName: String(oldObj.teacherName || ""),
      newTeacherId: String(newObj.teacherId || ""),
      newTeacherName: String(newObj.teacherName || ""),
      prevPages: Number(oldObj.pages || 0),
      newPages: Number(newObj.pages || 0),
    });
  }

  return result;
}

function buildPhotocopyDto(params: {
  charge: {
    id: number;
    teacherId: string;
    branchId: number;
    classId: number | null;
    pages: number;
    costAmount: Prisma.Decimal | number;
    date: Date;
    recordedBy: string;
    Teacher: { name: string };
    Branch: { name: string };
    class?: { name: string } | null;
  };
  isOwner: boolean;
  todayAlgiersStr: string;
  staffNameMap: Map<string, string>;
  editMap: Map<number, PhotocopyEditMetadata>;
  paidPayrollMap: Map<string, Array<{ startMs: number; endMs: number }>>;
}): PhotocopyJournalEntryDto {
  const { charge, isOwner, todayAlgiersStr, staffNameMap, editMap, paidPayrollMap } = params;
  const algiersInfo = getAlgiersDateInfo(charge.date);
  const isSameDay = algiersInfo.dateStr === todayAlgiersStr;
  const isLockedByPayroll = hasPaidPayrollCoveringDate(
    paidPayrollMap,
    charge.teacherId,
    charge.date
  );

  let lockReason: PhotocopyLockReason = null;
  if (isLockedByPayroll) {
    lockReason = "PAID_PAYROLL";
  } else if (!isOwner && !isSameDay) {
    lockReason = "PREVIOUS_DAY";
  }

  const canMutate = lockReason === null;
  const lastEdit = editMap.get(charge.id) ?? null;

  return {
    id: charge.id,
    teacherId: charge.teacherId,
    teacherName: charge.Teacher.name,
    branchId: charge.branchId,
    branchName: charge.Branch.name,
    classId: charge.classId ?? null,
    className: charge.class?.name ?? null,
    pages: charge.pages,
    // Financial privacy invariant: omit costAmount entirely for non-owners
    ...(isOwner ? { costAmount: Number(charge.costAmount) } : {}),
    date: charge.date.toISOString(),
    algiersDateStr: algiersInfo.dateStr,
    algiersTimeStr: algiersInfo.timeStr,
    recordedBy: charge.recordedBy,
    recordedByName:
      staffNameMap.get(charge.recordedBy) || formatFallbackStaffLabel(charge.recordedBy),
    isEdited: lastEdit !== null,
    lastEdit,
    canEdit: canMutate,
    canDelete: canMutate,
    lockReason,
  };
}

/**
 * Loads active-branch photocopy journal entries, today's summary strip data,
 * and active teacher options for the Navbar Photocopy Journal drawer.
 * Strictly scopes data to the active branch for branch admins and omits all cost data for non-owners.
 */
export async function getNavbarPhotocopyJournalAction(rawInput?: {
  branchId?: number;
  datePreset?: PhotocopyDatePreset;
  customDate?: string;
  teacherSearch?: string;
  teacherIdFilter?: string;
}): Promise<PhotocopyActionResult<NavbarPhotocopyJournalData>> {
  try {
    const parsed = getJournalInputSchema.safeParse(rawInput ?? {});
    if (!parsed.success) {
      return {
        success: false,
        error: true,
        message: "Paramètres de journal invalides / معلمات السجل غير صالحة.",
      };
    }

    const actorCtx = await resolveActorContext(parsed.data.branchId);
    if (!actorCtx.authorized) {
      return { success: false, error: true, message: actorCtx.errorMessage };
    }

    const { session, branchId } = actorCtx;
    // Branch admins may only inspect today's entries in Africa/Algiers (no historical diving)
    const effectivePreset: PhotocopyDatePreset = session.isOwner
      ? parsed.data.datePreset
      : "today";
    const { todayStr, todayStartUtc, todayEndUtc, startUtc, endUtc } = computePresetDateRange(
      effectivePreset,
      session.isOwner ? parsed.data.customDate : undefined
    );

    const trimmedSearch = parsed.data.teacherSearch?.trim() || "";
    const exactTeacherId = parsed.data.teacherIdFilter?.trim() || "";

    const filteredWhere: Prisma.PhotocopyChargeWhereInput = {
      branchId,
      date: { gte: startUtc, lte: endUtc },
      ...(exactTeacherId ? { teacherId: exactTeacherId } : {}),
      ...(trimmedSearch
        ? {
            Teacher: {
              name: { contains: trimmedSearch, mode: "insensitive" },
            },
          }
        : {}),
    };

    const [branchRecord, teachers, todayCharges, filteredCharges] = await Promise.all([
      prisma.branch.findUnique({
        where: { id: branchId },
        select: { id: true, name: true },
      }),
      prisma.teacher.findMany({
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      prisma.photocopyCharge.findMany({
        where: {
          branchId,
          date: { gte: todayStartUtc, lte: todayEndUtc },
        },
        select: {
          teacherId: true,
          pages: true,
          ...(session.isOwner ? { costAmount: true } : {}),
          Teacher: { select: { name: true } },
        },
      }),
      prisma.photocopyCharge.findMany({
        where: filteredWhere,
        include: {
          Teacher: { select: { name: true } },
          Branch: { select: { name: true } },
          class: { select: { name: true } },
        },
        orderBy: [{ date: "desc" }, { id: "desc" }],
        take: 250,
      }),
    ]);

    const todayTeacherMap = new Map<string, PhotocopyTodayTeacherSummary>();
    let todayTotalPages = 0;
    let todayTotalCost = 0;

    for (const item of todayCharges) {
      todayTotalPages += item.pages;
      if (session.isOwner && "costAmount" in item && item.costAmount !== undefined) {
        todayTotalCost += Number(item.costAmount);
      }
      const existing = todayTeacherMap.get(item.teacherId);
      if (existing) {
        existing.entriesCount += 1;
        existing.totalPages += item.pages;
      } else {
        todayTeacherMap.set(item.teacherId, {
          teacherId: item.teacherId,
          teacherName: item.Teacher.name,
          entriesCount: 1,
          totalPages: item.pages,
        });
      }
    }

    const todayByTeacher = Array.from(todayTeacherMap.values()).sort(
      (a, b) => b.totalPages - a.totalPages || a.teacherName.localeCompare(b.teacherName)
    );

    const filteredTeacherIds = filteredCharges.map((c) => c.teacherId);
    const filteredChargeIds = filteredCharges.map((c) => c.id);
    const minFilteredDate =
      filteredCharges.length > 0
        ? new Date(Math.min(...filteredCharges.map((c) => c.date.getTime())))
        : startUtc;
    const maxFilteredDate =
      filteredCharges.length > 0
        ? new Date(Math.max(...filteredCharges.map((c) => c.date.getTime())))
        : endUtc;

    const [staffNameMap, editMap, paidPayrollMap] = await Promise.all([
      resolveStaffNameMap(
        filteredCharges.map((c) => c.recordedBy),
        session
      ),
      fetchLatestPhotocopyEdits(filteredChargeIds),
      findPaidPayrollLockRangesByTeacher(filteredTeacherIds, minFilteredDate, maxFilteredDate),
    ]);

    const entryDtos = filteredCharges.map((charge) =>
      buildPhotocopyDto({
        charge,
        isOwner: session.isOwner,
        todayAlgiersStr: todayStr,
        staffNameMap,
        editMap,
        paidPayrollMap,
      })
    );

    const filteredTotalPages = entryDtos.reduce((sum, e) => sum + e.pages, 0);
    const filteredTotalCost = session.isOwner
      ? filteredCharges.reduce((sum, c) => sum + Number(c.costAmount), 0)
      : 0;

    return {
      success: true,
      error: false,
      message: "OK",
      data: {
        branchId,
        branchName: branchRecord?.name || `Siège #${branchId}`,
        isOwner: session.isOwner,
        todayAlgiersDate: todayStr,
        teachers,
        todaySummary: {
          entriesCount: todayCharges.length,
          totalPages: todayTotalPages,
          ...(session.isOwner ? { totalCost: Math.round(todayTotalCost * 100) / 100 } : {}),
          byTeacher: todayByTeacher,
        },
        filteredSummary: {
          entriesCount: entryDtos.length,
          totalPages: filteredTotalPages,
          ...(session.isOwner ? { totalCost: Math.round(filteredTotalCost * 100) / 100 } : {}),
        },
        entries: entryDtos,
      },
    };
  } catch (error: unknown) {
    console.error("Error in getNavbarPhotocopyJournalAction:", error);
    return {
      success: false,
      error: true,
      message: "Échec du chargement du journal / فشل تحميل سجل النسخ.",
    };
  }
}

/**
 * Records a new photocopy charge for a teacher.
 * Server-side computes costAmount from Teacher.photocopyRatePerPage and locks non-owners to their active branch.
 */
export async function recordPhotocopyJournalEntryAction(input: {
  teacherId: string;
  pages: number;
  branchId?: number;
  classId?: number | null;
}): Promise<PhotocopyActionResult<PhotocopyJournalEntryDto>> {
  try {
    const parsed = recordPhotocopySchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: true,
        message: "يرجى إدخال بيانات صالحة (الأستاذ وعدد الصفحات 1 على الأقل).",
      };
    }

    const actorCtx = await resolveActorContext(parsed.data.branchId);
    if (!actorCtx.authorized) {
      return { success: false, error: true, message: actorCtx.errorMessage };
    }

    const { session, branchId } = actorCtx;
    const { teacherId, pages, classId } = parsed.data;
    const resolvedClassId = session.isOwner && classId ? classId : null;

    const [teacher, actorInfo] = await Promise.all([
      prisma.teacher.findUnique({
        where: { id: teacherId },
        select: { id: true, name: true, photocopyRatePerPage: true },
      }),
      resolveActorDisplayName(session),
    ]);

    if (!teacher) {
      return {
        success: false,
        error: true,
        message: "Enseignant introuvable / لم يتم العثور على الأستاذ المطلوب.",
      };
    }

    const rate = teacher.photocopyRatePerPage ? Number(teacher.photocopyRatePerPage) : 0;
    const costAmount = pages * rate;

    const created = await prisma.$transaction(async (tx) => {
      const charge = await tx.photocopyCharge.create({
        data: {
          teacherId,
          branchId,
          classId: resolvedClassId,
          pages,
          costAmount: new Prisma.Decimal(costAmount),
          date: new Date(),
          recordedBy: actorInfo.actorId,
        },
        include: {
          Teacher: { select: { name: true } },
          Branch: { select: { name: true } },
          class: { select: { name: true } },
        },
      });

      await tx.auditLog.create({
        data: {
          entityType: "PhotocopyCharge",
          entityId: String(charge.id),
          action: "PHOTOCOPY_RECORDED",
          branchId: charge.branchId,
          userId: actorInfo.actorId,
          userName: actorInfo.actorName,
          newValue: JSON.stringify({
            teacherId: charge.teacherId,
            teacherName: charge.Teacher.name,
            branchId: charge.branchId,
            classId: charge.classId,
            pages: charge.pages,
            costAmount,
          }),
          details: `${charge.Teacher.name} · ${charge.pages} p.`,
        },
      });

      return charge;
    });

    safeRevalidatePhotocopyPaths([teacherId]);

    const todayStr = getAlgiersTodayDateString();
    const staffNameMap = new Map([[actorInfo.actorId, actorInfo.actorName]]);
    const dto = buildPhotocopyDto({
      charge: created,
      isOwner: session.isOwner,
      todayAlgiersStr: todayStr,
      staffNameMap,
      editMap: new Map(),
      paidPayrollMap: new Map(),
    });

    return {
      success: true,
      error: false,
      message: `${teacher.name} : ${pages} p.`,
      data: dto,
    };
  } catch (error: unknown) {
    console.error("Error in recordPhotocopyJournalEntryAction:", error);
    return {
      success: false,
      error: true,
      message: "Échec de l'enregistrement / فشل تسجيل عملية النسخ.",
    };
  }
}

/**
 * Updates an existing photocopy entry.
 * Branch admins may only edit same-day (Africa/Algiers) entries in their branch.
 * Rejects any entry covered by a PAID teacher payslip and records an AuditLog diff.
 */
export async function updatePhotocopyJournalEntryAction(input: {
  id: number;
  teacherId: string;
  pages: number;
  branchId?: number;
  classId?: number | null;
}): Promise<PhotocopyActionResult<PhotocopyJournalEntryDto>> {
  try {
    const parsed = updatePhotocopySchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: true,
        message: "Données de modification invalides / بيانات التعديل غير صالحة.",
      };
    }

    const session = await getAuthSession();
    if (!session.isOwnerOrAdmin) {
      return {
        success: false,
        error: true,
        message: "Accès non autorisé / غير مصرح لك بهذا الإجراء.",
      };
    }

    const activeBranchId = await getActiveBranchId();
    const existingCharge = await prisma.photocopyCharge.findUnique({
      where: { id: parsed.data.id },
      include: {
        Teacher: { select: { id: true, name: true } },
        Branch: { select: { id: true, name: true } },
        class: { select: { id: true, name: true } },
      },
    });

    if (!existingCharge) {
      return {
        success: false,
        error: true,
        message: "Enregistrement introuvable / لم يتم العثور على سجل النسخ المطلوب.",
      };
    }

    if (!assertBranchAccessForMutation(session, activeBranchId, existingCharge.branchId)) {
      return {
        success: false,
        error: true,
        message: "Accès refusé pour cette branche / لا يمكنك تعديل سجل لفرع آخر.",
      };
    }

    const todayStr = getAlgiersTodayDateString();
    const entryDateStr = getAlgiersDateInfo(existingCharge.date).dateStr;
    if (!session.isOwner && entryDateStr !== todayStr) {
      return {
        success: false,
        error: true,
        message:
          "Les saisies des jours précédents sont verrouillées / تعديل سجلات الأيام السابقة متاح للمالك فقط.",
      };
    }

    const targetTeacherId = parsed.data.teacherId;
    const paidPayrollMap = await findPaidPayrollLockRangesByTeacher(
      [existingCharge.teacherId, targetTeacherId],
      existingCharge.date,
      existingCharge.date
    );

    if (
      hasPaidPayrollCoveringDate(paidPayrollMap, existingCharge.teacherId, existingCharge.date) ||
      hasPaidPayrollCoveringDate(paidPayrollMap, targetTeacherId, existingCharge.date)
    ) {
      return {
        success: false,
        error: true,
        message:
          "Action bloquée : une paie payée couvre cette période / السجل مشمول بكشف راتب مدفوع.",
      };
    }

    const [targetTeacher, actorInfo] = await Promise.all([
      prisma.teacher.findUnique({
        where: { id: targetTeacherId },
        select: { id: true, name: true, photocopyRatePerPage: true },
      }),
      resolveActorDisplayName(session),
    ]);

    if (!targetTeacher) {
      return {
        success: false,
        error: true,
        message: "Enseignant introuvable / لم يتم العثور على الأستاذ المطلوب.",
      };
    }

    const rate = targetTeacher.photocopyRatePerPage
      ? Number(targetTeacher.photocopyRatePerPage)
      : 0;
    const newCostAmount = parsed.data.pages * rate;
    const nextBranchId =
      session.isOwner && parsed.data.branchId ? parsed.data.branchId : existingCharge.branchId;
    const nextClassId =
      session.isOwner && parsed.data.classId !== undefined
        ? parsed.data.classId
        : undefined;

    const { updatedCharge, auditLog } = await prisma.$transaction(async (tx) => {
      const updated = await tx.photocopyCharge.update({
        where: { id: existingCharge.id },
        data: {
          teacherId: targetTeacherId,
          pages: parsed.data.pages,
          costAmount: new Prisma.Decimal(newCostAmount),
          branchId: nextBranchId,
          ...(nextClassId !== undefined ? { classId: nextClassId } : {}),
        },
        include: {
          Teacher: { select: { name: true } },
          Branch: { select: { name: true } },
          class: { select: { name: true } },
        },
      });

      const log = await tx.auditLog.create({
        data: {
          entityType: "PhotocopyCharge",
          entityId: String(existingCharge.id),
          action: "PHOTOCOPY_UPDATED",
          branchId: updated.branchId,
          userId: actorInfo.actorId,
          userName: actorInfo.actorName,
          oldValue: JSON.stringify({
            teacherId: existingCharge.teacherId,
            teacherName: existingCharge.Teacher.name,
            branchId: existingCharge.branchId,
            classId: existingCharge.classId,
            pages: existingCharge.pages,
            costAmount: Number(existingCharge.costAmount),
          }),
          newValue: JSON.stringify({
            teacherId: updated.teacherId,
            teacherName: updated.Teacher.name,
            branchId: updated.branchId,
            classId: updated.classId,
            pages: updated.pages,
            costAmount: newCostAmount,
          }),
          details: `${existingCharge.Teacher.name} (${existingCharge.pages} p.) -> ${updated.Teacher.name} (${updated.pages} p.)`,
        },
      });

      return { updatedCharge: updated, auditLog: log };
    });

    safeRevalidatePhotocopyPaths([existingCharge.teacherId, targetTeacherId]);

    const staffNameMap = await resolveStaffNameMap([updatedCharge.recordedBy], session);
    const editMap = new Map<number, PhotocopyEditMetadata>([
      [
        updatedCharge.id,
        {
          editorName: actorInfo.actorName,
          editedAt: auditLog.timestamp.toISOString(),
          prevTeacherId: existingCharge.teacherId,
          prevTeacherName: existingCharge.Teacher.name,
          newTeacherId: updatedCharge.teacherId,
          newTeacherName: updatedCharge.Teacher.name,
          prevPages: existingCharge.pages,
          newPages: updatedCharge.pages,
        },
      ],
    ]);

    const dto = buildPhotocopyDto({
      charge: updatedCharge,
      isOwner: session.isOwner,
      todayAlgiersStr: todayStr,
      staffNameMap,
      editMap,
      paidPayrollMap: new Map(),
    });

    return {
      success: true,
      error: false,
      message: `${targetTeacher.name} : ${parsed.data.pages} p.`,
      data: dto,
    };
  } catch (error: unknown) {
    console.error("Error in updatePhotocopyJournalEntryAction:", error);
    return {
      success: false,
      error: true,
      message: "Échec de la mise à jour / فشل تعديل سجل النسخ.",
    };
  }
}

/**
 * Deletes an erroneous photocopy entry.
 * Branch admins may only delete same-day (Africa/Algiers) entries in their branch.
 * Rejects any entry covered by a PAID teacher payslip and preserves a snapshot in AuditLog.
 */
export async function deletePhotocopyJournalEntryAction(input: {
  id: number;
}): Promise<PhotocopyActionResult<{ id: number }>> {
  try {
    const parsed = deletePhotocopySchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: true,
        message: "Identifiant invalide / معرف غير صالح.",
      };
    }

    const session = await getAuthSession();
    if (!session.isOwnerOrAdmin) {
      return {
        success: false,
        error: true,
        message: "Accès non autorisé / غير مصرح لك بهذا الإجراء.",
      };
    }

    const activeBranchId = await getActiveBranchId();
    const existingCharge = await prisma.photocopyCharge.findUnique({
      where: { id: parsed.data.id },
      include: {
        Teacher: { select: { name: true } },
      },
    });

    if (!existingCharge) {
      return {
        success: false,
        error: true,
        message: "Enregistrement introuvable / لم يتم العثور على سجل النسخ المطلوب.",
      };
    }

    if (!assertBranchAccessForMutation(session, activeBranchId, existingCharge.branchId)) {
      return {
        success: false,
        error: true,
        message: "Accès refusé pour cette branche / لا يمكنك حذف سجل لفرع آخر.",
      };
    }

    const todayStr = getAlgiersTodayDateString();
    const entryDateStr = getAlgiersDateInfo(existingCharge.date).dateStr;
    if (!session.isOwner && entryDateStr !== todayStr) {
      return {
        success: false,
        error: true,
        message:
          "Les saisies des jours précédents sont verrouillées / حذف سجلات الأيام السابقة متاح للمالك فقط.",
      };
    }

    const paidPayrollMap = await findPaidPayrollLockRangesByTeacher(
      [existingCharge.teacherId],
      existingCharge.date,
      existingCharge.date
    );

    if (
      hasPaidPayrollCoveringDate(paidPayrollMap, existingCharge.teacherId, existingCharge.date)
    ) {
      return {
        success: false,
        error: true,
        message:
          "Action bloquée : une paie payée couvre cette période / السجل مشمول بكشف راتب مدفوع.",
      };
    }

    const actorInfo = await resolveActorDisplayName(session);

    await prisma.$transaction(async (tx) => {
      await tx.photocopyCharge.delete({
        where: { id: existingCharge.id },
      });

      await tx.auditLog.create({
        data: {
          entityType: "PhotocopyCharge",
          entityId: String(existingCharge.id),
          action: "PHOTOCOPY_DELETED",
          branchId: existingCharge.branchId,
          userId: actorInfo.actorId,
          userName: actorInfo.actorName,
          oldValue: JSON.stringify({
            teacherId: existingCharge.teacherId,
            teacherName: existingCharge.Teacher.name,
            branchId: existingCharge.branchId,
            classId: existingCharge.classId,
            pages: existingCharge.pages,
            costAmount: Number(existingCharge.costAmount),
            date: existingCharge.date.toISOString(),
            recordedBy: existingCharge.recordedBy,
          }),
          details: `${existingCharge.Teacher.name} · ${existingCharge.pages} p.`,
        },
      });
    });

    safeRevalidatePhotocopyPaths([existingCharge.teacherId]);

    return {
      success: true,
      error: false,
      message: `${existingCharge.Teacher.name} · ${existingCharge.pages} p.`,
      data: { id: existingCharge.id },
    };
  } catch (error: unknown) {
    console.error("Error in deletePhotocopyJournalEntryAction:", error);
    return {
      success: false,
      error: true,
      message: "Échec de la suppression / فشل حذف سجل النسخ.",
    };
  }
}

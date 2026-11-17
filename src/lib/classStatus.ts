import { getAlgiersWeekBounds } from "./utils";

export interface ClassStatusLike {
  isCompleted?: boolean | null;
  completedAt?: Date | string | null;
  isPaused?: boolean | null;
  pausedAt?: Date | string | null;
}

export type ClassFilterStatus = "active" | "inactive" | "all";

/**
 * Standard Prisma `where` clause for active (neither completed nor paused/closed) groups.
 */
export const ACTIVE_CLASS_WHERE = {
  isCompleted: false,
  isPaused: false,
};

/**
 * Standard Prisma `where` clause for inactive (closed, paused, or completed) groups.
 */
export const INACTIVE_CLASS_WHERE = {
  OR: [{ isCompleted: true }, { isPaused: true }] as Array<{ isCompleted: boolean } | { isPaused: boolean }>,
};

/**
 * Normalizes a URL searchParam value into a canonical ClassFilterStatus ("active" | "inactive" | "all").
 * Defaults to "active" so active groups are shown by default while closed/paused groups remain one click away.
 */
export function normalizeClassFilterStatus(rawStatus?: string | null): ClassFilterStatus {
  if (!rawStatus) return "active";
  const normalized = rawStatus.toLowerCase().trim();
  if (normalized === "inactive" || normalized === "paused" || normalized === "closed") {
    return "inactive";
  }
  if (normalized === "all") {
    return "all";
  }
  return "active";
}

/**
 * Returns true if the group is closed, paused, or completed.
 */
export function isClassInactive(cls?: ClassStatusLike | null): boolean {
  if (!cls) return false;
  return Boolean(cls.isCompleted || cls.isPaused);
}

/**
 * Resolves the effective timestamp when a group became inactive (paused/closed or completed).
 * If both timestamps are present, returns the earlier valid timestamp.
 * Returns null if the group is currently active or has no recorded timestamp.
 */
export function getClassInactiveAt(cls?: ClassStatusLike | null): Date | null {
  if (!isClassInactive(cls)) return null;

  const candidates: Date[] = [];

  if (cls?.isPaused && cls.pausedAt) {
    const d = new Date(cls.pausedAt);
    if (!isNaN(d.getTime())) candidates.push(d);
  }
  if (cls?.isCompleted && cls.completedAt) {
    const d = new Date(cls.completedAt);
    if (!isNaN(d.getTime())) candidates.push(d);
  }

  // Fallback if one flag is true and only the other timestamp was populated
  if (candidates.length === 0) {
    if (cls?.pausedAt) {
      const d = new Date(cls.pausedAt);
      if (!isNaN(d.getTime())) candidates.push(d);
    }
    if (cls?.completedAt) {
      const d = new Date(cls.completedAt);
      if (!isNaN(d.getTime())) candidates.push(d);
    }
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => a.getTime() - b.getTime());
  return candidates[0];
}

/**
 * Determines whether a lesson instance (ending at `lessonEndsAt`) should be displayed in the timetable.
 *
 * Rules:
 * 1. If the group is active (`!isClassInactive(cls)`), always returns true.
 * 2. If the group is closed/paused and has an `inactiveAt` timestamp:
 *    - Returns true ONLY if the lesson ended at or before `inactiveAt` (`lessonEndsAt <= inactiveAt`).
 *    - This hides all upcoming slots in the current and future weeks immediately (freeing the timetable),
 *      while preserving historical weeks when the user navigates backward in the timetable.
 * 3. If the group is closed/paused without a stored timestamp (legacy completed rows):
 *    - Uses `fallbackCutoff` (defaults to the start of the current Algiers week) so past weeks remain
 *      visible while the current and future weeks are hidden.
 */
export function isLessonVisibleForClassStatus(
  lessonEndsAt: Date | string,
  cls?: ClassStatusLike | null,
  fallbackCutoff?: Date
): boolean {
  if (!isClassInactive(cls)) return true;

  const endDate = new Date(lessonEndsAt);
  if (isNaN(endDate.getTime())) return false;

  const inactiveAt = getClassInactiveAt(cls);
  if (inactiveAt) {
    return endDate.getTime() <= inactiveAt.getTime();
  }

  const cutoff = fallbackCutoff ?? getAlgiersWeekBounds(0).startOfWeek;
  return endDate.getTime() < cutoff.getTime();
}

import * as React from "react";
import { unstable_cache, updateTag, revalidateTag } from "next/cache";
import prisma from "./prisma";

/**
 * Per-request memoization helper using React.cache when running in Next.js RSC/Server Actions,
 * falling back cleanly to a passthrough in standalone Node/tsx CLI scripts.
 */
export function requestCache<T extends (...args: any[]) => any>(fn: T): T {
  const cacheFn = (React as any).cache;
  return typeof cacheFn === "function" ? cacheFn(fn) : fn;
}

export const REF_CACHE_TAGS = {
  branches: "ref:branches",
  levels: "ref:levels",
  languages: "ref:languages",
  academicYear: "ref:academic-year",
  trimesters: "ref:trimesters",
  settings: "ref:settings",
} as const;

export type RefCacheTag = (typeof REF_CACHE_TAGS)[keyof typeof REF_CACHE_TAGS];

/**
 * Immediately expires a tagged reference cache entry in Server Actions (Next.js 16 `updateTag`),
 * falling back to `revalidateTag(tag, "max")` and safely ignoring errors outside Next.js request contexts.
 */
export function invalidateReferenceTag(tag: RefCacheTag): void {
  try {
    updateTag(tag);
  } catch {
    try {
      revalidateTag(tag, "max");
    } catch {
      // Outside Next.js request context (CLI scripts / unit tests)
    }
  }
}

async function runWithOptionalCache<T>(
  loader: () => Promise<T>,
  keyParts: string[],
  tag: RefCacheTag,
  revalidateSeconds = 300
): Promise<T> {
  try {
    const cachedLoader = unstable_cache(loader, keyParts, {
      revalidate: revalidateSeconds,
      tags: [tag],
    });
    return await cachedLoader();
  } catch {
    // Fallback outside Next.js incremental cache context (e.g. CLI verification scripts)
    return await loader();
  }
}

export type CachedBranch = {
  id: number;
  name: string;
  address: string;
};

export const getCachedBranches = requestCache(async (): Promise<CachedBranch[]> => {
  return runWithOptionalCache(
    async () => {
      try {
        return await prisma.branch.findMany({
          select: { id: true, name: true, address: true },
          orderBy: { id: "asc" },
        });
      } catch {
        return [
          { id: 1, name: "ECOLE", address: "Constantine - Centre, Algérie" },
          { id: 2, name: "ANNEX", address: "Constantine - Annex, Algérie" },
          { id: 3, name: "AMPHI", address: "Constantine - Amphi, Algérie" },
        ];
      }
    },
    ["ref-branches-v1"],
    REF_CACHE_TAGS.branches,
    300
  );
});

export type CachedLevel = {
  id: number;
  name: string;
};

export const getCachedLevels = requestCache(async (): Promise<CachedLevel[]> => {
  return runWithOptionalCache(
    async () =>
      prisma.level.findMany({
        select: { id: true, name: true },
        orderBy: { id: "asc" },
      }),
    ["ref-levels-v1"],
    REF_CACHE_TAGS.levels,
    300
  );
});

export type CachedLanguage = {
  id: number;
  name: string;
};

export const getCachedLanguages = requestCache(async (): Promise<CachedLanguage[]> => {
  return runWithOptionalCache(
    async () =>
      prisma.language.findMany({
        select: { id: true, name: true },
        orderBy: { id: "asc" },
      }),
    ["ref-languages-v1"],
    REF_CACHE_TAGS.languages,
    300
  );
});

function reviveDates<T extends Record<string, any> | null>(obj: T): T {
  if (!obj || typeof obj !== "object") return obj;
  const clone: Record<string, any> = { ...obj };
  for (const key of ["startDate", "endDate", "createdAt", "updatedAt"]) {
    if (clone[key] && !(clone[key] instanceof Date)) {
      const parsed = new Date(clone[key]);
      if (!isNaN(parsed.getTime())) {
        clone[key] = parsed;
      }
    }
  }
  if (clone.academicYear && typeof clone.academicYear === "object") {
    clone.academicYear = reviveDates(clone.academicYear);
  }
  return clone as T;
}

export const getCachedActiveAcademicYear = requestCache(async () => {
  const raw = await runWithOptionalCache(
    async () =>
      prisma.academicYear.findFirst({
        orderBy: { startDate: "desc" },
      }),
    ["ref-active-academic-year-v1"],
    REF_CACHE_TAGS.academicYear,
    300
  );
  return reviveDates(raw);
});

export const getCachedActiveTrimester = requestCache(async () => {
  const raw = await runWithOptionalCache(
    async () => {
      try {
        return await prisma.trimester.findFirst({
          where: { status: "active" },
          include: { academicYear: true },
        });
      } catch {
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
    },
    ["ref-active-trimester-v1"],
    REF_CACHE_TAGS.trimesters,
    300
  );
  return reviveDates(raw);
});

export const getCachedFixedInscriptionFee = requestCache(async (): Promise<number> => {
  return runWithOptionalCache(
    async () => {
      try {
        const setting = await prisma.setting.findUnique({
          where: { id: "DEFAULT_INSCRIPTION_FEE" },
        });
        return setting?.value ? Number(setting.value) : 1000;
      } catch {
        return 1000;
      }
    },
    ["ref-fixed-inscription-fee-v1"],
    REF_CACHE_TAGS.settings,
    300
  );
});

export const getCachedFormationInscriptionFee = requestCache(async (): Promise<number> => {
  return runWithOptionalCache(
    async () => {
      try {
        const setting = await prisma.setting.findUnique({
          where: { id: "DEFAULT_FORMATION_INSCRIPTION_FEE" },
        });
        return setting?.value ? Number(setting.value) : 1500;
      } catch {
        return 1500;
      }
    },
    ["ref-formation-inscription-fee-v1"],
    REF_CACHE_TAGS.settings,
    300
  );
});

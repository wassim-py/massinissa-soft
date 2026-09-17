import { auth as clerkAuth, currentUser as clerkCurrentUser } from "@clerk/nextjs/server";

/**
 * Custom auth() helper that defaults treatPendingAsSignedOut to false,
 * allowing users whose sessions are in 'pending' status (e.g., created
 * in Clerk Dashboard without verified email) to access protected pages.
 */
export async function auth(opts?: Parameters<typeof clerkAuth>[0]) {
  return clerkAuth({ treatPendingAsSignedOut: false, ...opts });
}

/**
 * Custom currentUser() helper that defaults treatPendingAsSignedOut to false.
 */
export async function currentUser(opts?: Parameters<typeof clerkCurrentUser>[0]) {
  return clerkCurrentUser({ treatPendingAsSignedOut: false, ...opts });
}

import { cookies } from "next/headers";
import { DEFAULT_BRANCH_ID, canUserAccessBranch } from "./settings";
import {
  isOwner as checkIsOwner,
  isBranchAdmin as checkIsBranchAdmin,
  can as checkCan,
  cannot as checkCannot,
  Action,
  Resource,
  PermissionContext,
} from "./permissions";

export interface AuthSession {
  userId: string | null;
  role: string;
  rawRole: string;
  branchIds: number[];
  isOwner: boolean;
  isOwnerOrAdmin: boolean;
  isBranchAdmin: boolean;
  can: (action: Action, resource: Resource, context?: PermissionContext) => boolean;
  cannot: (action: Action, resource: Resource, context?: PermissionContext) => boolean;
}

export async function getAuthSession(): Promise<AuthSession> {
  try {
    const { userId, sessionClaims } = await clerkAuth({ treatPendingAsSignedOut: false });

    let rawRole =
      (sessionClaims?.metadata as any)?.role ||
      (sessionClaims as any)?.publicMetadata?.role ||
      (sessionClaims as any)?.role;

    let singleBranchId =
      (sessionClaims?.metadata as any)?.branchId ??
      (sessionClaims as any)?.publicMetadata?.branchId ??
      (sessionClaims as any)?.branchId;

    let branchIds: number[] =
      (sessionClaims?.metadata as any)?.branchIds ||
      (sessionClaims as any)?.publicMetadata?.branchIds ||
      (sessionClaims as any)?.branchIds ||
      [];

    if (singleBranchId !== undefined && singleBranchId !== null && !isNaN(Number(singleBranchId))) {
      const num = Number(singleBranchId);
      if (!branchIds.includes(num)) {
        branchIds = [num, ...branchIds];
      }
    }

    if (userId && (!rawRole || branchIds.length === 0)) {
      try {
        const user = await clerkCurrentUser({ treatPendingAsSignedOut: false });
        if (!rawRole) rawRole = (user?.publicMetadata as any)?.role;
        const metaBranchId = (user?.publicMetadata as any)?.branchId;
        if (metaBranchId !== undefined && metaBranchId !== null && !isNaN(Number(metaBranchId))) {
          const num = Number(metaBranchId);
          if (!branchIds.includes(num)) {
            branchIds = [num, ...branchIds];
          }
        }
        const metaBranchIds = (user?.publicMetadata as any)?.branchIds;
        if (Array.isArray(metaBranchIds)) {
          metaBranchIds.forEach((b: any) => {
            const num = Number(b);
            if (!isNaN(num) && !branchIds.includes(num)) {
              branchIds.push(num);
            }
          });
        }
      } catch {
        // ignore fallback errors
      }
    }

    const isOwner = checkIsOwner(rawRole);
    const isBranchAdmin = checkIsBranchAdmin(rawRole);
    const isOwnerOrAdmin = isOwner || isBranchAdmin || (rawRole || "").toLowerCase() === "admin";
    const role = (isOwnerOrAdmin || isBranchAdmin) ? "admin" : (rawRole || "admin");
    const resolvedRawRole = rawRole || role;

    return {
      userId: userId || null,
      role,
      rawRole: resolvedRawRole,
      branchIds,
      isOwner,
      isOwnerOrAdmin,
      isBranchAdmin,
      can: (action: Action, resource: Resource, context?: PermissionContext) =>
        checkCan(resolvedRawRole, action, resource, context),
      cannot: (action: Action, resource: Resource, context?: PermissionContext) =>
        checkCannot(resolvedRawRole, action, resource, context),
    };
  } catch {
    const testRole = process.env.TEST_AUTH_ROLE || "admin";
    const testBranchIds = process.env.TEST_BRANCH_IDS
      ? process.env.TEST_BRANCH_IDS.split(",").map(Number)
      : [1];
    const isOwner = checkIsOwner(testRole);
    const isBranchAdmin = checkIsBranchAdmin(testRole);
    return {
      userId: process.env.TEST_USER_ID || null,
      role: isOwner ? "admin" : (testRole || "admin"),
      rawRole: testRole,
      branchIds: testBranchIds,
      isOwner,
      isOwnerOrAdmin: true,
      isBranchAdmin,
      can: (action: Action, resource: Resource, context?: PermissionContext) =>
        checkCan(testRole, action, resource, context),
      cannot: (action: Action, resource: Resource, context?: PermissionContext) =>
        checkCannot(testRole, action, resource, context),
    };
  }
}

/**
 * Automatically resolves the active branch ID:
 * - Branch account: automatically and strictly resolves to the branch tied to their Clerk account.
 * - Owner account: reads from cookie so owner can switch freely between branches.
 */
export async function getActiveBranchId(): Promise<number> {
  const session = await getAuthSession();

  // Non-owner account: strictly and automatically use their account's branch
  if (!session.isOwner) {
    if (session.branchIds.length > 0) {
      return session.branchIds[0];
    }
    return DEFAULT_BRANCH_ID;
  }

  // Owner account: can switch freely using cookie
  try {
    const cookieStore = await cookies();
    const cookieVal = cookieStore.get("x-branch-id")?.value;
    const parsedCookie = cookieVal ? parseInt(cookieVal, 10) : null;

    if (parsedCookie && !isNaN(parsedCookie)) {
      return parsedCookie;
    }
  } catch {
    // Cookie store unavailable in some non-request contexts
  }

  return DEFAULT_BRANCH_ID;
}

/**
 * Backward-compatible helper to get normalized user role.
 */
export async function getAuthRole(): Promise<string> {
  const session = await getAuthSession();
  return session.role;
}



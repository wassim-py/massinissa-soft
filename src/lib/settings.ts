import { isOwner } from "./permissions";

export const ITEM_PER_PAGE = 10;
export const DEFAULT_BRANCH_ID = 1;

export type RouteAccessMap = {
  [key: string]: string[];
};

export const OWNER_ROLES = ["owner", "admin", "OWNER", "ADMIN"];
export const BRANCH_ADMIN_ROLES = [
  "branch",
  "branch_admin",
  "BRANCH_ADMIN",
  "branch-admin",
  "Branch_Admin",
];
export const ADMIN_ROLES = [...OWNER_ROLES, ...BRANCH_ADMIN_ROLES];

export interface UserSessionMetadata {
  role?: string;
  branchIds?: number[];
}

export const canUserAccessBranch = (
  role?: string,
  userBranchIds?: number[],
  targetBranchId?: number
): boolean => {
  if (!targetBranchId) return true;
  // Only the owner has unrestricted access across all branches
  if (isOwner(role)) {
    return true;
  }
  // Branch accounts are strictly restricted to their assigned branchId
  if (userBranchIds && Array.isArray(userBranchIds) && userBranchIds.length > 0) {
    return userBranchIds.includes(targetBranchId);
  }
  return false;
};

export const routeAccessMap: RouteAccessMap = {
  // Owner-only admin configurations
  "/admin/configuration(.*)": OWNER_ROLES,
  "/admin(.*)": ADMIN_ROLES,

  // Role dashboards
  "/student(.*)": ["student", ...ADMIN_ROLES],
  "/teacher(.*)": ["teacher", ...ADMIN_ROLES],
  "/parent(.*)": ["parent", ...ADMIN_ROLES],

  // Financial & Payroll: OWNER-ONLY
  "/list/reports(.*)": OWNER_ROLES,
  "/list/payroll(.*)": OWNER_ROLES,
  "/list/revenue(.*)": OWNER_ROLES,
  "/list/finance(.*)": OWNER_ROLES,

  // Teacher routes: profile page is OWNER-ONLY, list is viewable by both
  "/list/teachers/(.+)": OWNER_ROLES,
  "/list/teachers": [...ADMIN_ROLES, "teacher"],

  // Shared entity lists and details
  "/list/students(.*)": [...ADMIN_ROLES, "teacher"],
  "/list/parents(.*)": [...ADMIN_ROLES, "teacher"],
  "/list/subjects(.*)": ADMIN_ROLES,
  "/list/classes(.*)": [...ADMIN_ROLES, "teacher"],
  "/list/groups(.*)": [...ADMIN_ROLES, "teacher"],
  "/list/formations(.*)": [...ADMIN_ROLES, "teacher"],
  "/list/lessons(.*)": [...ADMIN_ROLES, "teacher", "student", "parent"],
  "/list/attendance(.*)": [...ADMIN_ROLES, "teacher", "student", "parent"],
  "/list/payments(.*)": [...ADMIN_ROLES, "student", "parent"],
  "/list/workshops(.*)": [...ADMIN_ROLES, "student", "parent"],
  "/list/announcements(.*)": [...ADMIN_ROLES, "teacher", "student", "parent"],
};
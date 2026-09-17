/**
 * Central RBAC and Permissions Engine for Massinissa School Management System.
 *
 * Implements the branch-scoping and permission model according to docs/architecture.md §1.0.
 *
 * GENERAL PRINCIPLE:
 * Branch admins get exactly what they need for their day-to-day branch work.
 * Every permission not explicitly listed as available to a branch admin below is
 * OWNER-ONLY — this is the default, not an exception.
 */

export type CanonicalRole =
  | "owner"
  | "branch_admin"
  | "teacher"
  | "student"
  | "parent"
  | "guest";

export type RoleInput = string | null | undefined;

export type StandardAction = "view" | "create" | "update" | "delete";

export type SpecializedAction =
  | "view_profile"
  | "view_all_branches"
  | "filter_all_school"
  | "filter_branches"
  | "restricted_actions"
  | "override_inscription_fee"
  | "take"
  | "export"
  | "manage";

export type Action = StandardAction | SpecializedAction;

export type Resource =
  | "home"
  | "dashboard"
  | "teachers"
  | "teacher"
  | "teacher_profile"
  | "students"
  | "student"
  | "student_profile"
  | "parents"
  | "parent"
  | "subjects"
  | "subject"
  | "groups"
  | "classes"
  | "class"
  | "lessons"
  | "lesson"
  | "schedule"
  | "attendance"
  | "payments"
  | "payment"
  | "vouchers"
  | "voucher"
  | "announcements"
  | "announcement"
  | "workshops"
  | "workshop"
  | "formations"
  | "formation"
  | "finance"
  | "reports"
  | "payroll"
  | "revenue"
  | "daily_ledger"
  | "dailyLedger"
  | "voucher_series"
  | "configuration"
  | (string & {});

export interface PermissionContext {
  branchId?: number;
  targetBranchId?: number;
  userBranchIds?: number[];
  recordId?: string | number;
}

export interface ActionState {
  allowed: boolean;
  hidden: boolean;
  disabled: boolean;
  reason?: string;
}

/**
 * Normalizes any role input (e.g. Clerk user metadata or session claim) to a CanonicalRole.
 */
export function normalizeRole(role: RoleInput): CanonicalRole {
  if (!role) return "guest";
  const r = role.toLowerCase().trim();
  if (r === "owner" || r === "admin") {
    return "owner";
  }
  if (r === "branch_admin" || r === "branch" || r === "branch-admin") {
    return "branch_admin";
  }
  if (r === "teacher") return "teacher";
  if (r === "student") return "student";
  if (r === "parent") return "parent";
  return "guest";
}

export function isOwner(role: RoleInput): boolean {
  return normalizeRole(role) === "owner";
}

export function isBranchAdmin(role: RoleInput): boolean {
  return normalizeRole(role) === "branch_admin";
}

export function isAdmin(role: RoleInput): boolean {
  const norm = normalizeRole(role);
  return norm === "owner" || norm === "branch_admin";
}

/**
 * Normalizes resource aliases to standard keys.
 */
function normalizeResource(resource: Resource): string {
  const r = resource.toLowerCase().trim();
  switch (r) {
    case "dashboard":
      return "home";
    case "teacher":
      return "teachers";
    case "student":
      return "students";
    case "parent":
      return "parents";
    case "subject":
      return "subjects";
    case "class":
    case "classes":
      return "groups";
    case "lesson":
    case "schedule":
      return "lessons";
    case "payment":
    case "voucher":
    case "vouchers":
      return "payments";
    case "announcement":
      return "announcements";
    case "workshop":
      return "workshops";
    case "formation":
      return "formations";
    case "finance":
    case "reports":
    case "payroll":
    case "revenue":
      return "finance";
    case "daily_ledger":
    case "dailyledger":
    case "daily-ledger":
      return "daily_ledger";
    default:
      return r;
  }
}

/**
 * Permissions explicitly granted to branch_admin.
 * Any resource or action not explicitly listed here evaluates to false for branch_admin,
 * enforcing the DEFAULT-DENY / OWNER-ONLY rule.
 */
const BRANCH_ADMIN_ALLOWED_PERMISSIONS: Record<string, ReadonlySet<string>> = {
  home: new Set(["view"]),
  teachers: new Set(["view", "restricted_actions"]),
  // "create", "update", "delete", "view_profile" are intentionally NOT allowed for branch_admin on teachers
  teacher_profile: new Set([]), // Explicitly OWNER-ONLY
  students: new Set(["view", "create", "update", "delete", "view_profile"]),
  student_profile: new Set(["view"]),
  parents: new Set(["view", "create", "update", "delete"]),
  subjects: new Set(["view"]), // Read-only: create, update, delete are OWNER-ONLY
  groups: new Set(["view"]), // Read-only: create, update, delete are OWNER-ONLY
  lessons: new Set([
    "view",
    "create",
    "update",
    "delete",
    "filter_branches",
    "view_all_school",
  ]),
  attendance: new Set(["view", "create", "update", "delete", "take"]),
  // "view_all_branches" on attendance is intentionally NOT allowed for branch_admin
  payments: new Set(["view", "create", "update", "delete"]),
  // "view_all_branches", "filter_all_school", "override_inscription_fee" are intentionally NOT allowed for branch_admin
  announcements: new Set(["view", "create", "update", "delete"]),
  workshops: new Set(["view", "create", "update", "delete"]),
  formations: new Set(["view", "create", "update", "delete"]),
  daily_ledger: new Set(["view", "create"]), // Read-only today's money + declare missing cash
  finance: new Set([]), // Explicitly OWNER-ONLY (reports, payroll, revenue)
  voucher_series: new Set([]), // Explicitly OWNER-ONLY
};

/**
 * Permissions for other roles (teachers, students, parents).
 */
const ROLE_ALLOWED_PERMISSIONS: Record<
  "teacher" | "student" | "parent",
  Record<string, ReadonlySet<string>>
> = {
  teacher: {
    home: new Set(["view"]),
    teachers: new Set(["view"]),
    students: new Set(["view", "view_profile"]),
    student_profile: new Set(["view"]),
    groups: new Set(["view"]),
    lessons: new Set(["view"]),
    attendance: new Set(["view", "take", "create", "update"]),
    announcements: new Set(["view"]),
    formations: new Set(["view"]),
  },
  student: {
    home: new Set(["view"]),
    student_profile: new Set(["view"]),
    lessons: new Set(["view"]),
    attendance: new Set(["view"]),
    payments: new Set(["view"]),
    announcements: new Set(["view"]),
    workshops: new Set(["view"]),
  },
  parent: {
    home: new Set(["view"]),
    student_profile: new Set(["view"]),
    lessons: new Set(["view"]),
    attendance: new Set(["view"]),
    payments: new Set(["view"]),
    announcements: new Set(["view"]),
    workshops: new Set(["view"]),
  },
};

/**
 * Central permission check function.
 *
 * Checks if a given role can perform an action on a resource.
 *
 * @example
 * can(role, "create", "teachers") // false for branch_admin, true for owner
 * can(role, "view", "subjects") // true for both owner and branch_admin
 * can(role, "delete", "subjects") // false for branch_admin, true for owner
 * can(role, "view", "reports") // false for branch_admin, true for owner
 */
export function can(
  role: RoleInput,
  action: Action,
  resource: Resource,
  context?: PermissionContext
): boolean {
  const normRole = normalizeRole(role);

  // Guests have no administrative or restricted access
  if (normRole === "guest") {
    return false;
  }

  // GENERAL PRINCIPLE: Owner has unrestricted access to everything
  if (normRole === "owner") {
    return true;
  }

  const normResource = normalizeResource(resource);

  // Branch Admin checks: strictly whitelist-based. Default is DENY.
  if (normRole === "branch_admin") {
    const allowedActions = BRANCH_ADMIN_ALLOWED_PERMISSIONS[normResource];
    if (!allowedActions) {
      // Any resource not explicitly mapped is OWNER-ONLY by default
      return false;
    }
    return allowedActions.has(action);
  }

  // Teacher, Student, Parent checks
  const rolePermissions = ROLE_ALLOWED_PERMISSIONS[normRole];
  if (rolePermissions) {
    const allowed = rolePermissions[normResource];
    return !!allowed && allowed.has(action);
  }

  return false;
}

/**
 * Inverse permission check for cleaner syntax: cannot(role, action, resource)
 */
export function cannot(
  role: RoleInput,
  action: Action,
  resource: Resource,
  context?: PermissionContext
): boolean {
  return !can(role, action, resource, context);
}

/**
 * Returns list of allowed actions for a given role and resource.
 */
export function getAvailableActions(
  role: RoleInput,
  resource: Resource
): Action[] {
  const normRole = normalizeRole(role);
  if (normRole === "guest") return [];

  const standardActions: Action[] = ["view", "create", "update", "delete"];
  const normResource = normalizeResource(resource);

  if (normRole === "owner") {
    const actions = [...standardActions];
    if (normResource === "teachers") {
      actions.push("view_profile", "restricted_actions");
    }
    if (normResource === "students") {
      actions.push("view_profile");
    }
    if (normResource === "attendance" || normResource === "payments") {
      actions.push("view_all_branches", "filter_all_school");
    }
    if (normResource === "payments") {
      actions.push("override_inscription_fee");
    }
    return actions;
  }

  if (normRole === "branch_admin") {
    const allowed = BRANCH_ADMIN_ALLOWED_PERMISSIONS[normResource];
    if (!allowed) return [];
    return Array.from(allowed) as Action[];
  }

  const rolePerms = ROLE_ALLOWED_PERMISSIONS[normRole];
  if (rolePerms && rolePerms[normResource]) {
    return Array.from(rolePerms[normResource]) as Action[];
  }

  return [];
}

/**
 * Helper to determine action rendering state (allowed vs hidden vs disabled with a reason).
 * Useful for UI components to conditionally hide or render buttons as disabled with a tooltip.
 */
export function getActionState(
  role: RoleInput,
  action: Action,
  resource: Resource,
  behavior: "hide" | "disable" = "hide"
): ActionState {
  const allowed = can(role, action, resource);
  if (allowed) {
    return {
      allowed: true,
      hidden: false,
      disabled: false,
    };
  }

  const normRole = normalizeRole(role);
  let reason = "هذا الإجراء متاح للمالك فقط.";
  if (normRole === "branch_admin") {
    reason = "هذا الإجراء خاص بمالك المؤسسة فقط.";
  }

  return {
    allowed: false,
    hidden: behavior === "hide",
    disabled: behavior === "disable",
    reason,
  };
}

/**
 * Checks whether a navigation menu item should be visible for a given role.
 */
export function canAccessMenuItem(role: RoleInput, menuKey: string): boolean {
  const normRole = normalizeRole(role);
  if (normRole === "guest") return false;
  if (normRole === "owner") return true;

  switch (menuKey) {
    case "home":
      return true;
    case "teachers":
      return normRole === "branch_admin" || normRole === "teacher";
    case "students":
      return normRole === "branch_admin" || normRole === "teacher";
    case "parents":
      return normRole === "branch_admin";
    case "subjects":
      return normRole === "branch_admin";
    case "classes":
    case "groups":
      return normRole === "branch_admin" || normRole === "teacher";
    case "lessons":
      return true;
    case "attendance":
      return true;
    case "payments":
      return (
        normRole === "branch_admin" ||
        normRole === "student" ||
        normRole === "parent"
      );
    case "announcements":
      return true;
    case "workshops":
      return (
        normRole === "branch_admin" ||
        normRole === "student" ||
        normRole === "parent"
      );
    case "formations":
      return normRole === "branch_admin" || normRole === "teacher";
    case "dailyLedger":
    case "daily_ledger":
      return normRole === "branch_admin";
    case "reports":
    case "payroll":
    case "finance":
    case "configuration":
      // Explicitly OWNER-ONLY
      return false;
    default:
      // Default-deny for branch_admin or any other role
      return false;
  }
}

/**
 * Validates if a role can access a specific route pathname.
 * Useful for middleware, proxies, and page-level guards.
 */
export function canAccessRoute(role: RoleInput, pathname: string): boolean {
  const normRole = normalizeRole(role);
  if (normRole === "owner") return true;

  // Strip locale prefix if present (e.g. /fr/list/reports -> /list/reports)
  const pathWithoutLocale = pathname.replace(/^\/(fr|ar)/, "") || "/";

  // Owner-only routes (strictly forbidden for branch_admin and others)
  const ownerOnlyPatterns = [
    /^\/admin\/configuration(\/.*)?$/,
    /^\/list\/reports(\/.*)?$/,
    /^\/list\/payroll(\/.*)?$/,
    /^\/list\/revenue(\/.*)?$/,
    /^\/list\/finance(\/.*)?$/,
    /^\/list\/teachers\/.+$/, // Single teacher profile page is OWNER-ONLY
  ];

  for (const pattern of ownerOnlyPatterns) {
    if (pattern.test(pathWithoutLocale)) {
      return false;
    }
  }

  // Branch admin allowed routes
  if (normRole === "branch_admin") {
    if (pathWithoutLocale.startsWith("/admin")) return true;
    if (pathWithoutLocale === "/list/teachers") return true;
    if (pathWithoutLocale.startsWith("/list/students")) return true;
    if (pathWithoutLocale.startsWith("/list/parents")) return true;
    if (pathWithoutLocale.startsWith("/list/subjects")) return true;
    if (pathWithoutLocale.startsWith("/list/classes")) return true;
    if (pathWithoutLocale.startsWith("/list/groups")) return true;
    if (pathWithoutLocale.startsWith("/list/lessons")) return true;
    if (pathWithoutLocale.startsWith("/list/attendance")) return true;
    if (pathWithoutLocale.startsWith("/list/payments")) return true;
    if (pathWithoutLocale.startsWith("/list/announcements")) return true;
    if (pathWithoutLocale.startsWith("/list/workshops")) return true;
    if (pathWithoutLocale.startsWith("/list/formations")) return true;
    if (pathWithoutLocale.startsWith("/list/daily-ledger")) return true;
    if (pathWithoutLocale === "/") return true;
    return false;
  }

  // Other roles
  if (normRole === "teacher") {
    return (
      pathWithoutLocale.startsWith("/teacher") ||
      pathWithoutLocale === "/list/teachers" ||
      pathWithoutLocale.startsWith("/list/students") ||
      pathWithoutLocale.startsWith("/list/classes") ||
      pathWithoutLocale.startsWith("/list/lessons") ||
      pathWithoutLocale.startsWith("/list/attendance") ||
      pathWithoutLocale.startsWith("/list/announcements") ||
      pathWithoutLocale.startsWith("/list/formations") ||
      pathWithoutLocale === "/"
    );
  }

  if (normRole === "student") {
    return (
      pathWithoutLocale.startsWith("/student") ||
      pathWithoutLocale.startsWith("/list/lessons") ||
      pathWithoutLocale.startsWith("/list/attendance") ||
      pathWithoutLocale.startsWith("/list/payments") ||
      pathWithoutLocale.startsWith("/list/announcements") ||
      pathWithoutLocale.startsWith("/list/workshops") ||
      pathWithoutLocale === "/"
    );
  }

  if (normRole === "parent") {
    return (
      pathWithoutLocale.startsWith("/parent") ||
      pathWithoutLocale.startsWith("/list/lessons") ||
      pathWithoutLocale.startsWith("/list/attendance") ||
      pathWithoutLocale.startsWith("/list/payments") ||
      pathWithoutLocale.startsWith("/list/announcements") ||
      pathWithoutLocale.startsWith("/list/workshops") ||
      pathWithoutLocale === "/"
    );
  }

  return false;
}

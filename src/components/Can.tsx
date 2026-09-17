import React from "react";
import {
  Action,
  Resource,
  RoleInput,
  PermissionContext,
  can,
  getActionState,
} from "@/lib/permissions";

export interface CanProps {
  role?: RoleInput;
  action: Action;
  resource: Resource;
  context?: PermissionContext;
  children: React.ReactNode;
  fallback?: React.ReactNode;
  renderDisabled?: (reason?: string) => React.ReactNode;
}

/**
 * Declarative component for role-based conditional rendering.
 *
 * Can be used in both Server and Client Components.
 *
 * @example
 * // Hide button completely if not permitted:
 * <Can role={session.rawRole} action="create" resource="teachers">
 *   <AddTeacherButton />
 * </Can>
 *
 * @example
 * // Render button in a disabled state if not permitted:
 * <Can
 *   role={session.rawRole}
 *   action="delete"
 *   resource="subjects"
 *   renderDisabled={(reason) => (
 *     <button disabled title={reason} className="opacity-50 cursor-not-allowed">
 *       حذف
 *     </button>
 *   )}
 * >
 *   <button onClick={handleDelete}>حذف</button>
 * </Can>
 */
export function Can({
  role,
  action,
  resource,
  context,
  children,
  fallback = null,
  renderDisabled,
}: CanProps) {
  const allowed = can(role, action, resource, context);

  if (allowed) {
    return <>{children}</>;
  }

  if (renderDisabled) {
    const state = getActionState(role, action, resource, "disable");
    return <>{renderDisabled(state.reason)}</>;
  }

  return <>{fallback}</>;
}

export default Can;

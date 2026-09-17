"use client";

import { useUser } from "@clerk/nextjs";
import { useMemo } from "react";
import {
  Action,
  Resource,
  CanonicalRole,
  PermissionContext,
  ActionState,
  can as checkCan,
  cannot as checkCannot,
  getActionState as computeActionState,
  isOwner as checkIsOwner,
  isBranchAdmin as checkIsBranchAdmin,
  isAdmin as checkIsAdmin,
  normalizeRole,
} from "@/lib/permissions";

export interface UsePermissionReturn {
  role: string | undefined;
  canonicalRole: CanonicalRole;
  isOwner: boolean;
  isBranchAdmin: boolean;
  isAdmin: boolean;
  isLoaded: boolean;
  can: (
    action: Action,
    resource: Resource,
    context?: PermissionContext
  ) => boolean;
  cannot: (
    action: Action,
    resource: Resource,
    context?: PermissionContext
  ) => boolean;
  getActionState: (
    action: Action,
    resource: Resource,
    behavior?: "hide" | "disable"
  ) => ActionState;
}

/**
 * Client-side React hook to access permissions and role checks.
 *
 * @example
 * const { can, isOwner, isBranchAdmin } = usePermission();
 * if (can("create", "teachers")) {
 *   // show add teacher button
 * }
 */
export function usePermission(): UsePermissionReturn {
  const { user, isLoaded } = useUser();

  const role = useMemo(() => {
    return (user?.publicMetadata?.role as string) || undefined;
  }, [user]);

  const canonicalRole = useMemo(() => {
    return normalizeRole(role);
  }, [role]);

  const isOwner = useMemo(() => checkIsOwner(role), [role]);
  const isBranchAdmin = useMemo(() => checkIsBranchAdmin(role), [role]);
  const isAdmin = useMemo(() => checkIsAdmin(role), [role]);

  const can = useMemo(() => {
    return (
      action: Action,
      resource: Resource,
      context?: PermissionContext
    ) => checkCan(role, action, resource, context);
  }, [role]);

  const cannot = useMemo(() => {
    return (
      action: Action,
      resource: Resource,
      context?: PermissionContext
    ) => checkCannot(role, action, resource, context);
  }, [role]);

  const getActionState = useMemo(() => {
    return (
      action: Action,
      resource: Resource,
      behavior: "hide" | "disable" = "hide"
    ) => computeActionState(role, action, resource, behavior);
  }, [role]);

  return {
    role,
    canonicalRole,
    isOwner,
    isBranchAdmin,
    isAdmin,
    isLoaded,
    can,
    cannot,
    getActionState,
  };
}

export default usePermission;

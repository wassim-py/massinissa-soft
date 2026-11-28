import { getActiveBranchId, getAuthSession } from "@/lib/auth";
import { getCachedBranches } from "@/lib/cachedReferenceData";
import BranchSwitcherDropdown from "./BranchSwitcherDropdown";

export default async function BranchSwitcher() {
  const session = await getAuthSession();

  // If user is not admin/staff, don't show the branch switcher
  const isStaffOrAdmin =
    session.isOwnerOrAdmin ||
    session.role === "admin" ||
    session.rawRole.toLowerCase().includes("branch");

  if (!isStaffOrAdmin) {
    return null;
  }

  const [activeBranchId, branches] = await Promise.all([
    getActiveBranchId(),
    getCachedBranches(),
  ]);

  return (
    <BranchSwitcherDropdown
      branches={branches}
      activeBranchId={activeBranchId}
      isOwner={session.isOwner}
    />
  );
}

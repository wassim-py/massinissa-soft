import prisma from "@/lib/prisma";
import { getActiveBranchId, getAuthSession } from "@/lib/auth";
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

  const activeBranchId = await getActiveBranchId();

  let branches: Array<{ id: number; name: string; address: string }> = [];
  try {
    branches = await prisma.$queryRaw<
      Array<{ id: number; name: string; address: string }>
    >`
      SELECT id, name, address
      FROM "Branch"
      ORDER BY id ASC
    `;
  } catch (e) {
    branches = [
      { id: 1, name: "ECOLE", address: "Constantine - Centre, Algérie" },
      { id: 2, name: "ANNEX", address: "Constantine - Annex, Algérie" },
      { id: 3, name: "AMPHI", address: "Constantine - Amphi, Algérie" },
    ];
  }

  return (
    <BranchSwitcherDropdown
      branches={branches}
      activeBranchId={activeBranchId}
      isOwner={session.isOwner}
    />
  );
}

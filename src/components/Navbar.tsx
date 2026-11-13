import { UserButton } from "@clerk/nextjs";
import { currentUser, getActiveBranchId, getAuthSession } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getAlgiersDayBounds, getAlgiersTodayDateString } from "@/lib/algiersDate";
import { getTranslations } from "next-intl/server";
import LanguageSwitcher from "./LanguageSwitcher";
import BranchSwitcher from "./BranchSwitcher";
import NavbarAnnouncementBadge from "./announcements/NavbarAnnouncementBadge";
import NavbarBiometricControl from "./biometrics/NavbarBiometricControl";
import NavbarPhotocopyControl from "./photocopy/NavbarPhotocopyControl";

const Navbar = async ({
  mobileNav,
}: {
  mobileNav?: React.ReactNode;
}) => {
  const [user, session, tRoles] = await Promise.all([
    currentUser({ treatPendingAsSignedOut: false }).catch(() => null),
    getAuthSession(),
    getTranslations("roles"),
  ]);
  const rawRole = (user?.publicMetadata?.role as string) || session.rawRole || "";
  const roleKey = rawRole.toLowerCase();
  const isAdminOrOwner =
    session.isOwnerOrAdmin ||
    !roleKey ||
    roleKey === "owner" ||
    roleKey === "admin" ||
    roleKey === "branch_admin" ||
    roleKey === "branch";

  let activeBranchId = 1;
  let activeBranchName = "";
  let todayPhotocopyCount = 0;

  if (session.isOwnerOrAdmin) {
    activeBranchId = await getActiveBranchId();
    activeBranchName = `Siège #${activeBranchId}`;
    try {
      const todayBounds = getAlgiersDayBounds(getAlgiersTodayDateString());
      const [branchRow, countRow] = await Promise.all([
        prisma.branch.findUnique({
          where: { id: activeBranchId },
          select: { name: true },
        }),
        prisma.photocopyCharge.count({
          where: {
            branchId: activeBranchId,
            date: {
              gte: todayBounds.startUtc,
              lte: todayBounds.endUtc,
            },
          },
        }),
      ]);
      if (branchRow?.name) {
        activeBranchName = branchRow.name;
      }
      todayPhotocopyCount = countRow;
    } catch {
      // Fallback gracefully if transient DB error occurs during header render
    }
  }
  let translatedRole = rawRole;
  if (roleKey === "branch_admin" || roleKey === "branch") {
    translatedRole = tRoles("branch_admin");
  } else if (roleKey === "admin") {
    translatedRole = tRoles("admin");
  } else if (roleKey === "owner") {
    translatedRole = tRoles("owner");
  } else if (roleKey === "teacher") {
    translatedRole = tRoles("teacher");
  } else if (roleKey === "student") {
    translatedRole = tRoles("student");
  } else if (roleKey === "parent") {
    translatedRole = tRoles("parent");
  }

  return (
    <header
      className="flex items-center justify-between px-2.5 sm:px-4 md:px-6 py-2 sm:py-3 border-b border-gray-200 bg-white sticky top-0 z-30 shadow-xs"
      style={{ backgroundColor: "#ffffff" }}
    >
      {/* START: HAMBURGER TRIGGER (on <lg) + BRANCH SWITCHER */}
      <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
        {mobileNav}
        <BranchSwitcher />
      </div>

      {/* END: PHOTOCOPY JOURNAL, BIOMETRIC JOURNAL, NOTIFICATION BELL, LANGUAGE SWITCHER, USER INFO, CLERK BUTTON */}
      <div className="flex items-center gap-1.5 sm:gap-2.5 md:gap-4 justify-end shrink-0">
        {session.isOwnerOrAdmin && (
          <NavbarPhotocopyControl
            branchId={activeBranchId}
            branchName={activeBranchName}
            isOwner={session.isOwner}
            initialTodayCount={todayPhotocopyCount}
          />
        )}
        {isAdminOrOwner && <NavbarBiometricControl />}
        <NavbarAnnouncementBadge />
        <LanguageSwitcher />

        <div className="hidden sm:flex flex-col text-end">
          <span className="text-xs font-semibold text-gray-800 truncate max-w-[120px] md:max-w-none">
            {user?.lastName ? `${user.lastName} ${user.firstName || ""}`.trim() : user?.firstName}
          </span>
          <span className="text-[11px] text-muted font-normal">
            {translatedRole}
          </span>
        </div>

        <div className="flex items-center justify-center shrink-0">
          <UserButton
            appearance={{
              elements: {
                userButtonAvatarBox:
                  "w-8 h-8 sm:w-9 sm:h-9 rounded-full ring-2 ring-gray-200 hover:ring-primary/40 transition-all",
                userButtonTrigger:
                  "rounded-full focus:outline-hidden focus:ring-2 focus:ring-primary/20",
              },
            }}
          />
        </div>
      </div>
    </header>
  );
};

export default Navbar;

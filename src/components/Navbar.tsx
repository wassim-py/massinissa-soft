import { UserButton } from "@clerk/nextjs";
import { currentUser } from "@/lib/auth";
import { getTranslations } from "next-intl/server";
import LanguageSwitcher from "./LanguageSwitcher";
import BranchSwitcher from "./BranchSwitcher";
import NavbarAnnouncementBadge from "./announcements/NavbarAnnouncementBadge";

const Navbar = async ({
  mobileNav,
}: {
  mobileNav?: React.ReactNode;
}) => {
  const user = await currentUser({ treatPendingAsSignedOut: false });
  const rawRole = (user?.publicMetadata?.role as string) || "";
  const roleKey = rawRole.toLowerCase();

  const tRoles = await getTranslations("roles");
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
      className="flex items-center justify-between px-3 sm:px-4 md:px-6 py-3 border-b border-gray-200 bg-white sticky top-0 z-30 shadow-xs"
      style={{ backgroundColor: "#ffffff" }}
    >
      {/* START: HAMBURGER TRIGGER (on <lg) + BRANCH SWITCHER */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        {mobileNav}
        <BranchSwitcher />
      </div>

      {/* END: NOTIFICATION BELL, LANGUAGE SWITCHER, USER INFO, CLERK BUTTON */}
      <div className="flex items-center gap-2.5 sm:gap-4 md:gap-6 justify-end shrink-0">
        <NavbarAnnouncementBadge />
        <LanguageSwitcher />

        <div className="hidden sm:flex flex-col text-end">
          <span className="text-xs font-semibold text-gray-800 truncate max-w-[120px] md:max-w-none">
            {user?.firstName} {user?.lastName}
          </span>
          <span className="text-[11px] text-muted font-normal">
            {translatedRole}
          </span>
        </div>

        <UserButton />
      </div>
    </header>
  );
};

export default Navbar;

import { UserButton } from "@clerk/nextjs";
import { currentUser } from "@clerk/nextjs/server";
import Image from "next/image";

// ADDED: A simple mapping to translate roles for display
const roleTranslations: { [key: string]: string } = {
    admin: "مدير",
    teacher: "أستاذ",
    student: "طالب",
    parent: "ولي الأمر",
};

const Navbar = async () => {
  const user = await currentUser({ treatPendingAsSignedOut: false });
  const role = user?.publicMetadata.role as string;
  const translatedRole = roleTranslations[role] || role; // Fallback to the original role if no translation is found

  return (
    <div className="flex items-center justify-between p-4">
      {/* SEARCH BAR (Translated placeholder)
      <div className="hidden md:flex items-center gap-2 text-xs rounded-full ring-[1.5px] ring-gray-300 px-2">
        <Image src="/search.png" alt="" width={14} height={14} />
        <input
          type="text"
          placeholder="ابحث..."
          className="w-[200px] p-2 bg-transparent outline-none"
        />
      </div>
      */}
      {/* ICONS AND USER */}
      <div className="flex items-center gap-6 justify-end w-full">
        <div className="flex flex-col text-right"> {/* Ensure text aligns to the right in RTL */}
          <span className="text-xs leading-3 font-medium">
            {user?.firstName} {user?.lastName}
          </span>
          <span className="text-[10px] text-gray-500">
            {translatedRole}
          </span>
        </div>
        <UserButton />
      </div>
    </div>
  );
};

export default Navbar;

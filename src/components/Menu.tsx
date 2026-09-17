import { getAuthSession } from "@/lib/auth";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { canAccessMenuItem } from "@/lib/permissions";

import SidebarAnnouncementBadge from "./announcements/SidebarAnnouncementBadge";

const menuConfig = [
  {
    titleKey: "mainMenu",
    items: [
      {
        icon: "/home.png",
        key: "home",
        href: "/",
      },
      {
        icon: "/teacher.png",
        key: "teachers",
        href: "/list/teachers",
      },
      {
        icon: "/student.png",
        key: "students",
        href: "/list/students",
      },
      {
        icon: "/parent.png",
        key: "parents",
        href: "/list/parents",
      },
      {
        icon: "/subject.png",
        key: "subjects",
        href: "/list/subjects",
      },
      {
        icon: "/class.png",
        key: "classes",
        href: "/list/classes",
      },
      {
        icon: "/lesson.png",
        key: "lessons",
        href: "/list/lessons",
      },
      {
        icon: "/attendance.png",
        key: "attendance",
        href: "/list/attendance",
      },
      {
        icon: "/payment.png",
        key: "payments",
        href: "/list/payments",
      },
      {
        icon: "/announcement.png",
        key: "announcements",
        href: "/list/announcements",
      },
      {
        icon: "/workshop.png",
        key: "workshops",
        href: "/list/workshops",
      },
      {
        icon: "/subject.png",
        key: "formations",
        href: "/list/formations",
      },
      {
        icon: "/finance1.png",
        key: "dailyLedger",
        href: "/list/daily-ledger",
      },
      {
        icon: "/finance.png",
        key: "finance",
        href: "/list/finance",
      },
      {
        icon: "/setting.png",
        key: "configuration",
        href: "/admin/configuration",
      },
    ],
  },
];

const Menu = async () => {
  const session = await getAuthSession();
  const rawRole = session.rawRole || "";
  const t = await getTranslations("navigation");

  return (
    <nav className="flex flex-col gap-4 text-sm">
      {menuConfig.map((section) => (
        <div className="flex flex-col gap-1" key={section.titleKey}>
          <span className="text-muted font-semibold text-[11px] uppercase tracking-wider my-2 px-3">
            {t(section.titleKey)}
          </span>
          {section.items.map((item) => {
            if (canAccessMenuItem(rawRole, item.key)) {
              return (
                <Link
                  href={item.href}
                  key={item.key}
                  className="flex items-center justify-start gap-3 text-gray-700 hover:text-primary font-medium py-2 px-3 rounded-lg hover:bg-primary-light/70 active:bg-primary-light transition-colors"
                >
                  <Image
                    src={item.icon}
                    alt=""
                    width={20}
                    height={20}
                    className="shrink-0"
                  />
                  <span className="text-table-body">{t(item.key)}</span>
                  {item.key === "announcements" && <SidebarAnnouncementBadge />}
                </Link>
              );
            }
            return null;
          })}
        </div>
      ))}
    </nav>
  );
};

export default Menu;

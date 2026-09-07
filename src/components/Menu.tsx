import { currentUser } from "@clerk/nextjs/server";
import Image from "next/image";
import Link from "next/link";

// UPDATED: All labels and titles are now in Arabic
const menuItems = [
  {
    title: "القائمة الرئيسية",
    items: [
      {
        icon: "/home.png",
        label: "الرئيسية",
        href: "/",
        visible: ["admin", "teacher", "student", "parent"],
      },
      {
        icon: "/teacher.png",
        label: "الأساتذة",
        href: "/list/teachers",
        visible: ["admin"],
      },
      {
        icon: "/student.png",
        label: "التلاميذ",
        href: "/list/students",
        visible: ["admin", "teacher"],
      },
      {
        icon: "/parent.png",
        label: "أولياء الأمور",
        href: "/list/parents",
        visible: ["admin"],
      },
      {
        icon: "/subject.png",
        label: "المواد",
        href: "/list/subjects",
        visible: ["admin"],
      },
      {
        icon: "/class.png",
        label: "الأقسام",
        href: "/list/classes",
        visible: ["admin"],
      },
      {
        icon: "/course.png",
        label: "الدروس",
        href: "/list/courses",
        visible: ["admin", "teacher", "student", "parent"],
      },
      {
        icon: "/lesson.png",
        label: "جدول الحصص",
        href: "/list/lessons",
        visible: ["admin", "teacher", "student", "parent"],
      },
      {
        icon: "/exam.png",
        label: "الامتحانات",
        href: "/list/exams",
        visible: ["admin", "teacher", "student", "parent"],
      },
      {
        icon: "/result.png",
        label: "النتائج",
        href: "/list/results",
        visible: ["admin", "teacher", "student", "parent"],
      },
      {
        icon: "/attendance.png",
        label: "الحضور والغياب",
        href: "/list/attendance",
        visible: ["admin", "teacher", "student", "parent"],
      },
      {
        icon: "/payment.png",
        label: "المدفوعات",
        href: "/list/payments",
        visible: ["admin", "student", "parent"],
      },
      {
        icon: "/event.png",
        label: "الأحداث",
        href: "/list/events",
        visible: ["admin", "teacher", "student", "parent"],
      },
      {
        icon: "/announcement.png",
        label: "الإعلانات",
        href: "/list/announcements",
        visible: ["admin", "teacher", "student", "parent"],
      },
      {
        icon: "/workshop.png",
        label: "الدورات",
        href: "/list/workshops",
        visible: ["admin", "student", "parent"],
      },
      {
        label: "التقارير المالية",
        href: "/list/reports",
        icon: "/report.png",
        visible: ["admin"],
      },
    ],
  },
];

const Menu = async () => {
  const user = await currentUser();
  const role = user?.publicMetadata.role as string;
  return (
    <div className="mt-4 text-sm sticky">
      {menuItems.map((i) => (
        <div className="flex flex-col gap-2" key={i.title}>
          <span className="hidden lg:block text-black font-light my-4">
            {i.title}
          </span>
          {i.items.map((item) => {
            if (item.visible.includes(role)) {
              return (
                <Link
                  href={item.href}
                  key={item.label}
                  className="flex items-center justify-center lg:justify-start gap-4 text-black font-medium py-2 md:px-2 rounded-md hover:bg-lamaSkyLight"
                >
                  <Image src={item.icon} alt="" width={20} height={20} />
                  <span className="hidden lg:block">{item.label}</span>
                </Link>
              );
            }
          })}
        </div>
      ))}
    </div>
  );
};

export default Menu;

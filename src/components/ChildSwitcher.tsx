"use client"; // 1. Convert to a Client Component to read the current URL

import { Student } from "@prisma/client";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { useTranslations } from "next-intl";

const ChildSwitcher = ({
  students,
  activeStudentId,
}: {
  students: Student[];
  activeStudentId?: string;
}) => {
  const t = useTranslations("parents");
  const pathname = usePathname();

  if (students.length === 0) {
    return (
      <Card className="p-5 text-center">
        <p className="text-gray-500 text-sm">{t("noChildrenLinked")}</p>
      </Card>
    );
  }

  const currentStudentId = activeStudentId || students[0]?.id;

  return (
    <Card className="p-5">
      <h2 className="text-section-title font-bold text-gray-900 mb-3">{t("yourChildren")}</h2>
      <div className="flex flex-wrap gap-4">
        {students.map((child) => {
          const isActive = child.id === currentStudentId;
          const href = `${pathname}?studentId=${child.id}`;
          return (
            <Link
              href={href}
              key={child.id}
              className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                isActive
                  ? "bg-primary/5 border-primary shadow-sm"
                  : "bg-surface-subtle border-border hover:border-primary/40"
              }`}
            >
              <Image
                src="/noAvatar.png"
                alt={child.name}
                width={40}
                height={40}
                className="rounded-full border border-border"
              />
              <div>
                <p
                  className={`text-sm font-bold ${
                    isActive ? "text-primary" : "text-gray-800"
                  }`}
                >
                  {child.name}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </Card>
  );
};

export default ChildSwitcher;

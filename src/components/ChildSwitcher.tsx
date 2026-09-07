"use client"; // 1. Convert to a Client Component to read the current URL

import { Student } from "@prisma/client";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation"; // 2. Import the usePathname hook

const ChildSwitcher = ({
  students,
  activeStudentId,
}: {
  students: Student[];
  activeStudentId?: string;
}) => {
  const pathname = usePathname(); // 3. Get the current page's path (e.g., /list/results)

  if (students.length === 0) {
    return (
      <div className="bg-white p-4 rounded-md text-center">
        <p className="text-gray-600">لا يوجد طلاب مرتبطون بهذا الحساب.</p>
      </div>
    );
  }

  const currentStudentId = activeStudentId || students[0]?.id;

  return (
    <div className="bg-white p-4 rounded-md">
      <h2 className="text-lg font-semibold mb-3">أبناؤك</h2>
      <div className="flex flex-wrap gap-4">
        {students.map((child) => {
          const isActive = child.id === currentStudentId;
          // 4. Construct the link dynamically using the current path
          const href = `${pathname}?studentId=${child.id}`;
          return (
            <Link
              href={href}
              key={child.id}
              className={`flex items-center gap-3 p-3 rounded-lg border-2 transition-all ${
                isActive
                  ? "bg-blue-50 border-blue-500 shadow-sm"
                  : "bg-gray-50 border-transparent hover:border-gray-300"
              }`}
            >
              <Image
                src={child.img || "/noAvatar.png"}
                alt={`${child.name} ${child.surname}`}
                width={40}
                height={40}
                className="rounded-full"
              />
              <div>
                <p
                  className={`font-bold ${
                    isActive ? "text-blue-700" : "text-gray-800"
                  }`}
                >
                  {child.name} {child.surname}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
};

export default ChildSwitcher;

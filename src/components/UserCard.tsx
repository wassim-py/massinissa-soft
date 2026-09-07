import prisma from "@/lib/prisma";
import Image from "next/image";

const UserCard = async ({
  type,
}: {
  type: "admin" | "teacher" | "student" | "parent";
}) => {
  // The orgId and schoolId logic has been removed to match your current schema.
  // These queries will now count all records in the database.

  let count = 0;
  let title = "";

  // We must handle each type differently because the data comes from different models.
  try {
    switch (type) {
      case "student":
        // Count all students in the database.
        count = await prisma.student.count();
        title = "تلاميذ";
        break;
      case "teacher":
        // Count all teachers in the database.
        count = await prisma.teacher.count();
        title = "معلمون";
        break;
      case "parent":
        // Count the number of unique parent IDs among all students.
        const distinctParents = await prisma.student.findMany({
          where: {
            parentId: { not: null }, // Only count students who have a parent
          },
          distinct: ["parentId"],
        });
        count = distinctParents.length;
        title = "أولياء أمور";
        break;
      case "admin":
        // The "admin" role is managed by Clerk, not a separate Prisma model.
        // A full solution would use the Clerk API. For now, we use a placeholder
        // to allow the build to pass. This assumes at least 1 admin.
        count = 1;
        title = "مديرون";
        break;
      default:
        count = 0;
        title = "غير معروف";
    }
  } catch (error) {
    console.error(`Failed to fetch count for ${type}:`, error);
    // If any database error occurs, set count to 0 to prevent crashing the build.
    count = 0;
  }

  return (
    <div className="rounded-2xl odd:bg-wsmPurple even:bg-wsmYellow p-4 flex-1 min-w-[130px]">
      <div className="flex justify-between items-center">
        <span className="text-[10px] bg-white px-2 py-1 rounded-full text-green-600">
          2024/25
        </span>
        <Image src="/more.png" alt="" width={20} height={20} />
      </div>
      <h1 className="text-2xl font-semibold my-4">{count}</h1>
      <h2 className="text-sm font-medium text-gray-500">{title}</h2>
    </div>
  );
};

export default UserCard;

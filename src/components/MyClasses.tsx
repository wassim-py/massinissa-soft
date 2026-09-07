import prisma from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";
import Image from "next/image";

const MyClasses = async () => {
  const { userId } = await auth();
  if (!userId) return null;

  const classes = await prisma.class.findMany({
    where: {
      teachers: {
        some: {
          id: userId,
        },
      },
    },
    include: {
      _count: {
        select: { students: true },
      },
    },
    orderBy: {
      name: "asc",
    },
  });

  // Define a color palette to cycle through for the class cards
  const colors = [
    "bg-lamaSkyLight",
    "bg-lamaPurpleLight",
    "bg-lamaYellowLight",
    "bg-red-100",
  ];

  return (
    <div className="bg-white p-4 rounded-md">
      <h1 className="text-xl font-semibold mb-4">أقسامي</h1>
      {classes.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {classes.map((classItem, index) => (
            <div
              key={classItem.id}
              className={`p-4 rounded-lg flex flex-col justify-between h-32 ${
                colors[index % colors.length]
              }`}
            >
              <div>
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-white rounded-md shadow-sm">
                    <Image
                      src="/class.png"
                      alt="class icon"
                      width={16}
                      height={16}
                    />
                  </div>
                  <p className="font-bold text-gray-800 text-lg">
                    {classItem.name}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-gray-600">
                  {classItem._count.students} تلميذ
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-500 text-center py-4">
          أنت غير معين لأي قسم.
        </p>
      )}
    </div>
  );
};

export default MyClasses;

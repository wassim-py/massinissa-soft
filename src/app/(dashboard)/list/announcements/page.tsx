import FormContainer from "@/components/FormContainer";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { auth } from "@clerk/nextjs/server";
import Image from "next/image";
import PageHeader from "@/components/PageHeader"; // ADDED



const AnnouncementCard = ({
  announcement,
  isPinned = false,
  role,
}: {
  announcement: any;
  isPinned?: boolean;
  role: string | undefined | null;
}) => {
  const audience =
    !announcement.classes || announcement.classes.length === 0
      ? "كل المدرسة"
      : announcement.classes.length === 1
      ? announcement.classes[0].name
      : `${announcement.classes.length} أقسام`;

  const cardClasses = isPinned
    ? "md:col-span-2 lg:col-span-3 bg-yellow-50 border-yellow-300"
    : "bg-white";

  return (
    <div
      className={`p-6 rounded-lg shadow-sm border flex flex-col ${cardClasses}`}
    >
      <div className="flex-grow">
        <div className="flex justify-between items-start mb-3">
          <h3
            className={`font-bold text-lg ${
              isPinned ? "text-yellow-900" : "text-gray-800"
            }`}
          >
            {announcement.title}
          </h3>
          <span
            className={`text-xs font-medium text-center px-2 py-1 rounded-full ${
              isPinned
                ? "bg-yellow-200 text-yellow-800"
                : "bg-gray-100 text-gray-800"
            }`}
          >
            {audience}
          </span>
        </div>
        <p
          className={`text-sm ${
            isPinned ? "text-gray-700" : "text-gray-600"
          } mb-4`}
        >
          {announcement.description}
        </p>
      </div>
      <div className="text-xs text-gray-500 border-t pt-3 flex justify-between items-center">
        <span>
          نشر في {new Date(announcement.date).toLocaleDateString("ar-DZ")}
        </span>
        {role === "admin" && (
          <div className="flex items-center gap-2">
            <FormContainer
              table="announcement"
              type="update"
              data={announcement}
            />
            <FormContainer
              table="announcement"
              type="delete"
              id={announcement.id}
            />
          </div>
        )}
      </div>
    </div>
  );
};

const AnnouncementListPage = async (
  props: {
    searchParams: Promise<{ search?: string }>;
  }
) => {
  const searchParams = await props.searchParams;
  const { userId, sessionClaims } = await auth();
  const role = (sessionClaims?.metadata as { role?: string })?.role;
  const currentUserId = userId;
  const { search } = searchParams;

  // --- Base Query for Role-based Filtering ---
  let roleQuery: Prisma.AnnouncementWhereInput = {};
  if (role !== "admin") {
    const userClasses = await prisma.class.findMany({
      where: {
        ...(role === "teacher" && { teachers: { some: { id: currentUserId! } } }),
        ...(role === "student" && { students: { some: { id: currentUserId! } } }),
        ...(role === "parent" && {
          students: { some: { parentId: currentUserId! } },
        }),
      },
      select: { id: true },
    });
    const userClassIds = userClasses.map((c) => c.id);

    roleQuery = {
      OR: [
        { classes: { none: {} } },
        { classes: { some: { id: { in: userClassIds } } } },
      ],
    };
  }

  // --- Search Query ---
  let searchQuery: Prisma.AnnouncementWhereInput = {};
  if (search) {
    searchQuery = {
      OR: [
        { title: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ],
    };
  }

  // --- Fetch Pinned and Regular Announcements Separately ---
  const [pinnedAnnouncements, regularAnnouncements] = await prisma.$transaction([
    prisma.announcement.findMany({
      where: {
        isPinned: true,
        AND: [roleQuery, searchQuery],
      },
      include: {
        classes: { select: { name: true, id: true } },
      },
      orderBy: { date: "desc" },
    }),
    prisma.announcement.findMany({
      where: {
        isPinned: false,
        AND: [roleQuery, searchQuery],
      },
      include: {
        classes: { select: { name: true, id: true } },
      },
      orderBy: { date: "desc" },
    }),
  ]);

  const totalAnnouncements =
    pinnedAnnouncements.length + regularAnnouncements.length;

  return (
    <div className="p-4 md:p-6">
      <PageHeader
        title="الإعلانات"
        searchPlaceholder="البحث بالعنوان أو الوصف..."
        createAction={
          role === "admin" ? { table: "announcement", type: "create" } : null
        }
      />

      {totalAnnouncements === 0 ? (
        <div className="text-center py-16 px-4 border-2 border-dashed rounded-lg mt-8">
          <Image
            src="/announcement.png"
            alt="No announcements"
            width={64}
            height={64}
            className="mx-auto opacity-50"
          />
          <h2 className="text-xl font-semibold text-gray-700 mt-4">
            لم يتم العثور على إعلانات
          </h2>
          <p className="text-gray-500 mt-2">
            {search
              ? `بحثك عن "${search}" لم يطابق أي إعلانات.`
              : "لا توجد إعلانات لعرضها في الوقت الحالي."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-8">
          {pinnedAnnouncements.map((announcement) => (
            <AnnouncementCard
              key={announcement.id}
              announcement={announcement}
              isPinned={true}
              role={role}
            />
          ))}
          {regularAnnouncements.map((announcement) => (
            <AnnouncementCard
              key={announcement.id}
              announcement={announcement}
              role={role}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default AnnouncementListPage;

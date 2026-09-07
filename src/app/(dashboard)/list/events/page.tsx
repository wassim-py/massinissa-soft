import FormContainer from "@/components/FormContainer";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import Image from "next/image";
import PageHeader from "@/components/PageHeader"; // ADDED



// Helper function to format dates for display
const formatEventDate = (start: Date, end: Date) => {
  const options: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  };
  const startDate = new Intl.DateTimeFormat("ar-DZ", options).format(start);
  const endTime = new Intl.DateTimeFormat("ar-DZ", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(end);
  return `${startDate} - ${endTime}`;
};

// Helper function to categorize events
const categorizeEvents = (events: any[]) => {
  const now = new Date();
  const today = new Date(now.setHours(0, 0, 0, 0));
  const endOfToday = new Date(new Date().setHours(23, 59, 59, 999));

  const categories = {
    today: [] as any[],
    upcoming: [] as any[],
  };

  events.forEach((event) => {
    const eventDate = new Date(event.startTime);
    if (eventDate >= today && eventDate <= endOfToday) {
      categories.today.push(event);
    } else if (eventDate > endOfToday) {
      categories.upcoming.push(event);
    }
  });

  return categories;
};

const EventCard = ({
  event,
  role,
}: {
  event: any;
  role: string | undefined | null;
}) => {
  const getAudienceInfo = () => {
    if (!event.classes || event.classes.length === 0) {
      return { text: "كل المدرسة", color: "bg-purple-100 text-purple-800" };
    }
    if (event.classes.length === 1) {
      return { text: event.classes[0].name, color: "bg-blue-100 text-blue-800 text-center" };
    }
    return {
      text: `${event.classes.length} أقسام`,
      color: "bg-blue-100 text-blue-800",
    };
  };

  const audience = getAudienceInfo();

  return (
    <div className="bg-white p-5 rounded-lg shadow-sm border border-gray-200 flex flex-col justify-between">
      <div>
        <div className="flex justify-between items-start mb-2">
          <h3 className="font-bold text-lg text-gray-800">{event.title}</h3>
          <span
            className={`text-xs font-semibold px-2 py-1 rounded-full ${audience.color}`}
          >
            {audience.text}
          </span>
        </div>
        <p className="text-sm text-gray-500 mb-4">{event.description}</p>
      </div>
      <div className="text-xs text-gray-600 border-t pt-3 flex justify-between items-center">
        <span>{formatEventDate(event.startTime, event.endTime)}</span>
        {role === "admin" && (
          <div className="flex items-center gap-2">
            <FormContainer table="event" type="update" data={event} />
            <FormContainer table="event" type="delete" id={event.id} />
          </div>
        )}
      </div>
    </div>
  );
};

const EventSection = ({
  title,
  events,
  role,
}: {
  title: string;
  events: any[];
  role: string | undefined | null;
}) => {
  if (events.length === 0) return null;
  return (
    <section className="mb-8">
      <h2 className="text-xl font-semibold text-gray-700 mb-4 pb-2 border-b">
        {title}
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {events.map((event) => (
          <EventCard key={event.id} event={event} role={role} />
        ))}
      </div>
    </section>
  );
};

const EventListPage = async (
  props: {
    searchParams: Promise<{ search?: string }>;
  }
) => {
  const searchParams = await props.searchParams;
  const { userId, sessionClaims } = await auth();
  const role = (sessionClaims?.metadata as { role?: string })?.role;
  const currentUserId = userId;
  const { search } = searchParams;

  // --- Build Base Query ---
  let where: Prisma.EventWhereInput = {
    startTime: {
      gte: new Date(),
    },
  };

  // --- Role-based Filtering ---
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

    where.OR = [
      { classes: { none: {} } },
      { classes: { some: { id: { in: userClassIds } } } },
    ];
  }

  // --- Search Filtering ---
  if (search) {
    where.AND = [
      {
        OR: [
          { title: { contains: search, mode: "insensitive" } },
          { description: { contains: search, mode: "insensitive" } },
        ],
      },
    ];
  }

  const events = await prisma.event.findMany({
    where,
    include: {
      classes: { select: { name: true, id: true } },
    },
    orderBy: {
      startTime: "asc",
    },
  });

  const { today, upcoming } = categorizeEvents(events);

  return (
    <div className="p-4 md:p-6">
      {/* REPLACED: The old header is now the new, reusable PageHeader component */}
      <PageHeader
        title="الأحداث القادمة"
        searchPlaceholder="ابحث بعنوان أو وصف..."
        createAction={
          role === "admin" ? { table: "event", type: "create" } : null
        }
      />

      {events.length > 0 ? (
        <div className="mt-8">
          <EventSection title="تحدث اليوم" events={today} role={role} />
          <EventSection title="قريباً" events={upcoming} role={role} />
        </div>
      ) : (
        <div className="text-center py-16 px-4 border-2 border-dashed rounded-lg mt-8">
          <Image
            src="/calendar.png"
            alt="No events"
            width={64}
            height={64}
            className="mx-auto opacity-50"
          />
          <h2 className="text-xl font-semibold text-gray-700 mt-4">
            لا توجد احداث قادمة
          </h2>
          <p className="text-gray-500 mt-2">
            {search
              ? `لم يتم العثور على نتائج لـ "${search}". حاول بكلمة مختلفة.`
              : "الرجاء العودة لاحقاً للاطلاع على الفعاليات الجديدة والإعلانات."}
          </p>
        </div>
      )}
    </div>
  );
};

export default EventListPage;

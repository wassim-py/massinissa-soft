import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";

const UpcomingEvents = async () => {
  const { userId } = await auth();
  if (!userId) return null;

  // Fetch upcoming events relevant to the teacher
  const upcomingEvents = await prisma.event.findMany({
    where: {
      startTime: {
        gte: new Date(), // Only show future events
      },
      OR: [
        { classes: { none: {} } }, // School-wide events
        { classes: { some: { teachers: { some: { id: userId } } } } }, // Events for their classes
      ],
    },
    include: {
      classes: {
        select: { name: true },
      },
    },
    orderBy: {
      startTime: "asc",
    },
    take: 4, // Show up to 4 upcoming events
  });

  return (
    <div className="bg-white p-4 rounded-md">
      <h1 className="text-xl font-semibold mb-4">الأحداث القادمة</h1>
      <div className="space-y-4">
        {upcomingEvents.length > 0 ? (
          upcomingEvents.map((event) => (
            <div key={event.id} className="flex items-start gap-4">
              <div className="flex flex-col items-center justify-center bg-red-100 text-red-700 font-bold p-2 rounded-lg w-14">
                <span className="text-sm">
                  {new Date(event.startTime).toLocaleString("en-GB", {
                    month: "short",
                  })}
                </span>
                <span className="text-xl">
                  {new Date(event.startTime).getDate()}
                </span>
              </div>
              <div>
                <p className="font-bold text-gray-800">{event.title}</p>
                {/* ADDED: Display the full date and time of the event */}
                <p className="text-xs text-gray-500">
                  {new Date(event.startTime).toLocaleDateString("en-GB")} على
                  الساعة{" "}
                  {new Date(event.startTime).toLocaleTimeString("en-GB", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  {event.classes.map((c) => c.name).join(", ") ||
                    "حدث على مستوى المدرسة"}
                </p>
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm text-gray-500 text-center py-4">
            لا توجد أحداث قادمة.
          </p>
        )}
      </div>
    </div>
  );
};

export default UpcomingEvents;

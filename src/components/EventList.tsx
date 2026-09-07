import prisma from "@/lib/prisma";
import { Event } from "@prisma/client"; // Import the Event type from Prisma

const EventList = async ({ dateParam }: { dateParam: string | undefined }) => {
  // FIX: Explicitly type the 'events' array to be an array of Event objects.
  let events: Event[] = []; // Initialize with an empty array as a fallback

  try {
    const date = dateParam ? new Date(dateParam) : new Date();

    // The database query is now safely inside a try...catch block
    events = await prisma.event.findMany({
      where: {
        startTime: {
          gte: new Date(date.setHours(0, 0, 0, 0)),
          lte: new Date(date.setHours(23, 59, 59, 999)),
        },
      },
    });
  } catch (error) {
    // If the database query fails, log the error and allow the component
    // to render with an empty list of events, preventing a build crash.
    console.error("Failed to fetch event data:", error);
  }

  // If there are no events, render a message in Arabic.
  if (events.length === 0) {
    return (
      <div className="text-center text-gray-500 p-4">
        لا توجد أحداث لهذا اليوم.
      </div>
    );
  }

  // If events exist, map over them.
  return events.map((event) => (
    <div
      className="p-5 rounded-md border-2 border-gray-100 border-t-4 odd:border-t-lamaSky even:border-t-lamaPurple"
      key={event.id}
    >
      <div className="flex items-center justify-between">
        <h1 className="font-semibold text-gray-600">{event.title}</h1>
        <span className="text-gray-300 text-xs">
          {event.startTime.toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          })}
        </span>
      </div>
      <p className="mt-2 text-gray-400 text-sm">{event.description}</p>
    </div>
  ));
};

export default EventList;

"use client";

import { Calendar, momentLocalizer, View, Views } from "react-big-calendar";
import moment from "moment";
// Import the French locale data so moment's "L" (DD/MM/YYYY) and "LT" (HH:mm,
// 24-hour) token formats resolve deterministically instead of moment's built-in
// "en" default, which renders MM/DD/YYYY and 12-hour AM/PM.
import "moment/locale/fr";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { useState, useEffect, useMemo } from "react";
import { getAlgiersDateInfo } from "@/lib/algiersDate";

// Pin the locale globally AND per-calendar (culture prop) so DD/MM/YYYY holds on
// any browser/server regardless of the host default locale.
moment.locale("fr");
const localizer = momentLocalizer(moment);
const CALENDAR_CULTURE = "fr";

const BigCalendar = ({
  data,
}: {
  data: { title: string; start: Date | string; end: Date | string; isFree?: boolean; isExtra?: boolean; isCatchUp?: boolean }[];
}) => {
  const [view, setView] = useState<View>(Views.WORK_WEEK);

  // Anchor calendar events strictly to Algiers time on ANY client browser without hydration mismatch
  const normalizedEvents = useMemo(() => {
    return (data || []).map((event) => {
      const sInfo = getAlgiersDateInfo(event.start);
      const eInfo = getAlgiersDateInfo(event.end);

      // Construct Date with local fields matching Algiers time exactly
      const localStart = new Date(sInfo.year, sInfo.month - 1, sInfo.day, sInfo.hour, sInfo.minute, sInfo.second || 0);
      const localEnd = new Date(eInfo.year, eInfo.month - 1, eInfo.day, eInfo.hour, eInfo.minute, eInfo.second || 0);

      return {
        ...event,
        start: localStart,
        end: localEnd,
      };
    });
  }, [data]);

  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 640) {
      setView(Views.DAY);
    }
  }, []);

  const handleOnChangeView = (selectedView: View) => {
    setView(selectedView);
  };

  const eventPropGetter = (event: any) => {
    if (event.isFree) {
      return {
        style: {
          backgroundColor: "#059669", // emerald-600
          borderColor: "#047857",
          color: "#ffffff",
          borderRadius: "6px",
          borderWidth: "2px",
          fontWeight: "600",
        },
      };
    }
    if (event.isExtra) {
      return {
        style: {
          backgroundColor: "#7c3aed", // purple-600
          borderColor: "#6d28d9",
          color: "#ffffff",
          borderRadius: "6px",
          borderWidth: "2px",
          fontWeight: "600",
        },
      };
    }
    if (event.isCatchUp) {
      return {
        style: {
          backgroundColor: "#d97706", // amber-600
          borderColor: "#b45309",
          color: "#ffffff",
          borderRadius: "6px",
          borderWidth: "2px",
          fontWeight: "600",
        },
      };
    }
    return {
      style: {
        backgroundColor: "#2563eb", // blue-600
        borderColor: "#1d4ed8",
        color: "#ffffff",
        borderRadius: "6px",
      },
    };
  };

  return (
    <Calendar
      localizer={localizer}
      events={normalizedEvents}
      startAccessor="start"
      endAccessor="end"
      views={["work_week", "day"]}
      view={view}
      style={{ height: "98%" }}
      onView={handleOnChangeView}
      eventPropGetter={eventPropGetter}
      culture={CALENDAR_CULTURE}
      min={new Date(2025, 1, 0, 8, 0, 0)}
      max={new Date(2025, 1, 0, 17, 0, 0)}
    />
  );
};

export default BigCalendar;

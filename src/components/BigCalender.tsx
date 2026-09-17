"use client";

import { Calendar, momentLocalizer, View, Views } from "react-big-calendar";
import moment from "moment";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { useState, useEffect } from "react";

const localizer = momentLocalizer(moment);

const BigCalendar = ({
  data,
}: {
  data: { title: string; start: Date; end: Date }[];
}) => {
  const [view, setView] = useState<View>(Views.WORK_WEEK);

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
      events={data}
      startAccessor="start"
      endAccessor="end"
      views={["work_week", "day"]}
      view={view}
      style={{ height: "98%" }}
      onView={handleOnChangeView}
      eventPropGetter={eventPropGetter}
      min={new Date(2025, 1, 0, 8, 0, 0)}
      max={new Date(2025, 1, 0, 17, 0, 0)}
    />
  );
};

export default BigCalendar;

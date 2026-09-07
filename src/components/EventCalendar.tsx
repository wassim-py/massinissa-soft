"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css";

type ValuePiece = Date | null;

type Value = ValuePiece | [ValuePiece, ValuePiece];

const EventCalendar = () => {
  const [value, onChange] = useState<Value>(new Date());

  const router = useRouter();

  const handleDateChange = (val: Value) => {
    onChange(val);
    if (val instanceof Date) {
      router.push(`?date=${val.toISOString()}`);
    }
  };

  return (
    <Calendar
      onChange={handleDateChange}
      value={value}
      locale="ar-DZ" // Set the calendar language to Algerian Arabic
    />
  );
};

export default EventCalendar;

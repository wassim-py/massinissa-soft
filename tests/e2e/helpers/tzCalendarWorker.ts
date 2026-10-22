import { getAlgiersDateInfo } from "../../../src/lib/algiersDate";

const testEvents = [
  { id: "sat_morning", title: "Math", start: "2026-10-24T07:00:00.000Z", end: "2026-10-24T08:30:00.000Z" }, // 08:00 - 09:30 Algiers
  { id: "thu_evening", title: "Physics", start: "2026-10-22T16:30:00.000Z", end: "2026-10-22T18:00:00.000Z" }, // 17:30 - 19:00 Algiers
  { id: "fri_noon", title: "Arabic", start: "2026-10-23T11:00:00.000Z", end: "2026-10-23T12:00:00.000Z" }, // 12:00 - 13:00 Algiers
  { id: "mid_night", title: "Night Prep", start: "2026-10-20T23:30:00.000Z", end: "2026-10-21T01:00:00.000Z" }, // 00:30 - 02:00 Algiers
];

const results = testEvents.map((event) => {
  const sInfo = getAlgiersDateInfo(event.start);
  const eInfo = getAlgiersDateInfo(event.end);
  const localStart = new Date(sInfo.year, sInfo.month - 1, sInfo.day, sInfo.hour, sInfo.minute, sInfo.second || 0);
  const localEnd = new Date(eInfo.year, eInfo.month - 1, eInfo.day, eInfo.hour, eInfo.minute, eInfo.second || 0);

  return {
    id: event.id,
    startHour: localStart.getHours(),
    startMin: localStart.getMinutes(),
    startDay: localStart.getDate(),
    startMonth: localStart.getMonth() + 1,
    startYear: localStart.getFullYear(),
    endHour: localEnd.getHours(),
    endMin: localEnd.getMinutes(),
    expectedStartHour: sInfo.hour,
    expectedStartMin: sInfo.minute,
    expectedEndHour: eInfo.hour,
    expectedEndMin: eInfo.minute,
    durationMs: localEnd.getTime() - localStart.getTime(),
  };
});

console.log(JSON.stringify(results));

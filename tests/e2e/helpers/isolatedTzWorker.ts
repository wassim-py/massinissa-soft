import { getAlgiersDateInfo, formatAlgiersDateTime, getAlgiersDayBounds, normalizeDateToAlgiersStartOfDay, formatNumber, formatDZD } from "../../../src/lib/algiersDate";

const d1 = getAlgiersDateInfo("2026-10-21 14:30:00");
const d2 = getAlgiersDateInfo("2026-10-21T00:30:00");
const f1 = formatAlgiersDateTime("2026-10-21 14:30:00");
const f2 = formatAlgiersDateTime("2026-10-21T00:30:00");
const b1 = getAlgiersDayBounds("2026-10-21 14:30:00");
const b2 = getAlgiersDayBounds("2026-10-21T00:30:00");
const n1 = normalizeDateToAlgiersStartOfDay("2026-10-21 14:30:00");
const n2 = normalizeDateToAlgiersStartOfDay("2026-10-21T00:30:00");
const numZero = formatNumber(100.1 - 100 - 0.1);
const dzdZero = formatDZD(100.1 - 100 - 0.1);

console.log(JSON.stringify({
  d1: d1.dateStr + " " + d1.timeStr,
  d2: d2.dateStr + " " + d2.timeStr,
  f1,
  f2,
  b1Start: b1.startUtc.toISOString(),
  b1End: b1.endUtc.toISOString(),
  b2Start: b2.startUtc.toISOString(),
  b2End: b2.endUtc.toISOString(),
  n1: n1.toISOString(),
  n2: n2.toISOString(),
  numZero,
  dzdZero,
}));

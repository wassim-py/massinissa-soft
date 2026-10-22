/**
 * Timezone Simulation Helper
 * Evaluates functions under simulated client environment conditions.
 */

export const SIMULATED_TIMEZONES = [
  "UTC",
  "Africa/Algiers",     // Target: UTC+1
  "Europe/Paris",       // UTC+1 winter, UTC+2 summer
  "America/New_York",   // UTC-5 winter, UTC-4 summer
  "Asia/Riyadh",        // UTC+3
  "Asia/Tokyo",         // UTC+9
  "Pacific/Auckland",   // UTC+12/+13
] as const;

export function evaluateWithTimezone<T>(tz: string, fn: () => T): T {
  const originalTz = process.env.TZ;
  try {
    process.env.TZ = tz;
    return fn();
  } finally {
    if (originalTz !== undefined) {
      process.env.TZ = originalTz;
    } else {
      delete process.env.TZ;
    }
  }
}

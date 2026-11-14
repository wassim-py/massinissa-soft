export const ATTENDANCE_UPDATED_EVENT = "massinissa:attendance_updated";
export const ATTENDANCE_BROADCAST_CHANNEL = "massinissa_attendance_channel";

export interface AttendanceChangeDetail {
  lessonId?: number;
  source?: string;
  ts?: number;
}

/**
 * Emits both a same-tab custom DOM event and a cross-tab BroadcastChannel message
 * whenever attendance or catch-up records change so live views (e.g. TodayAttendanceChart)
 * refresh immediately without requiring a full page reload.
 */
export function notifyAttendanceChanged(detail: AttendanceChangeDetail = {}): void {
  if (typeof window === "undefined") return;

  const payload: AttendanceChangeDetail = {
    ...detail,
    ts: detail.ts ?? Date.now(),
  };

  try {
    window.dispatchEvent(
      new CustomEvent<AttendanceChangeDetail>(ATTENDANCE_UPDATED_EVENT, {
        detail: payload,
      })
    );
  } catch {
    // Ignore DOM dispatch errors in non-standard environments
  }

  try {
    if ("BroadcastChannel" in window) {
      const channel = new BroadcastChannel(ATTENDANCE_BROADCAST_CHANNEL);
      channel.postMessage(payload);
      channel.close();
    }
  } catch {
    // Ignore BroadcastChannel errors (e.g. private/restricted contexts)
  }
}

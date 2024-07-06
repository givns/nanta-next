// utils/timeUtils.ts

export function isWithinAllowedTimeRange(
  checkTime: Date,
  shiftStart: Date,
  shiftEnd: Date,
  allowedMinutesBefore: number = 30,
  allowedMinutesAfter: number = 30,
): boolean {
  const earliestAllowed = new Date(
    shiftStart.getTime() - allowedMinutesBefore * 60000,
  );
  const latestAllowed = new Date(
    shiftEnd.getTime() + allowedMinutesAfter * 60000,
  );

  return checkTime >= earliestAllowed && checkTime <= latestAllowed;
}

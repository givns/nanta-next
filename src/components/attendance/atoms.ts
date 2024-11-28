// atoms.ts
import { atom } from 'jotai';
import { AttendanceStatusInfo, LocationState } from '@/types/attendance';

export const locationAtom = atom<LocationState | null>(null);

export const attendanceAtom = atom<AttendanceStatusInfo | null>(null);

// Derived atom for attendance loading state
export const attendanceLoadingAtom = atom((get) => {
  const attendance = get(attendanceAtom);
  return !attendance;
});

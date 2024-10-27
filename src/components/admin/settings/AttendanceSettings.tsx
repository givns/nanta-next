// components/admin/settings/AttendanceSettings.tsx
interface AttendanceSettingsData {
  rules: {
    lateThresholdMinutes: number;
    earlyCheckoutThresholdMinutes: number;
    halfDayAbsenceMinutes: number;
    requiredWorkingHours: number;
    graceMinutes: number;
  };
  locations: {
    premises: Array<{
      name: string;
      lat: number;
      lng: number;
      radius: number;
    }>;
  };
  shifts: Array<{
    code: string;
    name: string;
    startTime: string;
    endTime: string;
    workDays: number[];
  }>;
}

export default function AttendanceSettings() {
  // Similar structure to PayrollSettings
  // Add settings for attendance rules, locations, and shifts
}

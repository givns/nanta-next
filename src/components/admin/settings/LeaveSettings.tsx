// components/admin/settings/LeaveSettings.tsx
interface LeaveSettingsData {
  entitlements: {
    sickLeave: {
      daysPerYear: number;
      carryOverDays: number;
      requiresNotice: boolean;
    };
    annualLeave: {
      daysPerYear: number;
      carryOverDays: number;
      minNoticeDays: number;
    };
    businessLeave: {
      daysPerYear: number;
      requiresApproval: boolean;
    };
  };
  holidays: Array<{
    date: string;
    name: string;
    localName: string;
  }>;
}

export default function LeaveSettings() {
  // Similar structure to PayrollSettings
  // Add settings for leave entitlements and holidays
}

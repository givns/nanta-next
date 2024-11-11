// config/routeTabs.ts
export interface RouteTab {
  value: string;
  label: string;
  href: string;
}

export interface RouteTabs {
  [key: string]: RouteTab[];
}

export const routeTabs: RouteTabs = {
  '/admin/attendance': [
    { value: 'daily', label: 'Daily Records', href: '/admin/attendance/daily' },
    {
      value: 'shifts',
      label: 'Shift Adjustments',
      href: '/admin/attendance/shifts',
    },
    {
      value: 'overtime',
      label: 'Overtime Requests',
      href: '/admin/attendance/overtime',
    },
  ],
  '/admin/leaves': [
    {
      value: 'requests',
      label: 'Leave Requests',
      href: '/admin/leaves/requests',
    },
    {
      value: 'holidays',
      label: 'Holiday Calendar',
      href: '/admin/leaves/holidays',
    },
    { value: 'nowork', label: 'No-Work Days', href: '/admin/leaves/nowork' },
  ],
} as const;

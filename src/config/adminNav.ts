// config/adminNav.ts
import {
  Users,
  Calendar,
  Settings,
  DollarSign,
  Clock,
  ClipboardCheck,
  LucideIcon,
} from 'lucide-react';

interface SubItem {
  label: string;
  href: string;
}

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  description: string;
  subItems?: SubItem[];
}

export const navItems: NavItem[] = [
  {
    label: 'Payroll',
    href: '/admin/payroll',
    icon: DollarSign,
    description: 'Manage employee payroll and compensation',
  },
  {
    label: 'Employees',
    href: '/admin/employees',
    icon: Users,
    description: 'Employee management and records',
  },
  {
    label: 'Leave & Holidays',
    href: '/admin/leaves',
    icon: Calendar,
    description: 'Leave management and holiday calendar',
    subItems: [
      { label: 'Leave Requests', href: '/admin/leaves/requests' },
      { label: 'Holiday Calendar', href: '/admin/leaves/holidays' },
      { label: 'No-Work Days', href: '/admin/leaves/nowork' },
    ],
  },
  {
    label: 'Attendance',
    href: '/admin/attendance',
    icon: Clock,
    description: 'Time and attendance tracking',
    subItems: [
      { label: 'Daily Records', href: '/admin/attendance/daily' },
      { label: 'Shift Adjustments', href: '/admin/attendance/shifts' },
      { label: 'Overtime Requests', href: '/admin/attendance/overtime' },
    ],
  },
  {
    label: 'Approvals',
    href: '/admin/approvals',
    icon: ClipboardCheck,
    description: 'Pending approvals and requests',
  },
  {
    label: 'Settings',
    href: '/admin/settings',
    icon: Settings,
    description: 'System configuration',
  },
] as const;

export type { NavItem, SubItem };

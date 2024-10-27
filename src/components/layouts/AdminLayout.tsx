// components/layouts/AdminLayout.tsx

import { ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { AdminProvider, useAdmin } from '@/contexts/AdminContext';
import { DashboardSkeleton } from '@/components/dashboard/DashboardSkeleton';
import {
  Users,
  CalendarDays,
  Settings,
  DollarSign,
  Clock,
  LogOut,
} from 'lucide-react';

interface AdminLayoutProps {
  children: ReactNode;
}

function AdminLayoutContent({ children }: AdminLayoutProps) {
  const { user, isLoading, error } = useAdmin();
  const router = useRouter();
  const currentPath = router.pathname;

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  if (error || !user) {
    return null; // Will be redirected by AdminProvider
  }

  const navItems = [
    {
      label: 'Payroll Management',
      href: '/admin/payroll',
      icon: <DollarSign className="w-5 h-5" />,
    },
    {
      label: 'Employee Management',
      href: '/admin/employees',
      icon: <Users className="w-5 h-5" />,
    },
    {
      label: 'Leave Management',
      href: '/admin/leaves',
      icon: <CalendarDays className="w-5 h-5" />,
    },
    {
      label: 'Attendance',
      href: '/admin/attendance',
      icon: <Clock className="w-5 h-5" />,
    },
    {
      label: 'Settings',
      href: '/admin/settings',
      icon: <Settings className="w-5 h-5" />,
    },
  ];

  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              <div className="flex-shrink-0 flex items-center">
                <span className="text-xl font-bold">Admin Dashboard</span>
              </div>
              <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium ${
                      currentPath === item.href
                        ? 'border-indigo-500 text-gray-900'
                        : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                    }`}
                  >
                    {item.icon}
                    <span className="ml-2">{item.label}</span>
                  </Link>
                ))}
              </div>
            </div>
            <div className="hidden sm:ml-6 sm:flex sm:items-center">
              <button
                type="button"
                className="flex items-center text-gray-500 hover:text-gray-700"
                onClick={() => {
                  // Handle logout
                }}
              >
                <LogOut className="w-5 h-5" />
                <span className="ml-2">Logout</span>
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
export default function AdminLayout({ children }: AdminLayoutProps) {
  return (
    <AdminProvider>
      <AdminLayoutContent>{children}</AdminLayoutContent>
    </AdminProvider>
  );
}

// components/layouts/AdminLayout.tsx

import { ReactNode, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { AdminProvider, useAdmin } from '@/contexts/AdminContext';
import { DashboardSkeleton } from '@/components/dashboard/DashboardSkeleton';
import {
  Users,
  Calendar,
  Settings,
  DollarSign,
  Clock,
  LogOut,
  Menu,
  ClipboardCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useLiff } from '@/contexts/LiffContext';
import LoadingBar from '../LoadingBar';
import LoadingProgress from '../LoadingProgress';

interface AdminLayoutProps {
  children: ReactNode;
}

const navItems = [
  {
    label: 'Payroll',
    href: '/admin/payroll',
    icon: <DollarSign className="w-5 h-5" />,
    description: 'Manage employee payroll and compensation',
  },
  {
    label: 'Employees',
    href: '/admin/employees',
    icon: <Users className="w-5 h-5" />,
    description: 'Employee management and records',
  },
  {
    label: 'Leave & Holidays',
    href: '/admin/leaves',
    icon: <Calendar className="w-5 h-5" />,
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
    icon: <Clock className="w-5 h-5" />,
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
    icon: <ClipboardCheck className="w-5 h-5" />,
    description: 'Pending approvals and requests',
  },
  {
    label: 'Settings',
    href: '/admin/settings',
    icon: <Settings className="w-5 h-5" />,
    description: 'System configuration',
  },
];

function AdminLayoutContent({ children }: AdminLayoutProps) {
  const { user, isLoading, error } = useAdmin();
  const router = useRouter();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [openSubMenu, setOpenSubMenu] = useState<string | null>(null);
  const currentPath = router.pathname;

  // Show loading state while checking admin status
  if (isLoading) {
    return <LoadingProgress isLiffInitialized={true} isDataLoaded={false} />;
  }

  // Show unauthorized message if user is not an admin
  if (error || !user || !['Admin', 'SuperAdmin'].includes(user.role)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full px-6 py-8 bg-white shadow-md rounded-lg">
          <h1 className="text-xl font-semibold text-gray-900 text-center mb-4">
            ไม่สามารถเข้าถึงได้
          </h1>
          <p className="mt-2 text-gray-600 text-center">
            คุณไม่มีสิทธิ์ในการเข้าถึงส่วนนี้ กรุณาติดต่อผู้ดูแลระบบ
          </p>
          {error && (
            <p className="mt-4 text-sm text-red-600 text-center">{error}</p>
          )}
          <div className="mt-6 text-center">
            <Button
              variant="outline"
              onClick={() => router.push('/')}
              className="mx-auto"
            >
              กลับสู่หน้าหลัก
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const isCurrentPath = (path: string) => {
    if (path === '/admin') return currentPath === path;
    return currentPath.startsWith(path);
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Desktop Navigation */}
      <nav className="bg-white shadow-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            {/* Logo and Desktop Menu */}
            <div className="flex">
              <div className="flex-shrink-0 flex items-center">
                <span className="text-xl font-bold">Admin Dashboard</span>
              </div>
              <div className="hidden lg:ml-6 lg:flex lg:space-x-4">
                {navItems.map((item) => (
                  <div
                    key={item.href}
                    className="relative group"
                    onMouseEnter={() =>
                      item.subItems && setOpenSubMenu(item.label)
                    }
                    onMouseLeave={() => setOpenSubMenu(null)}
                  >
                    <Link
                      href={item.href}
                      className={`inline-flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors
                        ${
                          isCurrentPath(item.href)
                            ? 'bg-gray-100 text-gray-900'
                            : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                        }`}
                    >
                      {item.icon}
                      <span className="ml-2">{item.label}</span>
                    </Link>

                    {item.subItems && openSubMenu === item.label && (
                      <div className="absolute left-0 mt-2 w-56 bg-white rounded-md shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                        <div className="py-1" role="menu">
                          {item.subItems.map((subItem) => (
                            <Link
                              key={subItem.href}
                              href={subItem.href}
                              className={`block px-4 py-2 text-sm ${
                                isCurrentPath(subItem.href)
                                  ? 'bg-gray-100 text-gray-900'
                                  : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                              }`}
                              role="menuitem"
                            >
                              {subItem.label}
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Desktop User Menu */}
            <div className="hidden lg:ml-4 lg:flex lg:items-center">
              <div className="flex items-center">
                <span className="text-sm text-gray-500 mr-4">{user.name}</span>
              </div>
            </div>

            {/* Mobile menu button */}
            <div className="lg:hidden flex items-center">
              <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <Menu className="h-6 w-6" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-[300px] p-0">
                  {/* Mobile menu content remains the same */}
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  return <AdminLayoutContent>{children}</AdminLayoutContent>;
}

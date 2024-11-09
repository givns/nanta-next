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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

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

// Define tab configurations for specific routes
const routeTabs = {
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
};

function AdminLayoutContent({ children }: AdminLayoutProps) {
  const { user, isLoading, error } = useAdmin();
  const router = useRouter();
  const { lineUserId } = useLiff();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [openSubMenu, setOpenSubMenu] = useState<string | null>(null);
  const [isDesktop, setIsDesktop] = useState(false);
  const [isLiffBrowser, setIsLiffBrowser] = useState(true);
  const currentPath = router.pathname;

  // Detect if we're in a desktop browser or LIFF
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const checkEnvironment = () => {
        setIsDesktop(window.innerWidth >= 1024);
        // Check if we're in LINE's in-app browser
        setIsLiffBrowser(
          window.location.href.includes('liff.line.me') ||
            /Line/i.test(window.navigator.userAgent),
        );
      };

      checkEnvironment();
      window.addEventListener('resize', checkEnvironment);
      return () => window.removeEventListener('resize', checkEnvironment);
    }
  }, []);

  // Get current base route for tabs
  const baseRoute = `/${currentPath.split('/').slice(1, 3).join('/')}`;
  const currentTabs = routeTabs[baseRoute as keyof typeof routeTabs];

  // Get current tab value
  const getCurrentTabValue = () => {
    const pathParts = currentPath.split('/');
    return pathParts[pathParts.length - 1];
  };

  // Determine if we should show full navigation
  const showFullNavigation = isDesktop && !isLiffBrowser;

  if (isLoading) {
    return <LoadingProgress isLiffInitialized={true} isDataLoaded={false} />;
  }

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

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Show full navigation only on desktop browser */}
      {showFullNavigation && (
        <nav className="bg-white shadow-sm sticky top-0 z-50">
          {/* Your existing navigation code */}
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
                  <span className="text-sm text-gray-500 mr-4">
                    {user.name}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </nav>
      )}

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        {/* Sub-navigation tabs - shown on both desktop and mobile */}
        {currentTabs && (
          <div className="mb-6">
            <Tabs
              value={getCurrentTabValue()}
              className="w-full"
              onValueChange={(value) => {
                const tab = currentTabs.find((t) => t.value === value);
                if (tab) {
                  router.push(tab.href);
                }
              }}
            >
              <TabsList className="grid w-full grid-cols-3">
                {currentTabs.map((tab) => (
                  <TabsTrigger key={tab.value} value={tab.value}>
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
        )}

        {children}
      </main>
    </div>
  );
}

function isCurrentPath(path: string) {
  const router = useRouter();
  const currentPath = router.pathname;
  if (path === '/admin') return currentPath === path;
  return currentPath.startsWith(path);
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  return <AdminLayoutContent>{children}</AdminLayoutContent>;
}

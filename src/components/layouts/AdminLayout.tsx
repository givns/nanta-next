// components/layouts/AdminLayout.tsx

import { ReactNode, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAdmin } from '@/contexts/AdminContext';
import {
  Users,
  Calendar,
  Settings,
  DollarSign,
  Clock,
  ClipboardCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLiff } from '@/contexts/LiffContext';
import LoadingProgress from '@/components/LoadingProgress';
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

interface RouteTab {
  value: string;
  label: string;
  href: string;
}

interface RouteTabs {
  [key: string]: RouteTab[];
}

interface Environment {
  isDesktop: boolean;
  isLiffBrowser: boolean;
  isMounted: boolean;
}

const routeTabs: RouteTabs = {
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

function useEnvironment() {
  const [environment, setEnvironment] = useState({
    isDesktop: false,
    isLiffBrowser: true,
    isMounted: false,
  });

  useEffect(() => {
    const checkEnvironment = () => {
      const isLiff =
        window.location.href.includes('liff.line.me') ||
        /Line/i.test(window.navigator.userAgent) ||
        Boolean((window as any).liff?.isInClient?.());

      // Improved desktop detection
      const isMobileUserAgent =
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
          window.navigator.userAgent,
        );

      // Consider desktop if not a mobile device, regardless of window size
      const isDesktop = !isMobileUserAgent;

      setEnvironment({
        isDesktop,
        isLiffBrowser: isLiff,
        isMounted: true,
      });

      console.log('Environment Check:', {
        isDesktop,
        isLiff,
        isMobileDevice: isMobileUserAgent,
        width: window.innerWidth,
        url: window.location.href,
        userAgent: window.navigator.userAgent,
      });
    };

    checkEnvironment();
    window.addEventListener('resize', checkEnvironment);
    return () => window.removeEventListener('resize', checkEnvironment);
  }, []);

  return environment;
}

function AdminLayoutContent({ children }: AdminLayoutProps) {
  const { user, isLoading, error } = useAdmin();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [openSubMenu, setOpenSubMenu] = useState<string | null>(null);
  const env = useEnvironment();

  const currentPath = router.pathname;
  const baseRoute = `/${currentPath.split('/').slice(1, 3).join('/')}`;
  const currentTabs = routeTabs[baseRoute];
  const currentTabValue = currentPath.split('/').pop() || '';

  useEffect(() => {
    setMounted(true);
  }, []);

  // Don't render anything on server
  if (typeof window === 'undefined') {
    return null;
  }

  // Don't render until mounted
  if (!mounted) {
    return null;
  }

  // Helper function for determining current path
  const isCurrentPath = (path: string) => {
    if (path === '/admin') return currentPath === path;
    return currentPath.startsWith(path);
  };

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

  // Show navigation on desktop browsers (not in LIFF)
  const showNavigation = env.isMounted && env.isDesktop && !env.isLiffBrowser;

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Enhanced debug overlay */}
      {process.env.NODE_ENV === 'development' && (
        <div className="fixed bottom-0 right-0 bg-black/75 text-white p-2 z-50 text-xs">
          Mounted: {String(env.isMounted)}
          <br />
          Desktop Browser: {String(env.isDesktop)}
          <br />
          LIFF Environment: {String(env.isLiffBrowser)}
          <br />
          Show Navigation: {String(showNavigation)}
          <br />
          Window Width:{' '}
          {typeof window !== 'undefined' ? window.innerWidth : 'SSR'}
          <br />
          {typeof window !== 'undefined' && (
            <>
              Mobile Device:{' '}
              {String(
                /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
                  window.navigator.userAgent,
                ),
              )}
              <br />
              User Agent: {window.navigator.userAgent.slice(0, 50)}...
            </>
          )}
        </div>
      )}

      {showNavigation && (
        <nav className="bg-white shadow-sm sticky top-0 z-40">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-16">
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
                              : 'text-gray-500 hover:bg-gray-50 hover:text-indigo-900'
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
                                    : 'text-gray-700 hover:bg-grey-50 hover:text-indigo-900'
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

      <main
        className={`max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8 ${showNavigation ? 'mt-16' : ''}`}
      >
        {/* Sub-navigation tabs - shown on both desktop and mobile */}
        {currentTabs && (
          <div className="mb-6">
            <Tabs
              value={currentTabValue}
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

export default function AdminLayout({ children }: AdminLayoutProps) {
  return <AdminLayoutContent>{children}</AdminLayoutContent>;
}

import { ReactNode, useState } from 'react';
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

  // Check if route is active - including sub-items
  const isRouteActive = (href: string) => {
    // Exact match
    if (router.pathname === href) return true;
    // Check if it's a parent of current route
    if (href !== '/admin' && router.pathname.startsWith(href)) return true;
    return false;
  };

  // Get current page title
  const getCurrentPageTitle = () => {
    for (const item of navItems) {
      if (isRouteActive(item.href)) {
        return item.label;
      }
      if (item.subItems) {
        const activeSubItem = item.subItems.find((sub) =>
          isRouteActive(sub.href),
        );
        if (activeSubItem) {
          return `${item.label} - ${activeSubItem.label}`;
        }
      }
    }
    return 'Admin Dashboard';
  };

  if (error || !user) return null;

  return (
    <div className="admin-layout">
      {/* Desktop Navigation */}
      <nav className="admin-nav">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              <div className="flex-shrink-0 flex items-center">
                <span className="text-xl font-bold">
                  {getCurrentPageTitle()}
                </span>
              </div>
              <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
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
                      className={`inline-flex items-center px-3 py-2 text-sm font-medium ${
                        isRouteActive(item.href)
                          ? 'text-indigo-600 border-b-2 border-indigo-500'
                          : 'text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      {item.icon}
                      <span className="ml-2">{item.label}</span>
                    </Link>
                    {item.subItems && openSubMenu === item.label && (
                      <div className="absolute left-0 mt-2 w-48 bg-white rounded-md shadow-lg py-1 z-50">
                        {item.subItems.map((subItem) => (
                          <Link
                            key={subItem.href}
                            href={subItem.href}
                            className={`block px-4 py-2 text-sm ${
                              isRouteActive(subItem.href)
                                ? 'bg-gray-100 text-gray-900'
                                : 'text-gray-700 hover:bg-gray-50'
                            }`}
                          >
                            {subItem.label}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center">
              {/* User menu and logout */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  /* Handle logout */
                }}
                className="ml-4"
              >
                <LogOut className="w-5 h-5 mr-2" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile Navigation */}
      <nav className="mobile-nav">
        <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="md:hidden">
              <Menu className="h-6 w-6" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[300px] sm:w-[400px]">
            <nav className="flex flex-col gap-4">
              {navItems.map((item) => (
                <div key={item.href} className="space-y-2">
                  <Link
                    href={item.href}
                    className={`flex items-center p-2 rounded-lg ${
                      isRouteActive(item.href)
                        ? 'bg-gray-100 text-gray-900'
                        : 'text-gray-600 hover:bg-gray-50'
                    }`}
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    {item.icon}
                    <span className="ml-2">{item.label}</span>
                  </Link>
                  {item.subItems && (
                    <div className="ml-6 space-y-1">
                      {item.subItems.map((subItem) => (
                        <Link
                          key={subItem.href}
                          href={subItem.href}
                          className={`block px-4 py-2 text-sm rounded ${
                            isRouteActive(subItem.href)
                              ? 'bg-gray-50 text-gray-900'
                              : 'text-gray-600 hover:bg-gray-50'
                          }`}
                          onClick={() => setIsMobileMenuOpen(false)}
                        >
                          {subItem.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </nav>
          </SheetContent>
        </Sheet>
        <div className="flex-1 flex items-center justify-center">
          <span className="text-lg font-semibold">{getCurrentPageTitle()}</span>
        </div>
      </nav>

      {/* Main Content */}
      <main className="admin-content">{children}</main>
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

// components/layouts/AdminLayout.tsx
import { ReactNode } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/hooks/useAuth';
import { useEnvironment } from '@/hooks/useEnvironment';
import { AdminDesktopNav } from '@/components/admin/AdminDesktopNav';
import { AdminMobileTabs } from '@/components/admin/AdminMobileTabs';
import { routeTabs } from '@/config/routeTabs';
import DashboardSkeleton from '../dashboard/DashboardSkeleton';

interface AdminLayoutProps {
  children: ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const { user, isLoading, isAuthorized, registrationStatus } = useAuth({
    required: true,
    requiredRoles: ['Admin', 'SuperAdmin'],
  });
  const router = useRouter();
  const env = useEnvironment();

  const currentPath = router.pathname;
  const baseRoute = `/${currentPath.split('/').slice(1, 3).join('/')}`;
  const currentTabs = routeTabs[baseRoute];
  const currentTabValue = currentPath.split('/').pop() || '';

  // Show navigation on desktop browsers (not in LIFF)
  const showNavigation = env.isMounted && env.isDesktop && !env.isLiffBrowser;
  // Show tabs only on mobile/LIFF
  const showTabs =
    env.isMounted && (!env.isDesktop || env.isLiffBrowser) && currentTabs;

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  // Redirect to registration if incomplete
  if (registrationStatus && !registrationStatus.isComplete) {
    router.replace('/register');
    return null;
  }

  // Handle unauthorized access
  if (!isAuthorized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full px-6 py-8 bg-white shadow-md rounded-lg">
          <h1 className="text-xl font-semibold text-gray-900 text-center mb-4">
            ไม่สามารถเข้าถึงได้
          </h1>
          <p className="mt-2 text-gray-600 text-center">
            คุณไม่มีสิทธิ์ในการเข้าถึงส่วนนี้ กรุณาติดต่อผู้ดูแลระบบ
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {showNavigation && user && <AdminDesktopNav userName={user.name} />}

      <main
        className={`max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8 ${showNavigation ? 'mt-16' : ''}`}
      >
        {showTabs && (
          <AdminMobileTabs
            currentTabs={currentTabs}
            currentTabValue={currentTabValue}
          />
        )}
        {children}
      </main>
    </div>
  );
}

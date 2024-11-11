import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { AdminProvider } from '@/contexts/AdminContext';
import { useLiff } from '@/contexts/LiffContext';
import { DashboardSkeleton } from '@/components/dashboard/DashboardSkeleton';
import type { NextPage } from 'next';

export function withAdminAuth<P extends JSX.IntrinsicAttributes>(
  WrappedComponent: NextPage<P>,
): NextPage<P> {
  const WithAdminAuthComponent: NextPage<P> = (props) => {
    const router = useRouter();
    const { lineUserId, isInitialized } = useLiff();

    useEffect(() => {
      if (isInitialized && !lineUserId) {
        router.replace('/register');
      }
    }, [isInitialized, lineUserId, router]);

    if (!isInitialized || !lineUserId) {
      return <DashboardSkeleton />;
    }

    return (
      <AdminProvider>
        <WrappedComponent {...props} />
      </AdminProvider>
    );
  };

  // Copy static methods and display name
  WithAdminAuthComponent.displayName = `withAdminAuth(${getDisplayName(WrappedComponent)})`;

  return WithAdminAuthComponent;
}

// Helper function to get component display name
function getDisplayName<P>(WrappedComponent: NextPage<P>): string {
  return WrappedComponent.displayName || WrappedComponent.name || 'Component';
}

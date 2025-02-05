// pages/admin/attendance/shifts.tsx
import React, { Suspense } from 'react';
import { Card } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import dynamic from 'next/dynamic';
import { ErrorBoundary } from 'react-error-boundary';

// Loading fallback component
const LoadingSpinner = () => (
  <div className="flex justify-center items-center p-8">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
  </div>
);

// Error fallback component
function ErrorFallback({ error }: { error: Error }) {
  return (
    <div className="p-4">
      <Alert variant="destructive">
        <AlertTitle>Something went wrong</AlertTitle>
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>
    </div>
  );
}

// Dynamically import components
const ShiftAdjustmentDashboard = dynamic(
  () => import('@/components/admin/attendance/ShiftAdjustmentDashboard'),
  { loading: () => <LoadingSpinner /> },
);

const ShiftPatternManagement = dynamic(
  () => import('@/components/admin/attendance/ShiftPatternManagement'),
  { loading: () => <LoadingSpinner /> },
);

export default function ShiftsPage() {
  const { isLoading: authLoading, isAuthorized } = useAuth({
    required: true,
    requiredRoles: ['Admin', 'SuperAdmin'],
  });

  if (authLoading) {
    return <LoadingSpinner />;
  }

  if (!isAuthorized) {
    return (
      <div className="p-4">
        <Alert variant="destructive">
          <AlertTitle>Access Denied</AlertTitle>
          <AlertDescription>
            คุณไม่มีสิทธิ์ในการเข้าถึงส่วนนี้ กรุณาติดต่อผู้ดูแลระบบ
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-bold">Shift Management</h1>
        <p className="text-gray-500">
          Manage employee shift assignments and patterns
        </p>
      </div>

      <ErrorBoundary FallbackComponent={ErrorFallback}>
        <Suspense fallback={<LoadingSpinner />}>
          <Card className="p-6">
            <Tabs defaultValue="adjustments">
              <TabsList className="grid w-full grid-cols-1 md:grid-cols-2">
                <TabsTrigger value="adjustments">Shift Adjustments</TabsTrigger>
                <TabsTrigger value="patterns">Shift Patterns</TabsTrigger>
              </TabsList>

              <TabsContent value="adjustments" className="mt-6">
                <ShiftAdjustmentDashboard />
              </TabsContent>

              <TabsContent value="patterns" className="mt-6">
                <ShiftPatternManagement />
              </TabsContent>
            </Tabs>
          </Card>
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}

// components/dashboard/DashboardSkeleton.tsx
import { FC } from 'react';
import { Card, CardContent } from '@/components/ui/card';

export const DashboardSkeleton: FC = () => {
  return (
    <div className="w-full max-w-7xl mx-auto p-6 space-y-6">
      {/* Header Skeleton */}
      <div className="flex justify-between items-center">
        <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
        <div className="flex space-x-4">
          <div className="h-10 w-[200px] bg-gray-200 rounded animate-pulse" />
          <div className="h-10 w-[200px] bg-gray-200 rounded animate-pulse" />
          <div className="h-10 w-[120px] bg-gray-200 rounded animate-pulse" />
        </div>
      </div>

      {/* Content Grid Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <div className="space-y-4">
                <div className="h-6 w-1/3 bg-gray-200 rounded animate-pulse" />
                <div className="space-y-2">
                  <div className="h-4 w-full bg-gray-200 rounded animate-pulse" />
                  <div className="h-4 w-5/6 bg-gray-200 rounded animate-pulse" />
                  <div className="h-4 w-4/6 bg-gray-200 rounded animate-pulse" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Table Skeleton */}
      <Card>
        <CardContent className="p-6">
          <div className="space-y-4">
            <div className="h-8 w-1/4 bg-gray-200 rounded animate-pulse" />
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="h-12 w-full bg-gray-200 rounded animate-pulse"
                />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default DashboardSkeleton;

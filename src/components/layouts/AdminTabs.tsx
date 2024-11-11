import React from 'react';
import { useRouter } from 'next/router';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface RouteTab {
  value: string;
  label: string;
  href: string;
}

interface RouteTabs {
  [key: string]: RouteTab[];
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

export function AdminTabs() {
  const router = useRouter();
  const baseRoute = `/${router.pathname.split('/').slice(1, 3).join('/')}`;
  const currentTabs = routeTabs[baseRoute];
  const currentTabValue = router.pathname.split('/').pop() || '';

  if (!currentTabs) {
    return null;
  }

  return (
    <div className="mb-6 px-4 sm:px-0">
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
  );
}

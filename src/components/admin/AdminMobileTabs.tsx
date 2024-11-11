// components/admin/AdminMobileTabs.tsx
import { useRouter } from 'next/router';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { routeTabs, type RouteTab } from '@/config/routeTabs';

interface AdminMobileTabsProps {
  currentTabs: RouteTab[];
  currentTabValue: string;
}

export function AdminMobileTabs({
  currentTabs,
  currentTabValue,
}: AdminMobileTabsProps) {
  const router = useRouter();

  return (
    <div className="mb-6 md:hidden">
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

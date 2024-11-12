// components/admin/AdminMobileTabs.tsx
import { useRouter } from 'next/router';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RouteTab } from '@/config/routeTabs';
import { cn } from '@/lib/utils';

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
    <div className="sticky top-0 z-40 bg-white border-b md:hidden">
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
        <TabsList className="w-full h-auto p-0 bg-transparent">
          <div className="flex w-full overflow-x-auto scrollbar-hide">
            {currentTabs.map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className={cn(
                  'flex-1 min-w-[120px] whitespace-nowrap px-3 py-2',
                  'data-[state=active]:bg-transparent',
                  'data-[state=active]:border-b-2 data-[state=active]:border-primary',
                  'rounded-none',
                  'transition-all',
                )}
              >
                <div className="flex items-center justify-center gap-2">
                  {tab.label}
                </div>
              </TabsTrigger>
            ))}
          </div>
        </TabsList>
      </Tabs>
    </div>
  );
}

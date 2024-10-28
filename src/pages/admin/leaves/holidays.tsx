// pages/admin/leaves/holidays.tsx
import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import HolidayCalendar from '@/components/admin/leaves/holidays/HolidayCalendar';
import HolidayList from '@/components/admin/leaves/holidays/HolidayList';
import NoWorkDayManagement from '@/components/admin/leaves/holidays/NoWorkDayManagement';

export default function HolidaysPage() {
  return (
    <div className="space-y-6 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-bold">Holiday & No-Work Days</h1>
        <p className="text-gray-500">
          Manage holidays and special no-work days
        </p>
      </div>

      <Tabs defaultValue="calendar">
        <TabsList className="grid w-full grid-cols-1 md:grid-cols-3">
          <TabsTrigger value="calendar">Calendar View</TabsTrigger>
          <TabsTrigger value="list">Holiday List</TabsTrigger>
          <TabsTrigger value="nowork">No-Work Days</TabsTrigger>
        </TabsList>

        <TabsContent value="calendar">
          <HolidayCalendar />
        </TabsContent>

        <TabsContent value="list">
          <HolidayList />
        </TabsContent>

        <TabsContent value="nowork">
          <NoWorkDayManagement />
        </TabsContent>
      </Tabs>
    </div>
  );
}

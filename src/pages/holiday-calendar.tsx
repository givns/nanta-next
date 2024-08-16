import React from 'react';
import HolidayCalendar from '../components/HolidayCalendar';

const HolidayCalendarPage: React.FC = () => {
  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-6">Holiday Calendar</h1>
      <HolidayCalendar />
    </div>
  );
};

export default HolidayCalendarPage;

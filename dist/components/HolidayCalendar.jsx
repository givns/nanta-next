import React, { useEffect, useState } from 'react';
const HolidayCalendar = () => {
    const [holidays, setHolidays] = useState([]);
    useEffect(() => {
        const fetchHolidays = async () => {
            try {
                const response = await fetch('/api/getHolidays');
                const data = await response.json();
                setHolidays(data.holidays);
            }
            catch (error) {
                console.error('Error fetching holidays:', error);
            }
        };
        fetchHolidays();
    }, []);
    return (<div>
      <h1>Holiday Calendar</h1>
      <ul>
        {holidays.map((holiday) => (<li key={holiday._id}>
            {holiday.date}: {holiday.name}
          </li>))}
      </ul>
    </div>);
};
export default HolidayCalendar;

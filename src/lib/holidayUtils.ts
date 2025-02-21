import axios from 'axios';
import { parseISO, isSameDay, addDays, isValid, format } from 'date-fns';

export interface Holiday {
  date: string;
  localName: string;
  name: string;
  countryCode: string;
  fixed: boolean;
  global: boolean;
  counties: string[] | null;
  launchYear: number | null;
  types: string[];
}

const holidayCache: { [key: number]: Holiday[] } = {};

export const fetchThaiHolidays = async (year: number): Promise<Holiday[]> => {
  if (holidayCache[year]) {
    return holidayCache[year];
  }

  try {
    const response = await axios.get(`/api/holidays?year=${year}`);
    if (Array.isArray(response.data)) {
      holidayCache[year] = response.data;
      return response.data;
    } else {
      console.error(
        'Unexpected response format from holiday API:',
        response.data,
      );
      return [];
    }
  } catch (error) {
    console.error('Error fetching Thai holidays:', error);
    return [];
  }
};

export const calculateFullDayCount = async (
  startDate: string | Date,
  endDate: string | Date,
  leaveFormat: string,
  userShift: string,
): Promise<number> => {
  try {
    console.log('Input values:', {
      startDate,
      endDate,
      leaveFormat,
      userShift,
    });

    // Handle half-day leave first
    if (leaveFormat === 'ลาครึ่งวัน') {
      return 0.5;
    }

    // Safely parse dates
    const start =
      typeof startDate === 'string' ? parseISO(startDate) : startDate;
    const end = typeof endDate === 'string' ? parseISO(endDate) : endDate;

    // Validate parsed dates
    if (!isValid(start) || !isValid(end)) {
      console.error('Invalid date:', { start, end });
      throw new Error('Invalid date format');
    }

    console.log('Parsed dates:', {
      start: format(start, 'yyyy-MM-dd'),
      end: format(end, 'yyyy-MM-dd'),
    });

    let fullDayCount = 0;
    let currentDate = start;

    while (currentDate <= end) {
      const isNonWorking = await isNonWorkingDay(currentDate, userShift);
      console.log('Checking date:', {
        date: format(currentDate, 'yyyy-MM-dd'),
        isNonWorking,
      });

      if (!isNonWorking) {
        fullDayCount += 1;
      }
      currentDate = addDays(currentDate, 1);
    }

    console.log('Calculated full day count:', fullDayCount);
    return fullDayCount;
  } catch (error) {
    console.error('Error in calculateFullDayCount:', error);
    throw error;
  }
};

// Update isNonWorkingDay to handle date formats more safely
export const isNonWorkingDay = async (
  date: Date | string,
  userShift: string,
): Promise<boolean> => {
  try {
    const parsedDate = typeof date === 'string' ? parseISO(date) : date;

    if (!isValid(parsedDate)) {
      throw new Error('Invalid date provided to isNonWorkingDay');
    }

    // Handle Sunday check for non-SHIFT104
    if (parsedDate.getDay() === 0 && userShift !== 'SHIFT104') {
      return true;
    }

    const year = parsedDate.getFullYear();
    const holidays = await fetchThaiHolidays(year);

    if (!Array.isArray(holidays)) {
      console.error('Holidays is not an array:', holidays);
      return false;
    }

    if (userShift === 'SHIFT104') {
      const nextDay = addDays(parsedDate, 1);
      return holidays.some((holiday) =>
        isSameDay(parseISO(holiday.date), nextDay),
      );
    } else {
      return holidays.some((holiday) =>
        isSameDay(parseISO(holiday.date), parsedDate),
      );
    }
  } catch (error) {
    console.error('Error in isNonWorkingDay:', error);
    return false;
  }
};

// Add helper function to validate dates
export const isValidDateString = (dateString: string): boolean => {
  try {
    const parsed = parseISO(dateString);
    return isValid(parsed);
  } catch {
    return false;
  }
};

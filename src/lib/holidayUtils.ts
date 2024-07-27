import axios from 'axios';
import { parseISO, isSameDay, subDays, addDays } from 'date-fns';

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

export const isNonWorkingDay = async (
  date: Date,
  userShift: string,
): Promise<boolean> => {
  if (date.getDay() === 0 && userShift !== 'SHIFT104') return true; // Sunday for non-SHIFT104

  const year = date.getFullYear();
  const holidays = await fetchThaiHolidays(year);

  if (!Array.isArray(holidays)) {
    console.error('Holidays is not an array:', holidays);
    return false;
  }

  if (userShift === 'SHIFT104') {
    const nextDay = addDays(date, 1);
    return holidays.some((holiday) =>
      isSameDay(parseISO(holiday.date), nextDay),
    );
  } else {
    return holidays.some((holiday) => isSameDay(parseISO(holiday.date), date));
  }
};

export const calculateFullDayCount = async (
  startDate: string,
  endDate: string,
  leaveFormat: string,
  userShift: string,
): Promise<number> => {
  if (leaveFormat === 'ลาครึ่งวัน') {
    return 0.5;
  }

  const start = parseISO(startDate);
  const end = parseISO(endDate);
  let fullDayCount = 0;
  let currentDate = start;

  while (currentDate <= end) {
    if (!(await isNonWorkingDay(currentDate, userShift))) {
      fullDayCount += 1;
    }
    currentDate = addDays(currentDate, 1);
  }

  return fullDayCount;
};

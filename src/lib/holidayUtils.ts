import axios from 'axios';
import dayjs from 'dayjs';

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
    holidayCache[year] = response.data;
    return response.data;
  } catch (error) {
    console.error('Error fetching Thai holidays:', error);
    return [];
  }
};

export const isNonWorkingDay = async (
  date: dayjs.Dayjs,
  userShift: string,
): Promise<boolean> => {
  if (date.day() === 0) return true; // Sunday

  const year = date.year();
  const holidays = await fetchThaiHolidays(year);

  if (userShift === 'SHIFT104') {
    // For Shift 104, the holiday is the day before the regular holiday
    return holidays.some((holiday) =>
      date.isSame(dayjs(holiday.date).subtract(1, 'day'), 'day'),
    );
  } else {
    return holidays.some((holiday) => date.isSame(holiday.date, 'day'));
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

  const start = dayjs(startDate);
  const end = dayjs(endDate);
  let fullDayCount = 0;

  for (
    let date = start;
    date.isBefore(end) || date.isSame(end, 'day');
    date = date.add(1, 'day')
  ) {
    if (!(await isNonWorkingDay(date, userShift))) {
      fullDayCount += 1;
    }
  }

  return fullDayCount;
};

import type { NextApiRequest, NextApiResponse } from 'next';
import axios from 'axios';
import { Holiday } from '../../lib/holidayUtils';
import { subDays } from 'date-fns';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Holiday[]>,
) {
  const { year, shiftType } = req.query;

  if (!year || typeof year !== 'string') {
    return res.status(400).json([]);
  }

  try {
    const response = await axios.get(
      `https://date.nager.at/api/v3/PublicHolidays/${year}/TH`,
    );

    if (Array.isArray(response.data)) {
      let holidays: Holiday[] = response.data.map((item: any) => ({
        date: item.date,
        localName: item.localName,
        name: item.name,
        countryCode: item.countryCode,
        fixed: item.fixed,
        global: item.global,
        counties: item.counties || null,
        launchYear: item.launchYear || null,
        types: item.types || [],
      }));

      if (shiftType === 'shift104') {
        holidays = holidays.map((holiday) => ({
          ...holiday,
          date: subDays(new Date(holiday.date), 1).toISOString().split('T')[0],
          name: `Shift 104 - ${holiday.name}`,
        }));
      }

      console.log(`Fetched ${holidays.length} holidays for year ${year}`);
      res.status(200).json(holidays);
    } else {
      console.error(
        'Unexpected response format from Nager.Date API:',
        response.data,
      );
      res.status(200).json([]);
    }
  } catch (error) {
    console.error('Error fetching holidays:', error);
    res.status(500).json([]);
  }
}

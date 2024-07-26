import type { NextApiRequest, NextApiResponse } from 'next';
import axios from 'axios';
import { Holiday } from '../../lib/holidayUtils';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Holiday[]>,
) {
  const { year } = req.query;

  if (!year || typeof year !== 'string') {
    return res.status(400).json([]);
  }

  try {
    const response = await axios.get(
      `https://date.nager.at/api/v3/PublicHolidays/${year}/TH`,
    );

    if (Array.isArray(response.data)) {
      const holidays: Holiday[] = response.data.map((item: any) => ({
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

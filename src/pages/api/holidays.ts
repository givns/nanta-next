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
    res.status(200).json(response.data);
  } catch (error) {
    console.error('Error fetching holidays:', error);
    res.status(500).json([]);
  }
}

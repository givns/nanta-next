// pages/api/check-status.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { attendanceService } from '../../services/AttendanceService';
import { ExternalCheckData } from '../../types/user';

const MIN_CHECK_INTERVAL = 1 * 60 * 1000; // 1 minute in milliseconds, adjust as needed

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { lineUserId } = req.query;

  if (!lineUserId || typeof lineUserId !== 'string') {
    return res.status(400).json({ message: 'Invalid lineUserId' });
  }

  try {
    console.log('Fetching user for lineUserId:', lineUserId);

    const { latestAttendance, latestExternal, user } =
      await attendanceService.getLatestAttendanceData(lineUserId);

    if (!user) {
      console.log('User not found for lineUserId:', lineUserId);
      return res.status(404).json({ message: 'User not found' });
    }

    console.log('User found:', JSON.stringify(user, null, 2));

    const now = new Date();
    const thaiNow = new Date(now.getTime() + 7 * 60 * 60 * 1000);

    // Determine the most recent check-in
    let latestCheckIn: ExternalCheckData | null = null;
    if (latestExternal) {
      latestCheckIn = {
        sj: latestExternal.sj,
        user_serial: parseInt(user.employeeId),
        bh: parseInt(latestExternal.bh),
        fx: latestExternal.fx,
        iden: null, // You may need to adjust these default values
        dev_serial: '0010000', // Default to Nanta Next device
        dev_state: 0,
        jlzp_serial: null,
        gly_no: null,
        lx: 0,
        shenhe: 0,
        yich: 0,
        deal_state: 0,
        dev_logic_bh: null,
        healthstatus: null,
        body_temp: null,
        temp_error: null,
        passport_no: null,
        date: new Date(latestExternal.sj).toISOString().split('T')[0],
        time: new Date(latestExternal.sj)
          .toISOString()
          .split('T')[1]
          .split('.')[0],
        noti: 0,
        flagmax: 0,
      };
    }

    let isCheckingIn: boolean;
    let message: string | null = null;

    if (latestCheckIn) {
      const timeSinceCheckIn =
        thaiNow.getTime() - new Date(latestCheckIn.sj).getTime();
      if (timeSinceCheckIn < MIN_CHECK_INTERVAL) {
        message =
          'Too soon to check in/out. Please wait before attempting again.';
        isCheckingIn = latestCheckIn.fx !== 0; // Keep the current status
      } else {
        isCheckingIn = latestCheckIn.fx !== 0;
      }
    } else if (latestAttendance) {
      isCheckingIn = !!latestAttendance.checkOutTime;
    } else {
      isCheckingIn = true; // If no check-in record, user should check in
    }

    const responseData = {
      latestCheckIn,
      isCheckingIn,
      checkInId: latestAttendance
        ? latestAttendance.id
        : latestCheckIn
          ? latestCheckIn.bh.toString()
          : null,
      message,
      userData: user,
    };

    console.log('Final status:', JSON.stringify(responseData, null, 2));

    return res.status(200).json(responseData);
  } catch (error: any) {
    console.error('Error checking user status:', error);
    return res
      .status(500)
      .json({ message: 'Server error', error: error.message });
  }
}

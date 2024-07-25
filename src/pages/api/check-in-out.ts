import type { NextApiRequest, NextApiResponse } from 'next';
import { AttendanceService } from '../../services/AttendanceService';
import { ShiftManagementService } from '@/services/ShiftManagementService';
import moment from 'moment-timezone';
import { AttendanceData } from '@/types/user';

const attendanceService = new AttendanceService();
const shiftService = new ShiftManagementService();

const TIMEZONE = 'Asia/Bangkok'; // Set this to your local timezone

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  console.log('Received check-in/out request:', req.body);

  const {
    userId,
    employeeId,
    checkTime,
    location,
    address,
    reason,
    photo,
    deviceSerial,
    isCheckIn,
    isOvertime,
    isLate,
  } = req.body;

  // Validate required fields
  if (
    !userId ||
    !employeeId ||
    !checkTime ||
    !location ||
    !address ||
    !deviceSerial ||
    typeof isCheckIn !== 'boolean'
  ) {
    console.error('Missing or invalid required fields:', req.body);
    return res
      .status(400)
      .json({ message: 'Missing or invalid required fields' });
  }

  try {
    console.log(`Getting shift for user: ${userId}`);
    const shift = await shiftService.getUserShift(userId);
    console.log('User shift:', shift);

    console.log(`Getting attendance status for employee: ${employeeId}`);
    const attendanceStatus =
      await attendanceService.getLatestAttendanceStatus(employeeId);
    console.log('Attendance status:', attendanceStatus);

    if (!shift) {
      console.error(`Shift not found for user: ${userId}`);
      return res.status(400).json({ message: 'User shift not found' });
    }

    // Convert checkTime to moment object in the correct timezone
    const now = moment(checkTime).tz(TIMEZONE);
    console.log('Check time (local):', now.format());

    let effectiveShift = shift;
    if (attendanceStatus.shiftAdjustment) {
      const adjustmentDate = moment(attendanceStatus.shiftAdjustment.date).tz(
        TIMEZONE,
      );
      if (adjustmentDate.isSame(now, 'day')) {
        console.log('Using adjusted shift');
        effectiveShift = attendanceStatus.shiftAdjustment.requestedShift;
      }
    }

    console.log('Effective shift:', effectiveShift);

    const {
      shiftStart,
      shiftEnd,
      flexibleStart,
      flexibleEnd,
      graceStart,
      graceEnd,
    } = calculateShiftTimes(
      now,
      effectiveShift.startTime,
      effectiveShift.endTime,
    );

    console.log('Calculated shift times:', {
      shiftStart: shiftStart.format(),
      shiftEnd: shiftEnd.format(),
      flexibleStart: flexibleStart.format(),
      flexibleEnd: flexibleEnd.format(),
      graceStart: graceStart.format(),
      graceEnd: graceEnd.format(),
    });

    const isOutsideShift = now.isBefore(shiftStart) || now.isAfter(shiftEnd);
    const isFlexibleStart =
      now.isSameOrAfter(flexibleStart) && now.isBefore(shiftStart);
    const isFlexibleEnd =
      now.isAfter(shiftEnd) && now.isSameOrBefore(flexibleEnd);
    const isWithinGracePeriod =
      (now.isSameOrAfter(graceStart) && now.isSameOrBefore(shiftStart)) ||
      (now.isSameOrAfter(shiftEnd) && now.isSameOrBefore(graceEnd));

    const isCheckInOutAllowed =
      attendanceStatus.approvedOvertime ||
      !isOutsideShift ||
      isFlexibleStart ||
      isFlexibleEnd ||
      isWithinGracePeriod;

    console.log('Check-in/out allowed:', isCheckInOutAllowed);

    if (!isCheckInOutAllowed) {
      return res
        .status(400)
        .json({ message: 'Check-in/out not allowed at this time' });
    }

    let attendanceType:
      | 'regular'
      | 'flexible-start'
      | 'flexible-end'
      | 'grace-period'
      | 'overtime' = 'regular';
    if (isFlexibleStart) attendanceType = 'flexible-start';
    else if (isFlexibleEnd) attendanceType = 'flexible-end';
    else if (isWithinGracePeriod) attendanceType = 'grace-period';
    else if (attendanceStatus.approvedOvertime) attendanceType = 'overtime';

    const attendanceData: AttendanceData = {
      userId,
      employeeId,
      checkTime: now.toDate(), // or now.toISOString() if you prefer string
      location: JSON.stringify(location), // Assuming location is an object
      address,
      reason,
      photo,
      deviceSerial,
      isCheckIn,
      isOvertime: attendanceStatus.approvedOvertime ? true : isOvertime,
      isLate,
      isFlexibleStart: attendanceType === 'flexible-start',
      isFlexibleEnd: attendanceType === 'flexible-end',
      isWithinGracePeriod: attendanceType === 'grace-period',
    };

    console.log('Attendance data:', attendanceData);

    const attendance =
      await attendanceService.processAttendance(attendanceData);

    console.log('Processed attendance:', attendance);

    res.status(200).json(attendance);
  } catch (error: any) {
    console.error('Check-in/out failed:', error);
    res.status(error.statusCode || 500).json({
      message: 'Check-in/out failed',
      error: error.message,
    });
  }

  function calculateShiftTimes(
    now: moment.Moment,
    startTime: string,
    endTime: string,
  ) {
    const [startHour, startMinute] = startTime.split(':').map(Number);
    const [endHour, endMinute] = endTime.split(':').map(Number);

    const shiftStart = now
      .clone()
      .set({ hour: startHour, minute: startMinute, second: 0, millisecond: 0 });
    const shiftEnd = now
      .clone()
      .set({ hour: endHour, minute: endMinute, second: 0, millisecond: 0 });

    // Handle overnight shifts
    if (shiftEnd.isBefore(shiftStart)) {
      shiftEnd.add(1, 'day');
    }

    const flexibleStart = shiftStart.clone().subtract(30, 'minutes');
    const flexibleEnd = shiftEnd.clone().add(30, 'minutes');
    const graceStart = shiftStart.clone().subtract(5, 'minutes');
    const graceEnd = shiftEnd.clone().add(5, 'minutes');

    return {
      shiftStart,
      shiftEnd,
      flexibleStart,
      flexibleEnd,
      graceStart,
      graceEnd,
    };
  }
}

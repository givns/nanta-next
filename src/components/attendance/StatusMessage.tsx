//StatusMessage.tsx
import { AttendanceStatusInfo } from '@/types/attendance';
import { format } from 'date-fns';

interface StatusMessageResult {
  message: string;
  color: 'red' | 'green' | 'blue';
}

export const getStatusMessage = (
  attendanceStatus: AttendanceStatusInfo | null,
): StatusMessageResult => {
  if (!attendanceStatus) {
    return {
      message: 'ไม่พบข้อมูลการลงเวลา',
      color: 'red',
    };
  }

  const now = new Date();
  const currentHour = format(now, 'HH:mm');

  // Holiday check should be first priority
  if (attendanceStatus.isHoliday) {
    const overtimeMsg = attendanceStatus.approvedOvertime
      ? ' (มีการอนุมัติ OT)'
      : '';
    return {
      message: `วันหยุดนักขัตฤกษ์${overtimeMsg}`,
      color: 'blue',
    };
  }

  // Day off check should be second priority
  if (attendanceStatus.isDayOff) {
    const overtimeMsg = attendanceStatus.approvedOvertime
      ? ' (มีการอนุมัติ OT)'
      : '';
    return {
      message: `วันหยุดประจำสัปดาห์${overtimeMsg}`,
      color: 'blue',
    };
  }

  // Check if current time is between any overtime periods
  if (attendanceStatus.allApprovedOvertimes?.length) {
    const currentOvertime = attendanceStatus.allApprovedOvertimes.find((ot) => {
      return currentHour >= ot.startTime && currentHour <= ot.endTime;
    });

    if (currentOvertime) {
      if (!attendanceStatus.currentPeriod.checkInTime) {
        return { message: 'รอลงเวลาเข้างาน OT', color: 'blue' };
      }
      if (!attendanceStatus.currentPeriod.checkOutTime) {
        return { message: 'กำลังทำงานล่วงเวลา', color: 'green' };
      }
    } else {
      // Outside overtime period - check if all overtimes are completed or upcoming
      const isPastAllOvertimes = attendanceStatus.allApprovedOvertimes.every(
        (ot) => currentHour > ot.endTime,
      );
      if (isPastAllOvertimes) {
        return { message: 'เสร็จสิ้นการทำงานล่วงเวลา', color: 'blue' };
      }
    }
  }

  // Current period checks
  const currentPeriod = attendanceStatus.currentPeriod;

  if (!currentPeriod) {
    return {
      message: 'ไม่พบข้อมูลช่วงเวลาทำงาน',
      color: 'red',
    };
  }

  // Handle overtime period
  if (currentPeriod.type === 'overtime') {
    if (!currentPeriod.checkInTime) {
      return {
        message: 'รอลงเวลาเข้างาน OT',
        color: 'blue',
      };
    }
    if (!currentPeriod.checkOutTime) {
      return {
        message: 'กำลังทำงานล่วงเวลา',
        color: 'green',
      };
    }
    return {
      message: 'เสร็จสิ้นการทำงานล่วงเวลา',
      color: 'blue',
    };
  }

  // Handle regular period
  if (currentPeriod.type === 'regular') {
    const now = new Date();
    const shiftStart = currentPeriod.current.start;
    const LATE_THRESHOLD_MINUTES = 5; // 5 minutes grace period

    // Not checked in
    if (!currentPeriod.checkInTime) {
      // Check if current time is past shift start time + grace period
      const isLate =
        now > new Date(shiftStart.getTime() + LATE_THRESHOLD_MINUTES * 60000);

      if (isLate) {
        return {
          message: 'ยังไม่ได้ลงเวลาเข้างาน (สาย)',
          color: 'red',
        };
      }
      return {
        message: 'รอลงเวลาเข้างาน',
        color: 'blue',
      };
    }

    // Checked in but not out
    if (!currentPeriod.checkOutTime) {
      return {
        message: 'กำลังปฏิบัติงาน',
        color: 'green',
      };
    }

    // Checked out
    return {
      message: 'เสร็จสิ้นการทำงาน',
      color: 'blue',
    };
  }

  return {
    message: 'ไม่สามารถระบุสถานะได้',
    color: 'red',
  };
};

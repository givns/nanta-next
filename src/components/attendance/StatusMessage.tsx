//StatusMessage.tsx
import { AttendanceStatusInfo } from '@/types/attendance';

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

  // Holiday/Day off checks first
  if (attendanceStatus.isHoliday) {
    return {
      message: `วันหยุดนักขัตฤกษ์${attendanceStatus.approvedOvertime ? ' (มีการอนุมัติ OT)' : ''}`,
      color: 'blue',
    };
  }

  if (attendanceStatus.isDayOff) {
    return {
      message: `วันหยุดประจำสัปดาห์${attendanceStatus.approvedOvertime ? ' (มีการอนุมัติ OT)' : ''}`,
      color: 'blue',
    };
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

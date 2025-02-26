// hooks/useStatusMessage.ts
import { useMemo } from 'react';
import { AttendanceBaseResponse } from '@/types/attendance';

export function useStatusMessage(attendance?: AttendanceBaseResponse) {
  return useMemo(() => {
    if (!attendance) {
      return {
        message: 'ไม่พบข้อมูลการลงเวลา',
        color: 'red' as const,
      };
    }

    switch (attendance.state) {
      case 'ABSENT':
        return {
          message: 'รอลงเวลาเข้างาน',
          color: 'blue' as const,
        };
      case 'PRESENT':
        return {
          message: attendance.latestAttendance?.CheckOutTime
            ? 'เสร็จสิ้นการทำงาน'
            : 'กำลังปฏิบัติงาน',
          color: 'green' as const,
        };
      // Add other cases...
      default:
        return {
          message: 'ไม่สามารถระบุสถานะได้',
          color: 'red' as const,
        };
    }
  }, [attendance]);
}

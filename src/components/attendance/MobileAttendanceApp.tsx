import React from 'react';
import {
  differenceInMinutes,
  format,
  isValid,
  isWithinInterval,
  parseISO,
} from 'date-fns';
import { th } from 'date-fns/locale';
import { AlertCircle, Clock, User, Building2 } from 'lucide-react';
import {
  ShiftData,
  CurrentPeriodInfo,
  AttendanceStateResponse,
  ValidationResponse,
  OvertimeState,
} from '@/types/attendance';
import {
  calculateTimeDifference,
  formatBangkokTime,
  formatTime,
  getCurrentTime,
} from '@/utils/dateUtils';

interface ShiftStatusInfo {
  isHoliday: boolean;
  isDayOff: boolean;
}

interface MobileAttendanceAppProps {
  userData: {
    name: string;
    employeeId: string;
    departmentName: string;
  };
  shiftData: ShiftData | null;
  currentPeriod: CurrentPeriodInfo | null;
  status: ShiftStatusInfo;
  attendanceStatus: AttendanceStateResponse['base'];
  overtimeInfo?: OvertimeInfoUI | null;
  validation?: ValidationResponse;
  onAction: () => void;
  locationState: {
    isReady: boolean;
    error?: string;
  };
}

interface OvertimeInfoUI {
  id: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  isInsideShiftHours: boolean;
  isDayOffOvertime: boolean;
  reason?: string;
}

const MobileAttendanceApp: React.FC<MobileAttendanceAppProps> = ({
  userData,
  shiftData,
  currentPeriod,
  status,
  attendanceStatus,
  overtimeInfo,
  validation,
  onAction,
  locationState,
}) => {
  const currentTime = getCurrentTime();
  const now = new Date();
  console.log('Current time:', currentTime);
  console.log('Now:', now);
  console.log('attendanceStatus:', attendanceStatus);
  console.log('Current Period Data:', {
    current: currentPeriod?.current,
    start: currentPeriod?.current?.start,
    end: currentPeriod?.current?.end,
    type: typeof currentPeriod?.current?.start,
  });

  const getProgressPercentage = () => {
    console.log('Progress Calculation Start:', {
      currentPeriod,
      attendanceStatus: attendanceStatus?.latestAttendance,
      regularShift: shiftData,
    });

    if (!currentPeriod?.current) {
      console.log('No current period found');
      return 0;
    }

    try {
      const now = getCurrentTime(); // Current time
      const today = format(now, 'yyyy-MM-dd'); // Get current date only

      // Create proper datetime objects using shift times
      const startTime = parseISO(`${today}T${shiftData?.startTime || '08:00'}`);
      const endTime = parseISO(`${today}T${shiftData?.endTime || '17:00'}`);

      // Format times for logging using utility functions
      console.log('Time Reference Points:', {
        nowUTC: now.toISOString(),
        startUTC: startTime.toISOString(),
        endUTC: endTime.toISOString(),
        periodType: currentPeriod.type,
        // Local times using our formatters
        localNow: formatTime(now),
        localStart: formatTime(startTime),
        localEnd: formatTime(endTime),
        localShiftStart: shiftData?.startTime,
        localShiftEnd: shiftData?.endTime,
      });

      // Handle period transitions
      if (attendanceStatus?.latestAttendance?.CheckOutTime) {
        // If regular period completed and overtime available
        if (
          currentPeriod.type === 'regular' &&
          overtimeInfo &&
          isWithinInterval(now, {
            start: parseISO(
              `${format(now, 'yyyy-MM-dd')}T${overtimeInfo.startTime}`,
            ),
            end: parseISO(
              `${format(now, 'yyyy-MM-dd')}T${overtimeInfo.endTime}`,
            ),
          })
        ) {
          // Show overtime progress instead
          const overtimeStart = parseISO(
            `${format(now, 'yyyy-MM-dd')}T${overtimeInfo.startTime}`,
          );
          const overtimeEnd = parseISO(
            `${format(now, 'yyyy-MM-dd')}T${overtimeInfo.endTime}`,
          );
          const elapsedMinutes = differenceInMinutes(now, overtimeStart);
          const totalMinutes = differenceInMinutes(overtimeEnd, overtimeStart);

          return Math.max(
            0,
            Math.min((elapsedMinutes / totalMinutes) * 100, 100),
          );
        }
      }

      // Calculate progress based on period type
      if (currentPeriod.type === 'regular') {
        console.log('Calculating regular shift progress');
        const totalMinutes = calculateTimeDifference(startTime, endTime);
        const elapsedMinutes = calculateTimeDifference(startTime, now);

        console.log('Regular Shift Calculation:', {
          totalMinutes,
          elapsedMinutes,
          rawPercentage: (elapsedMinutes / totalMinutes) * 100,
          localNow: formatTime(now),
          localStart: formatTime(startTime), // This should now show correct shift start time
          localEnd: formatTime(endTime), // This should now show correct shift end time
        });

        const percentage = Math.max(
          0,
          Math.min((elapsedMinutes / totalMinutes) * 100, 100),
        );
        return Math.round(percentage * 100) / 100;
      }

      if (currentPeriod.type === 'overtime') {
        // For overtime, we should also use the actual overtime start/end times
        const overtimeStart = parseISO(
          `${today}T${overtimeInfo?.startTime || startTime}`,
        );
        const overtimeEnd = parseISO(
          `${today}T${overtimeInfo?.endTime || endTime}`,
        );

        const totalMinutes = calculateTimeDifference(
          overtimeStart,
          overtimeEnd,
        );
        const elapsedMinutes = calculateTimeDifference(overtimeStart, now);

        console.log('Overtime Calculation:', {
          totalMinutes,
          elapsedMinutes,
          rawPercentage: (elapsedMinutes / totalMinutes) * 100,
          localNow: formatTime(now),
          localStart: formatTime(overtimeStart),
          localEnd: formatTime(overtimeEnd),
        });

        const percentage = Math.max(
          0,
          Math.min((elapsedMinutes / totalMinutes) * 100, 100),
        );
        return Math.round(percentage * 100) / 100;
      }

      // Fallback calculation using shift times
      const totalMinutes = calculateTimeDifference(startTime, endTime);
      const elapsedMinutes = calculateTimeDifference(startTime, now);

      if (totalMinutes <= 0) {
        console.log('Invalid period duration');
        return 0;
      }

      const percentage = Math.max(
        0,
        Math.min((elapsedMinutes / totalMinutes) * 100, 100),
      );
      const roundedPercentage = Math.round(percentage * 100) / 100;

      console.log('Final Progress:', {
        totalMinutes,
        elapsedMinutes,
        rawPercentage: (elapsedMinutes / totalMinutes) * 100,
        roundedPercentage,
      });

      return roundedPercentage;
    } catch (error) {
      console.error('Progress calculation error:', {
        error,
        currentPeriod,
        attendanceStatus,
      });
      return 0;
    }
  };

  const getRelevantOvertimes = () => {
    if (!overtimeInfo) return null;

    const currentTimeStr = format(currentTime, 'HH:mm');

    if (Array.isArray(overtimeInfo)) {
      const sortedOvertimes = [...overtimeInfo].sort((a, b) => {
        return a.startTime.localeCompare(b.startTime);
      });

      const relevantOts = sortedOvertimes.filter((ot) => {
        if (ot.startTime > currentTimeStr) {
          return true;
        }
        if (ot.startTime <= currentTimeStr && ot.endTime > currentTimeStr) {
          return true;
        }
        return false;
      });

      return relevantOts.length > 0 ? relevantOts : null;
    }

    if (
      overtimeInfo.startTime > currentTimeStr ||
      (overtimeInfo.startTime <= currentTimeStr &&
        overtimeInfo.endTime > currentTimeStr)
    ) {
      return overtimeInfo;
    }

    return null;
  };

  const getCheckInTime = () => {
    const latestAttendance = attendanceStatus.latestAttendance;

    if (latestAttendance?.CheckInTime) {
      const [hours, minutes] =
        latestAttendance.CheckInTime.split('T')[1].split(':');
      return `${hours}:${minutes}`;
    }
    if (currentPeriod?.checkInTime) {
      const [hours, minutes] = new Date(currentPeriod.checkInTime)
        .toISOString()
        .split('T')[1]
        .split(':');
      return `${hours}:${minutes}`;
    }
    if (
      currentPeriod?.type === 'overtime' &&
      !attendanceStatus.isCheckingIn &&
      currentPeriod.current?.start
    ) {
      const [hours, minutes] = new Date(currentPeriod.current.start)
        .toISOString()
        .split('T')[1]
        .split(':');
      return `${hours}:${minutes}`;
    }
    return '--:--';
  };

  const getCheckOutTime = () => {
    const latestAttendance = attendanceStatus.latestAttendance;

    if (latestAttendance?.CheckOutTime) {
      const [hours, minutes] =
        latestAttendance.CheckOutTime.split('T')[1].split(':');
      return `${hours}:${minutes}`;
    }
    if (currentPeriod?.checkOutTime) {
      const [hours, minutes] = new Date(currentPeriod.checkOutTime)
        .toISOString()
        .split('T')[1]
        .split(':');
      return `${hours}:${minutes}`;
    }
    if (
      currentPeriod?.type === 'overtime' &&
      !attendanceStatus.isCheckingIn &&
      currentPeriod.current?.end
    ) {
      const [hours, minutes] = new Date(currentPeriod.current.end)
        .toISOString()
        .split('T')[1]
        .split(':');
      return `${hours}:${minutes}`;
    }
    return '--:--';
  };

  const isWithinOvertimePeriod =
    overtimeInfo && currentPeriod?.current
      ? isWithinInterval(currentTime, {
          start: new Date(currentPeriod.current.start),
          end: new Date(currentPeriod.current.end),
        })
      : false;

  const shouldShowProgress =
    status.isDayOff || status.isHoliday ? isWithinOvertimePeriod : true;

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <header className="fixed top-0 left-0 right-0 z-30 bg-white border-b border-gray-100">
        <div className="px-4 py-3">
          <div className="text-center text-4xl font-bold mb-1">
            {format(currentTime, 'HH:mm')}
          </div>
          <div className="text-center text-sm text-gray-500">
            {format(currentTime, 'EEEE d MMMM yyyy', { locale: th })}
          </div>
        </div>
      </header>

      <main className="flex-1 mt-20 mb-24 overflow-y-auto">
        <div className="bg-white px-4 py-3 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <User size={20} className="text-gray-400" />
            <div>
              <div className="font-medium text-2xl">{userData.name}</div>
              <div className="text-sm text-gray-500">
                รหัส: {userData.employeeId}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Building2 size={20} className="text-gray-400" />
            <div className="text-sm text-gray-500">
              {userData.departmentName}
            </div>
          </div>
        </div>

        <div className="m-4 bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <div className="flex justify-between items-center mb-3">
              <div className="flex items-center gap-2">
                <Clock size={20} className="text-primary" />
                <span className="font-medium">สถานะการทำงาน</span>
              </div>
              {(() => {
                const relevantOts = getRelevantOvertimes();
                return relevantOts ? (
                  <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-sm rounded-full">
                    OT
                  </span>
                ) : null;
              })()}
            </div>

            {(status.isDayOff || status.isHoliday) && (
              <div className="text-sm text-gray-500">
                {status.isHoliday ? 'วันหยุดนักขัตฤกษ์' : 'วันหยุด'}
              </div>
            )}

            {shiftData &&
              !status.isDayOff &&
              !status.isHoliday &&
              currentPeriod?.type !== 'overtime' && (
                <div className="text-sm text-gray-500">
                  เวลางาน {shiftData.startTime} - {shiftData.endTime} น.
                </div>
              )}

            {(() => {
              const relevantOts = getRelevantOvertimes();
              if (!relevantOts) return null;

              if (Array.isArray(relevantOts)) {
                return (
                  <div className="mt-2 text-sm text-gray-500">
                    <div>การทำงานล่วงเวลาที่เหลือ:</div>
                    {relevantOts.map((ot) => (
                      <div
                        key={ot.id}
                        className="ml-2 flex justify-between items-center"
                      >
                        <span>
                          {ot.startTime} - {ot.endTime}
                        </span>
                        <span className="text-xs">
                          ({ot.durationMinutes} นาที)
                        </span>
                      </div>
                    ))}
                  </div>
                );
              }

              return (
                <div className="text-sm text-gray-500 mt-1">
                  {!attendanceStatus.latestAttendance?.CheckOutTime &&
                  !status.isDayOff
                    ? 'มีการทำงานล่วงเวลาวันนี้: '
                    : 'เวลาทำงานล่วงเวลา: '}
                  {relevantOts.startTime} - {relevantOts.endTime} น.
                  <span className="ml-2 text-xs">
                    ({relevantOts.durationMinutes} นาที)
                  </span>
                </div>
              );
            })()}
          </div>

          <div className="p-4 bg-gray-50">
            {shouldShowProgress && currentPeriod?.current && (
              <div className="relative h-3 bg-gray-200 rounded-full overflow-hidden mb-4">
                <div
                  className={`absolute h-full transition-all duration-300 ${
                    currentPeriod.type === 'overtime'
                      ? 'bg-yellow-500'
                      : 'bg-blue-500'
                  }`}
                  style={{
                    width: `${shouldShowProgress ? getProgressPercentage() : 0}%`,
                  }}
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-gray-500 mb-1">เข้างาน</div>
                <div className="font-medium">{getCheckInTime()}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500 mb-1">ออกงาน</div>
                <div className="font-medium">{getCheckOutTime()}</div>
              </div>
            </div>

            {currentPeriod?.type === 'overtime' && (
              <div className="mt-3 pt-3 border-t border-gray-200">
                <div className="text-sm text-gray-700">
                  {validation?.reason?.includes('ย้อนหลัง')
                    ? validation.reason
                    : isWithinOvertimePeriod
                      ? attendanceStatus.isCheckingIn
                        ? 'กำลังจะลงเวลาเข้างานล่วงเวลา'
                        : 'อยู่ในช่วงเวลาทำงานล่วงเวลา'
                      : currentTime < new Date(currentPeriod.current.start)
                        ? `เริ่มทำงานล่วงเวลาเวลา ${overtimeInfo?.startTime} น.`
                        : 'หมดเวลาทำงานล่วงเวลา'}
                </div>
              </div>
            )}
          </div>
        </div>

        {locationState.error && (
          <div className="mx-4 mb-4 p-4 bg-red-50 rounded-xl">
            <div className="flex items-center gap-2 text-red-600">
              <AlertCircle size={20} />
              <span className="text-sm">{locationState.error}</span>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default MobileAttendanceApp;

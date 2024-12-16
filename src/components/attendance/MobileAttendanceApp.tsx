import React from 'react';
import {
  differenceInMinutes,
  format,
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
  PeriodType,
} from '@/types/attendance';
import {
  calculateTimeDifference,
  formatTime,
  getCurrentTime,
} from '@/utils/dateUtils';
import { OvertimeState } from '@prisma/client';

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
    if (!currentPeriod?.current) {
      console.log('No current period found');
      return 0;
    }

    try {
      const now = getCurrentTime();
      const today = format(now, 'yyyy-MM-dd');

      // During transition period, use the appropriate period times
      const isTransitioning =
        currentPeriod.type === 'overtime' &&
        attendanceStatus?.latestAttendance?.periodType === 'regular';

      if (isTransitioning) {
        // Use regular period times until transition is complete
        const startTime = parseISO(
          `${today}T${shiftData?.startTime || '08:00'}`,
        );
        const endTime = parseISO(`${today}T${shiftData?.endTime || '17:00'}`);

        const elapsedMinutes = differenceInMinutes(now, startTime);
        const totalMinutes = differenceInMinutes(endTime, startTime);

        return Math.max(
          0,
          Math.min((elapsedMinutes / totalMinutes) * 100, 100),
        );
      }

      // Normal period progress calculation
      const periodStart = parseISO(currentPeriod.current.start);
      const periodEnd = parseISO(currentPeriod.current.end);
      const elapsedMinutes = differenceInMinutes(now, periodStart);
      const totalMinutes = differenceInMinutes(periodEnd, periodStart);

      return Math.max(0, Math.min((elapsedMinutes / totalMinutes) * 100, 100));
    } catch (error) {
      console.error('Progress calculation error:', {
        error,
        currentPeriod,
        attendanceStatus,
      });
      return 0;
    }
  };

  const getCheckInTime = () => {
    const latestAttendance = attendanceStatus.latestAttendance;

    // Handle transition period
    const isTransitioning =
      currentPeriod?.type === 'overtime' &&
      latestAttendance?.periodType === 'regular';

    if (isTransitioning) {
      // Show regular period check-in time during transition
      return format(parseISO(latestAttendance?.CheckInTime || ''), 'HH:mm');
    }

    // Rest of check-in time logic...
    if (latestAttendance?.CheckInTime) {
      return format(parseISO(latestAttendance.CheckInTime), 'HH:mm');
    }

    return '--:--';
  };

  const getCheckOutTime = () => {
    const latestAttendance = attendanceStatus.latestAttendance;

    // Handle transition period
    const isTransitioning =
      currentPeriod?.type === 'overtime' &&
      latestAttendance?.periodType === 'regular';

    if (isTransitioning) {
      // Show regular period end time during transition
      return format(parseISO(latestAttendance.shiftEndTime ?? ''), 'HH:mm');
    }

    // Rest of check-out time logic...
    if (latestAttendance?.CheckOutTime) {
      return format(parseISO(latestAttendance.CheckOutTime), 'HH:mm');
    }

    return '--:--';
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

            {attendanceStatus.latestAttendance?.overtimeState ===
              'COMPLETED' && (
              <div className="mb-4 pb-4 border-b border-gray-200">
                <div className="text-sm font-medium text-yellow-600 mb-2">
                  ช่วงเวลาทำงานล่วงเวลา
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm text-gray-500 mb-1">เข้างาน OT</div>
                    <div className="font-medium">
                      {attendanceStatus.latestAttendance.CheckInTime
                        ? format(
                            parseISO(
                              attendanceStatus.latestAttendance.CheckInTime,
                            ),
                            'HH:mm',
                          )
                        : '--:--'}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500 mb-1">ออกงาน OT</div>
                    <div className="font-medium">
                      {attendanceStatus.latestAttendance.CheckOutTime
                        ? format(
                            parseISO(
                              attendanceStatus.latestAttendance.CheckOutTime,
                            ),
                            'HH:mm',
                          )
                        : '--:--'}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div>
              <div className="text-sm font-medium mb-2">กะปกติ</div>
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

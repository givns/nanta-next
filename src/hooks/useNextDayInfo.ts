import useSWR from 'swr';

// Type definition to match the component's expected structure
interface NextDayInfo {
  isHoliday: boolean;
  isDayOff: boolean;
  holidayInfo?: {
    name?: string;
  };
  leaveInfo?: {
    type: string;
    duration: string;
  };
  shift: {
    name: string;
    isAdjusted: boolean;
    startTime: string;
    endTime: string;
    adjustedInfo?: {
      originalStart: string;
      originalEnd: string;
      reason: string;
    };
  };
  overtimes?: Array<{
    id: string;
    date: string;
    startTime: string;
    endTime: string;
    status: 'approved' | 'pending';
    durationMinutes: number;
  }>;
}

export const useNextDayInfo = (
  employeeId: string | undefined,
  enabled: boolean,
) => {
  const { data, error, isLoading } = useSWR(
    enabled && employeeId
      ? `/api/attendance/status/${employeeId}/next-day`
      : null,
    async (url) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch next day info');
      const responseData = await response.json();

      // Transform the API response to match the component's expected structure
      const transformedData: NextDayInfo = {
        isHoliday: responseData.isHoliday || false,
        isDayOff: responseData.isDayOff || false,
        holidayInfo: responseData.holidayInfo,
        leaveInfo: responseData.leaveInfo,
        shift: responseData.shift,
        overtimes: responseData.overtimes || [],
      };

      return transformedData;
    },
    {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    },
  );

  return {
    nextDayInfo: data,
    error,
    isLoading,
  };
};

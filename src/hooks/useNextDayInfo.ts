import useSWR from 'swr';

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
      return response.json();
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

import { format } from 'date-fns';

export function formatDate(
  date: Date | null | undefined,
  formatStr: string = 'yyyy-MM-dd HH:mm:ss',
): string | null {
  if (!date) return null;
  return format(date, formatStr);
}

export const formatTime = (date: Date | string | null | undefined): string => {
  if (!date) return 'N/A';
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return dateObj.toLocaleTimeString('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
};

import { format } from 'date-fns';

export function formatDate(
  date: Date | null | undefined,
  formatStr: string = 'yyyy-MM-dd HH:mm:ss',
): string | null {
  if (!date) return null;
  return format(date, formatStr);
}

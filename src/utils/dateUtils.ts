import { format } from 'date-fns';

export const formatTime = (date: Date | string | null | undefined): string => {
  if (!date) return 'N/A';
  const dateObject = typeof date === 'string' ? new Date(date) : date;
  return `${String(dateObject.getUTCHours()).padStart(2, '0')}:${String(dateObject.getUTCMinutes()).padStart(2, '0')}`;
};

export const formatDate = (date: Date | string | null | undefined): string => {
  if (!date) return 'N/A';
  const dateObject = typeof date === 'string' ? new Date(date) : date;
  return dateObject.toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Bangkok',
  });
};

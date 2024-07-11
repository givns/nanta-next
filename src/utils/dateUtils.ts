import { format } from 'date-fns';

// utils/dateUtils.ts

// utils/dateUtils.ts

export const formatTime = (date: Date | string | null | undefined): string => {
  if (!date) return 'N/A';
  const dateObject = typeof date === 'string' ? new Date(date) : date;
  return dateObject.toLocaleTimeString('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Bangkok',
  });
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

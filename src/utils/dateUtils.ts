// utils/dateUtils.ts

export const formatTime = (time: Date | string | null | undefined): string => {
  if (!time) return 'N/A';

  // If it's already in HH:MM format, return it as is
  if (typeof time === 'string' && /^\d{2}:\d{2}$/.test(time)) {
    return time;
  }

  let hours: number;
  let minutes: number;

  if (typeof time === 'string') {
    // If it's a string but not in HH:MM format, assume it's a date string
    const dateObject = new Date(time);
    hours = dateObject.getUTCHours();
    minutes = dateObject.getUTCMinutes();
  } else if (time instanceof Date) {
    hours = time.getUTCHours();
    minutes = time.getUTCMinutes();
  } else {
    return 'Invalid Time';
  }

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
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

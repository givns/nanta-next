// utils/deviceUtils.ts

export const getDeviceType = (
  deviceSerial: string | null | undefined,
): string => {
  if (!deviceSerial) return 'ไม่ทราบ';
  return deviceSerial === 'WEBAPP001' ? 'Nanta Next' : 'เครื่องสแกนใบหน้า';
};

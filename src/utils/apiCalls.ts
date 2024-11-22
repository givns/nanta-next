import axios from 'axios';
import { ProcessingOptions, AttendanceStatusInfo } from '../types/attendance';

export const fetchLatestAttendanceStatus = async (
  employeeId: string,
): Promise<AttendanceStatusInfo> => {
  const response = await axios.get(`/api/attendance?employeeId=${employeeId}`);
  return response.data;
};

export const submitCheckInOut = async (attendanceData: ProcessingOptions) => {
  const response = await axios.post('/api/attendance', attendanceData);
  return response.data;
};

export const checkIsAllowed = async (employeeId: string) => {
  const response = await axios.get(
    `/api/attendance/allowed?employeeId=${employeeId}`,
  );
  return response.data;
};

export interface User {
  user_serial: string;
  user_no: string;
  user_lname: string;
  user_fname: string;
  user_dep: string;
}

export interface CheckInOut {
  user_serial: string;
  device_serial: string;
  timestamp: Date;
  type: 'check-in' | 'check-out';
}

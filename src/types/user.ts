export enum UserRole {
  DRIVER = 'DRIVER',
  OPERATION = 'OPERATION',
  GENERAL = 'GENERAL',
  ADMIN = 'ADMIN',
  SUPERADMIN = 'SUPERADMIN',
}

export interface UserData {
  id: string;
  lineUserId: string;
  name: string;
  nickname: string;
  department: string;
  employeeNumber: string | null;
  profilePictureUrl: string | null;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

export interface Location {
  lat: number;
  lng: number;
}

export interface CheckIn {
  id: string;
  userId: string;
  checkInTime: Date;
  checkOutTime?: Date | null;
  location: Location;
  address: string;
  reason?: string | null;
  photo: string;
  checkOutLocation?: Location | null;
  checkOutAddress?: string | null;
  checkOutReason?: string | null;
  checkOutPhoto?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CheckInFormData {
  userId: string;
  location: Location;
  address: string;
  reason?: string;
  photo: string;
  timestamp: string;
  deviceSerial?: string;
}

export interface CheckOutFormData {
  checkInId: string;
  location: Location;
  address: string;
  reason?: string;
  photo: string;
  timestamp: string;
  deviceSerial?: string;
}

export interface ExternalCheckData {
  sj: string;
  user_serial: number;
  bh: number;
  fx: number | null; // Change this to number | null
  iden: string | null;
  dev_serial: string;
  dev_state: number;
  jlzp_serial: number | null;
  gly_no: string | null;
  lx: number;
  shenhe: number;
  yich: number;
  deal_state: number;
  dev_logic_bh: number | null;
  healthstatus: number | null;
  body_temp: string | null;
  temp_error: string | null;
  passport_no: string | null;
  date: string;
  time: string;
  noti: number;
  flagmax: number;
}

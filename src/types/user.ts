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
}

export interface CheckOutFormData {
  checkInId: string;
  location: Location;
  address: string;
  reason?: string;
  photo: string;
}

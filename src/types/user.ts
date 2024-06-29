// types/user.ts
export interface UserData {
  id: string;
  lineUserId: string;
  name: string;
  nickname: string;
  department: string;
  employeeNumber: string | null;
  profilePictureUrl: string | null;
  createdAt: Date;
}

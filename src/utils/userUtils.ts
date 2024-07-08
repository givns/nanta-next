import { UserRole } from '../types/enum';

export function determineRole(
  department: string,
  isFirstUser: boolean,
): UserRole {
  if (isFirstUser) {
    return UserRole.SUPERADMIN;
  }
  switch (department) {
    case 'ฝ่ายขนส่ง':
      return UserRole.DRIVER;
    case 'ฝ่ายปฏิบัติการ':
      return UserRole.OPERATION;
    default:
      return UserRole.GENERAL;
  }
}

export function determineRichMenuId(role: UserRole): string {
  switch (role) {
    case UserRole.SUPERADMIN:
      return 'richmenu-5e2677dc4e68d4fde747ff413a88264f';
    case UserRole.DRIVER:
      return 'richmenu-02c1de10ff52ab687e083fc9cf28e2ce';
    case UserRole.OPERATION:
      return 'richmenu-834c002dbe1ccfbedb54a76b6c78bdde';
    case UserRole.GENERAL:
    default:
      return 'richmenu-02c1de10ff52ab687e083fc9cf28e2ce';
  }
}

import axios from 'axios';
import { User, LeaveRequest, OvertimeRequest } from '@prisma/client';

class UserMappingService {
  private async apiCall<T>(
    endpoint: string,
    params: any = {},
  ): Promise<T | null> {
    try {
      const response = await axios.get(`/api/${endpoint}`, {
        params,
        timeout: 5000, // 5 seconds timeout
      });
      return response.status === 200 ? response.data : null;
    } catch (error) {
      console.error(`API error for endpoint ${endpoint}:`, error);
      return null;
    }
  }

  async getLineUserId(employeeId: string): Promise<string | null> {
    console.log(`Fetching LINE User ID for employee: ${employeeId}`);
    const userData = await this.apiCall<{ user: User }>('user-data-lineuser', {
      employeeId,
    });
    if (userData?.user) {
      if (!userData.user.lineUserId) {
        console.warn(`No LINE User ID found for employeeId: ${employeeId}`);
      }
      return userData.user.lineUserId || null;
    }
    console.warn(`No user found for employeeId: ${employeeId}`);
    return null;
  }

  async getUserByEmployeeId(employeeId: string): Promise<User | null> {
    const userData = await this.apiCall<{ user: User }>('user-data', {
      employeeId,
    });
    return userData?.user || null;
  }

  async getAdminUsers(): Promise<User[]> {
    const adminUsersData = await this.apiCall<{ users: User[] }>('admin-users');
    return adminUsersData?.users || [];
  }

  async getRequestById<T extends 'leave' | 'overtime'>(
    requestId: string,
    requestType: T,
  ): Promise<T extends 'leave' ? LeaveRequest | null : OvertimeRequest | null> {
    const requestData = await this.apiCall<{
      request: LeaveRequest | OvertimeRequest;
    }>(`${requestType}-request`, { requestId });
    return (requestData?.request as any) || null;
  }

  async getRequestCountForAllAdmins(): Promise<number> {
    const countData = await this.apiCall<{ count: number }>(
      'pending-requests-count',
    );
    return countData?.count || 0;
  }
}

export default UserMappingService;

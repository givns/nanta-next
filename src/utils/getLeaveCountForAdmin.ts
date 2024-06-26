import { PrismaClient } from '@prisma/client';
import { LeaveRequest } from '@prisma/client';
const prisma = new PrismaClient();

const getLeaveCountForAdmin = async (adminId: string): Promise<number> => {
  const now = new Date();
  let currentMonthStart: Date;

  if (now.getDate() < 26) {
    // Before the 26th, get the 26th of the previous month
    const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 26);
    currentMonthStart = previousMonth;
  } else {
    // On or after the 26th, get the 26th of the current month
    currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 26);
  }

  console.log('Admin ID:', adminId);
  console.log('Current Month Start:', currentMonthStart.toISOString());

  try {
    const leaveRequests = await prisma.leaveRequest.findMany({
      where: {
        createdAt: {
          gte: currentMonthStart,
        },
      },
    });

    console.log('Leave Requests Found:', leaveRequests.length);
    leaveRequests.forEach((request: LeaveRequest) => {
      console.log(
        `Leave Request: ${request.id}, Created At: ${request.createdAt}`,
      );
    });

    return leaveRequests.length;
  } catch (error) {
    console.error('Error fetching leave requests:', error);
    return 0;
  }
};

export default getLeaveCountForAdmin;

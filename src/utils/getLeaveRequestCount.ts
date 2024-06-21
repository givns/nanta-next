import { PrismaClient } from '@prisma/client';

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
  console.log('Current Month Start:', currentMonthStart);

  const leaveRequests = await prisma.leaveRequest.findMany({
    where: {
      approverId: adminId,
      createdAt: {
        gte: currentMonthStart,
      },
    },
  });

  console.log('Leave Requests:', leaveRequests);

  return leaveRequests.length;
};

export default getLeaveCountForAdmin;

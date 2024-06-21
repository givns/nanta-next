import { PrismaClient } from '@prisma/client';
import dayjs from 'dayjs';

const prisma = new PrismaClient();

export const getLeaveRequestCount = async () => {
  const today = dayjs();
  const currentMonth = today.month();
  const currentYear = today.year();

  let startOfPeriod, endOfPeriod;

  if (today.date() >= 26) {
    startOfPeriod = dayjs(`${currentYear}-${currentMonth + 1}-26`)
      .subtract(1, 'month')
      .startOf('day');
    endOfPeriod = dayjs(`${currentYear}-${currentMonth + 1}-25`).endOf('day');
  } else {
    startOfPeriod = dayjs(`${currentYear}-${currentMonth}-26`)
      .subtract(1, 'month')
      .startOf('day');
    endOfPeriod = dayjs(`${currentYear}-${currentMonth}-25`).endOf('day');
  }

  const leaveRequestCount = await prisma.leaveRequest.count({
    where: {
      createdAt: {
        gte: startOfPeriod.toDate(),
        lt: endOfPeriod.toDate(),
      },
      status: 'Pending',
    },
  });

  return leaveRequestCount;
};

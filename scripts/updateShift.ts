import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function updateShifts() {
  const shiftData = [
    {
      shiftCode: 'SHIFT101',
      name: 'เข้างาน 6 โมง',
      startTime: '06:00',
      endTime: '15:00',
      workDays: [1, 2, 3, 4, 5, 6],
    },
    {
      shiftCode: 'SHIFT102',
      name: 'เข้างาน 7 โมง',
      startTime: '07:00',
      endTime: '16:00',
      workDays: [1, 2, 3, 4, 5, 6],
    },
    {
      shiftCode: 'SHIFT103',
      name: 'เข้างานช่วงเวลาปกติ',
      startTime: '08:00',
      endTime: '17:00',
      workDays: [1, 2, 3, 4, 5, 6],
    },
    {
      shiftCode: 'SHIFT104',
      name: 'เข้างานบ่าย 2 โมง',
      startTime: '14:00',
      endTime: '23:00',
      workDays: [0, 1, 2, 3, 4, 5],
    },
    {
      shiftCode: 'SHIFT201',
      name: 'เข้างานตี 5',
      startTime: '05:00',
      endTime: '14:00',
      workDays: [1, 2, 3, 4, 5, 6],
    },
    {
      shiftCode: 'SHIFT202',
      name: 'เข้างาน 10 โมงเช้า',
      startTime: '10:00',
      endTime: '20:00',
      workDays: [1, 2, 3, 4, 5, 6],
    },
    {
      shiftCode: 'SHIFT203',
      name: 'เข้างานบ่ายโมง',
      startTime: '13:00',
      endTime: '22:00',
      workDays: [0, 1, 2, 3, 4, 5],
    },
  ];

  for (const shift of shiftData) {
    await prisma.shift.upsert({
      where: { shiftCode: shift.shiftCode },
      update: shift,
      create: shift,
    });
  }

  console.log('Shifts updated successfully');
}

updateShifts()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedData() {
  const shifts = [
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
      name: 'เข้างานบ่าย 1 โมง',
      startTime: '13:00',
      endTime: '22:00',
      workDays: [0, 1, 2, 3, 4, 5],
    },
    {
      shiftCode: 'SHIFT105',
      name: 'เข้างาน 7 โมงครึ่ง',
      startTime: '07:30',
      endTime: '15:30',
      workDays: [1, 2, 3, 4, 5, 6],
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
      name: 'เข้างานบ่าย 2 โมง',
      startTime: '14:00',
      endTime: '23:00',
      workDays: [0, 1, 2, 3, 4, 5],
    },
  ];

  const departments = [
    'ฝ่ายปฏิบัติการ',
    'ฝ่ายผลิต-กระบวนการที่ 1 (บ่าย)',
    'ฝ่ายผลิต-กระบวนการที่ 2 (เช้า)',
    'ฝ่ายผลิต-คัดคุณภาพและบรรจุ',
    'ฝ่ายผลิต-ข้าวเกรียบ-ข้าวตัง',
    'ฝ่ายผลิต-วิจัยและพัฒนาคุณภาพผลิตภัณฑ์',
    'ฝ่ายประกันคุณภาพ',
    'ฝ่ายคลังสินค้าและแพ็คกิ้ง',
    'ฝ่ายจัดส่งสินค้า',
    'ฝ่ายบริหารงานขาย',
    'ฝ่ายจัดซื้อและประสานงาน',
    'ฝ่ายบัญชีและการเงิน',
    'ฝ่ายทรัพยากรบุคคล',
    'ฝ่ายรักษาความสะอาด',
    'ฝ่ายรักษาความปลอดภัย',
  ];

  for (const shift of shifts) {
    await prisma.shift.upsert({
      where: { shiftCode: shift.shiftCode },
      update: shift,
      create: shift,
    });
  }

  for (const dept of departments) {
    await prisma.department.upsert({
      where: { name: dept },
      update: {},
      create: { name: dept },
    });
  }

  console.log('Data seeding completed');
}

seedData()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

// scripts/preloadDepartments.ts

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const departments = [
  { externalId: 10012, name: 'ฝ่ายจัดส่งสินค้า' },
  { externalId: 10038, name: 'ฝ่ายปฏิบัติการ' },
  { externalId: 10030, name: 'ฝ่ายผลิต-กระบวนการที่ 1 (บ่าย)' },
  { externalId: 10031, name: 'ฝ่ายผลิต-กระบวนการที่ 2 (เช้า)' },
  { externalId: 10032, name: 'ฝ่ายผลิต-คัดคุณภาพและบรรจุ' },
  { externalId: 10049, name: 'ฝ่ายผลิต-ข้าวเกรียบ-ข้าวตัง' },
  { externalId: 10053, name: 'ฝ่ายผลิต-วิจัยและพัฒนาคุณภาพผลิตภัณฑ์' },
  { externalId: 10022, name: 'ฝ่ายประกันคุณภาพ' },
  { externalId: 10010, name: 'ฝ่ายคลังสินค้าและแพ็คกิ้ง' },
  { externalId: 10011, name: 'ฝ่ายจัดซื้อและประสานงานขาย' },
  { externalId: 10037, name: 'ฝ่ายบัญชีและการเงิน' },
  { externalId: 10013, name: 'ฝ่ายทรัพยากรบุคคล' },
  { externalId: 10016, name: 'ฝ่ายรักษาความสะอาด' },
  { externalId: 10020, name: 'ฝ่ายรักษาความปลอดภัย' },
];

async function preloadDepartments() {
  for (const dept of departments) {
    await prisma.department.upsert({
      where: { externalId: dept.externalId },
      update: { name: dept.name },
      create: { externalId: dept.externalId, name: dept.name },
    });
  }
  console.log('Departments preloaded successfully');
}

preloadDepartments()
  .catch((e) => {
    console.error('Error preloading departments:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

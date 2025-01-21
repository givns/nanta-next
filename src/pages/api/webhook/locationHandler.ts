// webhook/locationHandler.ts
import { WebhookEvent } from '@line/bot-sdk';
import { PrismaClient } from '@prisma/client';
import { LocationAssistanceService } from '../../../services/location/LocationAssistanceService';
import { NotificationService } from '../../../services/NotificationService';

export async function handleLocationAssistanceAction(
  event: WebhookEvent,
  prisma: PrismaClient,
  locationService: LocationAssistanceService,
  notificationService: NotificationService,
  client: any,
) {
  if (event.type !== 'postback' || !event.source.userId) return;

  const data = new URLSearchParams(event.postback.data);
  const action = data.get('action');
  const requestId = data.get('requestId');

  if (!requestId || !event.source.userId) return;

  // Get admin user
  const admin = await prisma.user.findFirst({
    where: { lineUserId: event.source.userId },
  });

  if (!admin?.employeeId) {
    await client.replyMessage(event.replyToken, {
      type: 'text',
      text: 'ไม่พบข้อมูลผู้ใช้',
    });
    return;
  }

  try {
    switch (action) {
      case 'approve_location':
        await handleQuickLocationApproval(
          requestId,
          admin.employeeId,
          event.replyToken,
          locationService,
          client,
        );
        break;

      case 'reject_location':
        await promptForRejectionReason(requestId, event.replyToken, client);
        break;

      case 'reject_location_reason':
        await handleLocationRejection(
          requestId,
          admin.employeeId,
          data.get('reason') || 'ไม่ระบุเหตุผล',
          event.replyToken,
          locationService,
          client,
        );
        break;

      default:
        console.warn('Unknown location assistance action:', action);
    }
  } catch (error) {
    console.error('Error handling location assistance action:', error);
    await client.replyMessage(event.replyToken, {
      type: 'text',
      text: 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง',
    });
  }
}

async function handleQuickLocationApproval(
  requestId: string,
  adminId: string,
  replyToken: string,
  locationService: LocationAssistanceService,
  client: any,
) {
  await locationService.approveRequest(requestId, {
    verificationNote: 'อนุมัติผ่าน LINE',
    verifiedBy: adminId,
    verifiedAt: new Date(),
  });

  await client.replyMessage(replyToken, {
    type: 'text',
    text: '✅ อนุมัติคำขอเรียบร้อยแล้ว',
  });
}

async function promptForRejectionReason(
  requestId: string,
  replyToken: string,
  client: any,
) {
  await client.replyMessage(replyToken, {
    type: 'flex',
    altText: 'เลือกเหตุผลที่ไม่อนุมัติ',
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          {
            type: 'text',
            text: 'กรุณาเลือกเหตุผลที่ไม่อนุมัติ',
            weight: 'bold',
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'button',
            action: {
              type: 'postback',
              label: 'ตำแหน่งไม่ถูกต้อง',
              data: `action=reject_location_reason&requestId=${requestId}&reason=ตำแหน่งไม่ถูกต้อง`,
            },
            style: 'secondary',
          },
          {
            type: 'button',
            action: {
              type: 'postback',
              label: 'อยู่นอกพื้นที่ที่กำหนด',
              data: `action=reject_location_reason&requestId=${requestId}&reason=อยู่นอกพื้นที่ที่กำหนด`,
            },
            style: 'secondary',
          },
          {
            type: 'button',
            action: {
              type: 'postback',
              label: 'ต้องการข้อมูลเพิ่มเติม',
              data: `action=reject_location_reason&requestId=${requestId}&reason=ต้องการข้อมูลเพิ่มเติม กรุณาติดต่อ HR`,
            },
            style: 'secondary',
          },
        ],
      },
    },
  });
}

async function handleLocationRejection(
  requestId: string,
  adminId: string,
  reason: string,
  replyToken: string,
  locationService: LocationAssistanceService,
  client: any,
) {
  await locationService.rejectRequest(requestId, {
    rejectionReason: reason,
    verifiedBy: adminId,
    verifiedAt: new Date(),
  });

  await client.replyMessage(replyToken, {
    type: 'text',
    text: '❌ ปฏิเสธคำขอเรียบร้อยแล้ว',
  });
}

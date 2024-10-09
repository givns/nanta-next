import { FlexMessage, FlexComponent, FlexText } from '@line/bot-sdk';
import { User, LeaveRequest, OvertimeRequest } from '@prisma/client';

export const generateApprovalMessageForAdmins = (
  user: User,
  request: LeaveRequest | OvertimeRequest,
  admin: User,
  requestType: 'leave' | 'overtime',
): FlexMessage => {
  const isLeaveRequest = requestType === 'leave';
  const requestTypeText = isLeaveRequest ? 'ลางาน' : 'ทำงานล่วงเวลา';

  const bodyContents: FlexComponent[] = [
    {
      type: 'text',
      text: `ผู้อนุมัติ: ${admin.name}`,
      size: 'sm',
      weight: 'bold',
      wrap: true,
    },
    {
      type: 'text',
      text: `ผู้ยื่น: ${user.name}`,
      size: 'sm',
      weight: 'bold',
      wrap: true,
    },
    ...(isLeaveRequest
      ? [
          {
            type: 'text',
            text: `ประเภทการลา: ${(request as LeaveRequest).leaveType}`,
            size: 'sm',
            weight: 'bold',
            wrap: true,
          } as FlexText,
          {
            type: 'text',
            text: `วันที่: ${new Date(
              (request as LeaveRequest).startDate,
            ).toLocaleDateString('th-TH', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            })} - ${new Date(
              (request as LeaveRequest).endDate,
            ).toLocaleDateString('th-TH', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            })} (${(request as LeaveRequest).fullDayCount} วัน)`,
            size: 'sm',
            weight: 'bold',
            wrap: true,
          } as FlexText,
        ]
      : [
          {
            type: 'text',
            text: `วันที่: ${new Date(
              (request as OvertimeRequest).date,
            ).toLocaleDateString('th-TH', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            })}`,
            size: 'sm',
            wrap: true,
          } as FlexText,
          {
            type: 'text',
            text: `เวลา: ${(request as OvertimeRequest).startTime} - ${(request as OvertimeRequest).endTime}`,
            size: 'sm',
            weight: 'bold',
            wrap: true,
          } as FlexText,
        ]),
    {
      type: 'text',
      text: `สาเหตุ: ${request.reason}`,
      size: 'sm',
      weight: 'bold',
      wrap: true,
    } as FlexText,
  ];

  return {
    type: 'flex',
    altText: `แจ้งเตือน:คำขอ${requestTypeText}ได้ถูกอนุมัติ`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'horizontal',
        contents: [
          {
            type: 'box',
            layout: 'vertical',
            contents: [
              {
                type: 'text',
                text: isLeaveRequest
                  ? 'คำขอลาได้รับการอนุมัติ'
                  : 'คำขอทำงานล่วงเวลาได้รับการอนุมัติ',
                color: '#000000',
                size: 'xl',
                flex: 4,
                weight: 'bold',
                align: 'center',
                gravity: 'center',
              },
            ],
          },
        ],
        paddingAll: '20px',
        backgroundColor: '#F0F0F0',
        spacing: 'md',
        paddingTop: '22px',
        height: '100px',
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: bodyContents,
        spacing: 'md',
        paddingAll: '20px',
      },
    },
  };
};

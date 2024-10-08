import { FlexMessage, FlexComponent, FlexText } from '@line/bot-sdk';
import { User, LeaveRequest, OvertimeRequest } from '@prisma/client';

export const generateApprovalMessageForAdmins = (
  user: User,
  request: LeaveRequest | OvertimeRequest,
  admin: User,
  requestType: 'leave' | 'overtime',
): FlexMessage => {
  const isLeaveRequest = requestType === 'leave';
  const requestTypeText = isLeaveRequest ? 'Leave' : 'Overtime';

  const bodyContents: FlexComponent[] = [
    {
      type: 'text',
      text: `อนุมัติโดย: ${admin.name} (${admin.nickname})`,
      size: 'sm',
      wrap: true,
    },
    {
      type: 'text',
      text: `ยื่นขอ${isLeaveRequest ? 'ลา' : 'ทำงานล่วงเวลา'} โดย ${user.name} (${user.nickname})`,
      size: 'sm',
      wrap: true,
    },
    ...(isLeaveRequest
      ? [
          {
            type: 'text',
            text: `ประเภทการลา: ${(request as LeaveRequest).leaveType}`,
            size: 'sm',
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
            wrap: true,
          } as FlexText,
        ]),
    {
      type: 'text',
      text: `สาเหตุ: ${request.reason}`,
      size: 'sm',
      wrap: true,
    } as FlexText,
  ];

  return {
    type: 'flex',
    altText: `${requestTypeText} Request Approved Notification`,
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
                  ? 'ใบลาถูกอนุมัติ'
                  : 'คำขอทำงานล่วงเวลาถูกอนุมัติ',
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

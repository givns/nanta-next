import { FlexMessage, FlexComponent, FlexText } from '@line/bot-sdk';
import { User, LeaveRequest, OvertimeRequest } from '@prisma/client';

export const generateApprovalMessage = (
  user: User,
  request: LeaveRequest | OvertimeRequest,
  requestType: 'leave' | 'overtime',
): FlexMessage => {
  const isLeaveRequest = requestType === 'leave';
  const requestTypeText = isLeaveRequest ? 'Leave' : 'Overtime';

  const contentComponents: FlexComponent[] = [
    {
      type: 'text',
      text: `${user.name} (${user.nickname})`,
      weight: 'bold',
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
    {
      type: 'text',
      text: `วันที่ยื่น: ${new Date(request.createdAt).toLocaleDateString(
        'th-TH',
        {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        },
      )}`,
      size: 'sm',
      color: '#4682B4',
    } as FlexText,
  ];

  return {
    type: 'flex',
    altText: `${requestTypeText} Request Approved`,
    contents: {
      type: 'bubble',
      size: 'giga',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: `${requestTypeText} Request Approved`,
            color: '#000000',
            align: 'start',
            size: 'xl',
            weight: 'bold',
          },
        ],
        backgroundColor: '#F0F0F0',
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              {
                type: 'box',
                layout: 'vertical',
                contents: [
                  {
                    type: 'image',
                    url: user.profilePictureUrl || '',
                    aspectMode: 'cover',
                    size: 'full',
                  },
                ],
                cornerRadius: '100px',
                width: '72px',
                height: '72px',
              },
              {
                type: 'box',
                layout: 'vertical',
                contents: contentComponents,
              },
            ],
            spacing: 'xl',
            paddingAll: '20px',
          },
        ],
        paddingAll: '0px',
      },
      styles: {
        hero: {
          backgroundColor: '#FFFFFF',
        },
      },
    },
  };
};

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
      text: `ผู้ขอ${isLeaveRequest ? 'ลา' : 'ทำงานล่วงเวลา'}: ${user.name} (${user.nickname})`,
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

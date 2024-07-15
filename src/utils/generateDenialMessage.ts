import { FlexMessage, FlexComponent, FlexBox, FlexText } from '@line/bot-sdk';
import { User, LeaveRequest, OvertimeRequest } from '@prisma/client';

export const generateDenialMessage = (
  user: User,
  request: LeaveRequest | OvertimeRequest,
  denialReason: string,
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
    } as FlexText,
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
      text: `เหตุผลที่ถูกปฏิเสธ: ${denialReason}`,
      size: 'sm',
      wrap: true,
      color: '#FF0000',
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
    altText: `${requestTypeText} Request Denied`,
    contents: {
      type: 'bubble',
      size: 'giga',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: `${requestTypeText} Request Denied`,
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
      footer: {
        type: 'box',
        layout: 'horizontal',
        spacing: 'sm',
        contents: [
          {
            type: 'button',
            style: 'primary',
            height: 'sm',
            action: {
              type: 'uri',
              label: 'ส่งคำขอใหม่',
              uri: `https://liff.line.me/${process.env.NEXT_PUBLIC_LIFF_ID}/${requestType}-request?resubmit=true&originalId=${request.id}`,
            },
            color: '#0662FF',
          },
        ],
      },
      styles: {
        hero: {
          backgroundColor: '#FFFFFF',
        },
      },
    },
  };
};

export const generateDenialMessageForAdmins = (
  user: User,
  request: LeaveRequest | OvertimeRequest,
  admin: User,
  denialReason: string,
  requestType: 'leave' | 'overtime',
): FlexMessage => {
  const isLeaveRequest = requestType === 'leave';
  const requestTypeText = isLeaveRequest ? 'Leave' : 'Overtime';

  const bodyContents: FlexComponent[] = [
    {
      type: 'text',
      text: `ปฏิเสธโดย: ${admin.name} (${admin.nickname})`,
      size: 'sm',
      wrap: true,
    } as FlexText,
    {
      type: 'text',
      text: `ผู้ขอ${isLeaveRequest ? 'ลา' : 'ทำงานล่วงเวลา'}: ${user.name} (${user.nickname})`,
      size: 'sm',
      wrap: true,
    } as FlexText,
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
      text: `เหตุผลที่ปฏิเสธ: ${denialReason}`,
      size: 'sm',
      wrap: true,
      color: '#FF0000',
    } as FlexText,
  ];

  return {
    type: 'flex',
    altText: `${requestTypeText} Request Denied Notification`,
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
                  ? 'ใบลาถูกปฏิเสธ'
                  : 'คำขอทำงานล่วงเวลาถูกปฏิเสธ',
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

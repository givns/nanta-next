import { FlexMessage } from '@line/bot-sdk';
import { User, LeaveRequest } from '@prisma/client';

export const generateDenialMessage = (
  user: User,
  leaveRequest: LeaveRequest,
  denialReason: string,
): FlexMessage => {
  return {
    type: 'flex',
    altText: 'Leave Request Denied',
    contents: {
      type: 'bubble',
      size: 'giga',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: 'Leave Request Denied',
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
                contents: [
                  {
                    type: 'text',
                    text: `${user.name} (${user.nickname})`,
                    weight: 'bold',
                    size: 'sm',
                    wrap: true,
                  },
                  {
                    type: 'text',
                    text: `ประเภทการลา: ${leaveRequest.leaveType}`,
                    size: 'sm',
                    wrap: true,
                  },
                  {
                    type: 'text',
                    text: `วันที่: ${new Date(
                      leaveRequest.startDate,
                    ).toLocaleDateString('th-TH', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })} - ${new Date(leaveRequest.endDate).toLocaleDateString(
                      'th-TH',
                      {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      },
                    )} (${leaveRequest.fullDayCount} วัน)`,
                    size: 'sm',
                    wrap: true,
                  },
                  {
                    type: 'text',
                    text: `สาเหตุ: ${leaveRequest.reason}`,
                    size: 'sm',
                    wrap: true,
                  },
                  {
                    type: 'text',
                    text: `เหตุผลที่ถูกปฏิเสธ: ${denialReason}`,
                    size: 'sm',
                    wrap: true,
                    color: '#FF0000',
                  },
                  {
                    type: 'text',
                    text: `วันที่ยื่น: ${new Date(
                      leaveRequest.createdAt,
                    ).toLocaleDateString('th-TH', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}`,
                    size: 'sm',
                    color: '#4682B4',
                  },
                ],
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
        contents: [
          {
            type: 'button',
            action: {
              type: 'message',
              label: 'กลับ',
              text: 'กลับ',
            },
            color: '#F0F0F0',
            style: 'secondary',
            adjustMode: 'shrink-to-fit',
            margin: 'lg',
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
  leaveRequest: LeaveRequest,
  admin: User,
  denialReason: string,
): FlexMessage => {
  return {
    type: 'flex',
    altText: 'Leave Request Denied Notification',
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
                text: 'ใบลาถูกปฏิเสธ',
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
        contents: [
          {
            type: 'text',
            text: `ปฏิเสธโดย: ${admin.name} (${admin.nickname})`,
            size: 'sm',
            wrap: true,
          },
          {
            type: 'text',
            text: `ผู้ขอลา: ${user.name} (${user.nickname})`,
            size: 'sm',
            wrap: true,
          },
          {
            type: 'text',
            text: `ประเภทการลา: ${leaveRequest.leaveType}`,
            size: 'sm',
            wrap: true,
          },
          {
            type: 'text',
            text: `วันที่: ${new Date(
              leaveRequest.startDate,
            ).toLocaleDateString('th-TH', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            })} - ${new Date(leaveRequest.endDate).toLocaleDateString('th-TH', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            })} (${leaveRequest.fullDayCount} วัน)`,
            size: 'sm',
            wrap: true,
          },
          {
            type: 'text',
            text: `สาเหตุ: ${leaveRequest.reason}`,
            size: 'sm',
            wrap: true,
          },
          {
            type: 'text',
            text: `เหตุผลที่ปฏิเสธ: ${denialReason}`,
            size: 'sm',
            wrap: true,
            color: '#FF0000',
          },
        ],
        spacing: 'md',
        paddingAll: '20px',
      },
    },
  };
};

import { FlexMessage } from '@line/bot-sdk';
import { User, LeaveRequest } from '@prisma/client';

export const generateApprovalMessage = (
  user: User,
  leaveRequest: LeaveRequest,
): FlexMessage => {
  return {
    type: 'flex',
    altText: 'Leave Request Approved',
    contents: {
      type: 'bubble',
      size: 'giga',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: 'Leave Request Approved',
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
  leaveRequest: LeaveRequest,
  admin: User,
): FlexMessage => {
  return {
    type: 'flex',
    altText: 'Leave Request Approved Notification',
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
                text: 'ใบลาถูกอนุมัติ',
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
            text: `อนุมัติโดย: ${admin.name} (${admin.nickname})`,
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
        ],
        spacing: 'md',
        paddingAll: '20px',
      },
    },
  };
};

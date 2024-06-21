import { Client, FlexMessage } from '@line/bot-sdk';
import { PrismaClient, User, LeaveRequest } from '@prisma/client';
import { sendLeaveRequestNotification } from './sendLeaveRequestNotification';

const client = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
});

const prisma = new PrismaClient();

export const sendApproveNotification = async (
  user: User,
  leaveRequest: LeaveRequest,
) => {
  const message: FlexMessage = {
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

  await client.pushMessage(user.lineUserId, message);
};

export const sendDenyNotification = async (
  user: User,
  leaveRequest: LeaveRequest,
  denialReason: string,
) => {
  const message: FlexMessage = {
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

  await client.pushMessage(user.lineUserId, message);
};

export const notifyAdmins = async (leaveRequest: LeaveRequest) => {
  const admins = await prisma.user.findMany({
    where: {
      OR: [{ role: 'admin' }, { role: 'superadmin' }],
    },
  });

  for (const admin of admins) {
    const requestCount = await getLeaveRequestCount();
    const message: FlexMessage = {
      type: 'flex',
      altText: 'Leave Request Notification',
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
                  text: 'แบบฟอร์มขอลางาน',
                  color: '#000000',
                  size: 'xl',
                  flex: 4,
                  weight: 'bold',
                  align: 'center',
                  gravity: 'center',
                },
              ],
            },
            {
              type: 'box',
              layout: 'vertical',
              contents: [],
              width: '10px',
            },
            {
              type: 'box',
              layout: 'vertical',
              contents: [
                {
                  type: 'text',
                  text: `${requestCount}`,
                  align: 'center',
                  gravity: 'center',
                  color: '#FFFFFF',
                  wrap: true,
                  adjustMode: 'shrink-to-fit',
                  weight: 'bold',
                },
              ],
              width: '25px',
              height: '25px',
              cornerRadius: '30px',
              backgroundColor: '#FF1900',
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
              type: 'box',
              layout: 'horizontal',
              contents: [
                {
                  type: 'box',
                  layout: 'vertical',
                  contents: [],
                  flex: 1,
                },
              ],
            },
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
                      url: admin.profilePictureUrl || '',
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
                      text: `${admin.name} (${admin.nickname})`,
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
        footer: {
          type: 'box',
          layout: 'horizontal',
          contents: [
            {
              type: 'button',
              action: {
                type: 'postback',
                label: 'อนุมัติ',
                data: `action=approve&requestId=${leaveRequest.id}`,
              },
              color: '#00FF7F',
              style: 'secondary',
              adjustMode: 'shrink-to-fit',
            },
            {
              type: 'button',
              action: {
                type: 'uri',
                label: 'ไม่อนุมัติ',
                uri: `https://liff.line.me/${process.env.NEXT_PUBLIC_LIFF_ID}?path=/deny-reason&requestId=${leaveRequest.id}`,
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

    await client.pushMessage(admin.lineUserId, message);
  }
};

export const getLeaveRequestCount = async () => {
  const startOfMonth = new Date(
    new Date().getFullYear(),
    new Date().getMonth(),
    1,
  );
  const endOfMonth = new Date(
    new Date().getFullYear(),
    new Date().getMonth() + 1,
    0,
  );

  const leaveRequestCount = await prisma.leaveRequest.count({
    where: {
      createdAt: {
        gte: startOfMonth,
        lte: endOfMonth,
      },
    },
  });

  return leaveRequestCount;
};

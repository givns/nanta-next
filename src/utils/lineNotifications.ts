// utils/lineNotifications.ts

import axios from 'axios';

const LINE_MESSAGING_API = 'https://api.line.me/v2/bot/message/push';
const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;

export async function sendConfirmationMessage(
  userId: string,
  isCheckIn: boolean,
  time: Date,
) {
  const message = isCheckIn
    ? `Check-in recorded at ${time.toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok' })}`
    : `Check-out recorded at ${time.toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok' })}`;

  const data = {
    to: userId,
    messages: [{ type: 'text', text: message }],
  };

  try {
    await axios.post(LINE_MESSAGING_API, data, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
      },
    });
    console.log('Confirmation message sent successfully');
  } catch (error) {
    console.error('Error sending confirmation message:', error);
  }
}

export async function sendDailySummary(
  userId: string,
  workHours: number,
  monthlyWorkDays: number,
) {
  const message = {
    type: 'flex',
    altText: 'Daily Work Summary',
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: 'Daily Work Summary',
            weight: 'bold',
            size: 'xl',
          },
          {
            type: 'box',
            layout: 'vertical',
            margin: 'lg',
            spacing: 'sm',
            contents: [
              {
                type: 'box',
                layout: 'baseline',
                spacing: 'sm',
                contents: [
                  {
                    type: 'text',
                    text: 'Hours Worked:',
                    color: '#aaaaaa',
                    size: 'sm',
                    flex: 5,
                  },
                  {
                    type: 'text',
                    text: `${workHours.toFixed(2)}`,
                    wrap: true,
                    color: '#666666',
                    size: 'sm',
                    flex: 5,
                  },
                ],
              },
              {
                type: 'box',
                layout: 'baseline',
                spacing: 'sm',
                contents: [
                  {
                    type: 'text',
                    text: 'Monthly Work Days:',
                    color: '#aaaaaa',
                    size: 'sm',
                    flex: 5,
                  },
                  {
                    type: 'text',
                    text: `${monthlyWorkDays}`,
                    wrap: true,
                    color: '#666666',
                    size: 'sm',
                    flex: 5,
                  },
                ],
              },
            ],
          },
        ],
      },
    },
  };

  const data = {
    to: userId,
    messages: [message],
  };

  try {
    await axios.post(LINE_MESSAGING_API, data, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
      },
    });
    console.log('Daily summary sent successfully');
  } catch (error) {
    console.error('Error sending daily summary:', error);
  }
}

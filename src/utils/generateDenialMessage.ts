import { User, LeaveRequest, OvertimeRequest } from '@prisma/client';
import { TextMessage } from '@line/bot-sdk';

export const generateDenialMessageForAdmins = (
  user: User,
  request: LeaveRequest | OvertimeRequest,
  admin: User,
  requestType: 'leave' | 'overtime',
): TextMessage => {
  const isLeaveRequest = requestType === 'leave';
  const requestTypeText = isLeaveRequest ? 'ลางาน' : 'ทำงานล่วงเวลา';

  let messageText = `⛔️ คำขอ${requestTypeText}ถูกปฏิเสธ\n\n`;
  messageText += `👤 ปฏิเสธโดย: ${admin.name}\n`;
  messageText += `📋 ผู้ยื่น: ${user.name}\n\n`;

  if (isLeaveRequest) {
    const leaveReq = request as LeaveRequest;
    messageText += `📌 ประเภทการลา: ${leaveReq.leaveType}\n`;
    messageText += `📅 วันที่: ${new Date(
      leaveReq.startDate,
    ).toLocaleDateString('th-TH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })} - ${new Date(leaveReq.endDate).toLocaleDateString('th-TH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })} (${leaveReq.fullDayCount} วัน)\n`;
  } else {
    const overtimeReq = request as OvertimeRequest;
    messageText += `📅 วันที่: ${new Date(overtimeReq.date).toLocaleDateString(
      'th-TH',
      {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      },
    )}\n`;
    messageText += `⏰ เวลา: ${overtimeReq.startTime} - ${overtimeReq.endTime}\n`;
  }

  messageText += `\n💬 สาเหตุ: ${request.reason}`;

  return {
    type: 'text' as const,
    text: messageText,
  };
};

import { User, LeaveRequest, OvertimeRequest } from '@prisma/client';

export const generateApprovalMessageForAdmins = (
  user: User,
  request: LeaveRequest | OvertimeRequest,
  admin: User,
  requestType: 'leave' | 'overtime',
) => {
  const isLeaveRequest = requestType === 'leave';
  const requestTypeText = isLeaveRequest ? 'ลางาน' : 'ทำงานล่วงเวลา';

  let messageText = `✅ คำขอ${requestTypeText}ได้รับการอนุมัติ\n\n`;
  messageText += `ผู้อนุมัติ: ${admin.name}\n`;
  messageText += `ผู้ยื่น: ${user.name}\n\n`;

  if (isLeaveRequest) {
    const leaveReq = request as LeaveRequest;
    messageText += `📌 ประเภทการลา: ${leaveReq.leaveType}\n`;
    messageText += `วันที่: ${new Date(leaveReq.startDate).toLocaleDateString(
      'th-TH',
      {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      },
    )} - ${new Date(leaveReq.endDate).toLocaleDateString('th-TH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })} (${leaveReq.fullDayCount} วัน)\n`;
  } else {
    const overtimeReq = request as OvertimeRequest;
    messageText += `วันที่: ${new Date(overtimeReq.date).toLocaleDateString(
      'th-TH',
      {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      },
    )}\n`;
    messageText += `เวลา: ${overtimeReq.startTime} - ${overtimeReq.endTime}\n`;
  }

  messageText += `\n💬 สาเหตุ: ${request.reason}`;

  return {
    type: 'text' as const,
    text: messageText,
  };
};

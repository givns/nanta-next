export const generateApprovalMessage = (
  requesterName: string,
  leaveType: string,
  leaveDates: string,
  reason: string,
) => {
  return {
    type: 'flex',
    altText: 'Leave Request Approved',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: 'คำขอลางานของคุณได้รับอนุมัติแล้ว',
            weight: 'bold',
            size: 'lg',
            color: '#ffffff',
          },
        ],
        backgroundColor: '#4CAF50',
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: 'ประเภทการลา',
            weight: 'bold',
          },
          {
            type: 'text',
            text: leaveType,
          },
          {
            type: 'text',
            text: 'วันที่',
            weight: 'bold',
          },
          {
            type: 'text',
            text: leaveDates,
          },
          {
            type: 'text',
            text: 'สาเหตุ',
            weight: 'bold',
          },
          {
            type: 'text',
            text: reason,
          },
        ],
      },
    },
  };
};

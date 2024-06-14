export const generateDenialMessage = (
  requesterName: string,
  leaveType: string,
  leaveDates: string,
  reason: string,
) => {
  return {
    type: 'flex',
    altText: 'Leave Request Denied',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: 'คำขอลางานของคุณไม่ได้รับอนุมัติจากหัวหน้า',
            weight: 'bold',
            size: 'lg',
            color: '#ffffff',
          },
        ],
        backgroundColor: '#f44336',
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

import connectDB from '@/utils/db';
import LeaveRequest from '@/models/LeaveRequest';
import OvertimeRequest from '@/models/OvertimeRequest';
const approveRequest = async (req, res) => {
  await connectDB();
  const { requestId, type, action } = req.body;
  if (!requestId || !type || !action) {
    return res.status(400).json({ message: 'All fields are required' });
  }
  try {
    let request;
    if (type === 'leave') {
      request = await LeaveRequest.findById(requestId);
    } else if (type === 'overtime') {
      request = await OvertimeRequest.findById(requestId);
    }
    if (!request) {
      return res.status(400).json({ message: 'Request not found' });
    }
    request.status = action === 'approve' ? 'approved' : 'denied';
    await request.save();
    res.status(200).json({ message: `Request ${action}d successfully` });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error', error });
  }
};
export default approveRequest;

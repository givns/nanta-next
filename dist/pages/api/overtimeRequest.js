import connectDB from '@/utils/db';
import OvertimeRequest from '@/models/OvertimeRequest';
import User from '@/models/User';
const overtimeRequest = async (req, res) => {
  await connectDB();
  const { userId, date, hours, reason } = req.body;
  if (!userId || !date || !hours || !reason) {
    return res.status(400).json({ message: 'All fields are required' });
  }
  try {
    const user = await User.findOne({ lineUserId: userId });
    if (!user) {
      return res.status(400).json({ message: 'User not found' });
    }
    const newOvertimeRequest = new OvertimeRequest({
      userId: user._id,
      date,
      hours,
      reason,
      status: 'pending',
    });
    await newOvertimeRequest.save();
    res
      .status(200)
      .json({ message: 'Overtime request submitted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error', error });
  }
};
export default overtimeRequest;

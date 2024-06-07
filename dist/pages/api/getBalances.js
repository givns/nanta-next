import connectDB from '@/utils/db';
import User from '@/models/User';
const getBalancesHandler = async (req, res) => {
    await connectDB();
    const { userId } = req.query;
    try {
        const user = await User.findOne({ lineUserId: userId });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.status(200).json({
            leaveBalance: user.leaveBalance,
            overtimeBalance: user.overtimeBalance,
        });
    }
    catch (error) {
        res.status(500).json({ message: 'Internal server error', error });
    }
};
export default getBalancesHandler;

import connectDB from '@/utils/db';
import CheckIn from '@/models/CheckIn';
import User from '@/models/User';
const checkInHandler = async (req, res) => {
    await connectDB();
    if (req.method === 'POST') {
        const { userId, location } = req.body;
        try {
            const user = await User.findOne({ lineUserId: userId });
            if (!user) {
                return res.status(404).json({ message: 'User not found' });
            }
            const checkIn = new CheckIn({
                userId: user._id,
                timestamp: new Date(),
                location,
            });
            await checkIn.save();
            res.status(201).json({ message: 'Check-in successful' });
        }
        catch (error) {
            res.status(500).json({ message: 'Internal server error', error });
        }
    }
    else {
        res.status(405).json({ message: 'Method not allowed' });
    }
};
export default checkInHandler;

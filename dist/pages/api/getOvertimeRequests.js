import connectDB from '@/utils/db';
import OvertimeRequest from '@/models/OvertimeRequest';
const getOvertimeRequests = async (req, res) => {
    await connectDB();
    try {
        const requests = await OvertimeRequest.find({ status: 'pending' });
        res.status(200).json({ requests });
    }
    catch (error) {
        res.status(500).json({ message: 'Internal server error', error });
    }
};
export default getOvertimeRequests;

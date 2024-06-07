import connectDB from '@/utils/db';
import Holiday from '@/models/Holiday';
const getHolidaysHandler = async (req, res) => {
    await connectDB();
    try {
        const holidays = await Holiday.find({});
        res.status(200).json({ holidays });
    }
    catch (error) {
        res.status(500).json({ message: 'Internal server error', error });
    }
};
export default getHolidaysHandler;

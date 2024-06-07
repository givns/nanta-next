import mongoose, { Schema } from 'mongoose';
const HolidaySchema = new Schema({
    date: { type: Date, required: true },
    name: { type: String, required: true },
});
export default mongoose.models.Holiday || mongoose.model('Holiday', HolidaySchema);

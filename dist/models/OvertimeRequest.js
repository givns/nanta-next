import mongoose, { Schema } from 'mongoose';
const OvertimeRequestSchema = new Schema({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: Date, required: true },
    hours: { type: Number, required: true },
    reason: { type: String, required: true },
    status: { type: String, required: true, default: 'pending' },
});
export default mongoose.models.OvertimeRequest || mongoose.model('OvertimeRequest', OvertimeRequestSchema);

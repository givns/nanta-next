import mongoose, { Schema } from 'mongoose';
const LeaveRequestSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  reason: { type: String, required: true },
  status: {
    type: String,
    enum: ['pending', 'approved', 'denied'],
    default: 'pending',
  },
});
export default mongoose.models.LeaveRequest ||
  mongoose.model('LeaveRequest', LeaveRequestSchema);

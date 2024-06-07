import mongoose, { Schema, Document } from 'mongoose';

export interface ILeaveRequest extends Document {
  userId: mongoose.Schema.Types.ObjectId;
  startDate: Date;
  endDate: Date;
  reason: string;
  status: string;
}

const LeaveRequestSchema: Schema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  reason: { type: String, required: true },
  status: { type: String, enum: ['pending', 'approved', 'denied'], default: 'pending' },
});

export default mongoose.models.LeaveRequest || mongoose.model<ILeaveRequest>('LeaveRequest', LeaveRequestSchema);
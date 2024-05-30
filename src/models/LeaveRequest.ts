import mongoose, { Document, Model, Schema } from 'mongoose';

export interface ILeaveRequest extends Document {
  userId: string;
  startDate: Date;
  endDate: Date;
  reason: string;
  status: 'pending' | 'approved' | 'denied';
}

const LeaveRequestSchema: Schema = new Schema({
  userId: { type: String, required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  reason: { type: String, required: true },
  status: { type: String, enum: ['pending', 'approved', 'denied'], default: 'pending' },
});

const LeaveRequest: Model<ILeaveRequest> = mongoose.models.LeaveRequest || mongoose.model<ILeaveRequest>('LeaveRequest', LeaveRequestSchema);

export default LeaveRequest;
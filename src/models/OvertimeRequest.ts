import mongoose, { Document, Model, Schema } from 'mongoose';

export interface IOvertimeRequest extends Document {
  userId: string;
  date: Date;
  hours: number;
  reason: string;
  status: 'pending' | 'approved' | 'denied';
}

const OvertimeRequestSchema: Schema = new Schema({
  userId: { type: String, required: true },
  date: { type: Date, required: true },
  hours: { type: Number, required: true },
  reason: { type: String, required: true },
  status: { type: String, enum: ['pending', 'approved', 'denied'], default: 'pending' },
});

const OvertimeRequest: Model<IOvertimeRequest> = mongoose.models.OvertimeRequest || mongoose.model<IOvertimeRequest>('OvertimeRequest', OvertimeRequestSchema);

export default OvertimeRequest;
import mongoose, { Schema, Document } from 'mongoose';

export interface IOvertimeRequest extends Document {
  userId: mongoose.Schema.Types.ObjectId;
  date: Date;
  hours: number;
  reason: string;
  status: string;
}

const OvertimeRequestSchema: Schema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: Date, required: true },
  hours: { type: Number, required: true },
  reason: { type: String, required: true },
  status: { type: String, required: true, default: 'pending' },
});

export default mongoose.models.OvertimeRequest || mongoose.model<IOvertimeRequest>('OvertimeRequest', OvertimeRequestSchema);
import mongoose, { Schema, Document } from 'mongoose';

export interface ICheckIn extends Document {
  userId: mongoose.Schema.Types.ObjectId;
  timestamp: Date;
  location: string;
}

const CheckInSchema: Schema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  timestamp: { type: Date, required: true },
  location: { type: String, required: true },
});

export default mongoose.models.CheckIn || mongoose.model<ICheckIn>('CheckIn', CheckInSchema);
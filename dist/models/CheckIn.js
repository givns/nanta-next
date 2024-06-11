import mongoose, { Schema } from 'mongoose';
const CheckInSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  timestamp: { type: Date, required: true },
  location: { type: String, required: true },
});
export default mongoose.models.CheckIn ||
  mongoose.model('CheckIn', CheckInSchema);

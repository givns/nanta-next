import mongoose, { Schema, Document } from 'mongoose';

export interface IHoliday extends Document {
  date: Date;
  name: string;
}

const HolidaySchema: Schema = new Schema({
  date: { type: Date, required: true },
  name: { type: String, required: true },
});

export default mongoose.models.Holiday || mongoose.model<IHoliday>('Holiday', HolidaySchema);
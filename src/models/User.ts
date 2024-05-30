import mongoose, { Document, Schema, Model } from 'mongoose';

export interface IUser extends Document {
  lineUserId: string;
  name: string;
  nickname?: string;
  department: string;
  employeeNumber: string;
  role: 'general' | 'admin' | 'super-admin' | 'special';
}

const UserSchema: Schema = new Schema({
  lineUserId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  nickname: { type: String },
  department: { type: String, required: true },
  employeeNumber: { type: String, required: true },
  role: { type: String, required: true, enum: ['general', 'admin', 'super-admin', 'special'], default: 'general' }
});

const User: Model<IUser> = mongoose.models.User || mongoose.model<IUser>('User', UserSchema);

export default User;
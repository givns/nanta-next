import mongoose, { Schema } from 'mongoose';
const UserSchema = new Schema({
    lineUserId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    nickname: { type: String, required: true },
    department: { type: String, required: true },
    employeeNumber: { type: String, required: true },
    role: { type: String, enum: ['general', 'special', 'admin', 'super-admin'], default: 'general' },
});
export default mongoose.models.User || mongoose.model('User', UserSchema);

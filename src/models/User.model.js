import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';

const addressSchema = new mongoose.Schema(
  {
    label: { type: String, trim: true, default: 'Home' },
    line1: { type: String, required: true, trim: true },
    line2: { type: String, trim: true },
    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    pincode: { type: String, required: true, match: [/^\d{6}$/, 'Pincode must be 6 digits'] },
    phone: { type: String, required: true, match: [/^[6-9]\d{9}$/, 'Invalid Indian mobile number'] },
    isDefault: { type: Boolean, default: false },
  },
  { _id: true }
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: {
      type: String, required: true, unique: true, lowercase: true, trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Invalid email address'],
    },
    // Optional: registration no longer requires a phone number (email verification is now
    // the sole identity check). `sparse` lets the unique index ignore the many documents
    // that omit it entirely, rather than treating them all as colliding on `null`.
    phone: { type: String, unique: true, sparse: true, match: [/^[6-9]\d{9}$/, 'Invalid Indian mobile number'] },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['customer', 'admin'], default: 'customer', index: true },
    addresses: [addressSchema],
    wishlist: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
    compareList: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
    isEmailVerified: { type: Boolean, default: false },
    isPhoneVerified: { type: Boolean, default: false },
    emailVerificationToken: { type: String, select: false },
    emailVerificationExpiry: { type: Date, select: false },
    otp: { type: String, select: false },
    otpExpiry: { type: Date, select: false },
    otpAttempts: { type: Number, default: 0, select: false },
    passwordResetToken: { type: String, select: false },
    passwordResetExpiry: { type: Date, select: false },
    refreshToken: { type: String, select: false },
    tokenVersion: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

userSchema.methods.setPassword = async function (plain) {
  this.passwordHash = await bcrypt.hash(plain, env.bcryptRounds);
};

userSchema.methods.comparePassword = function (plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

/** Only one default address may exist per user. */
userSchema.methods.normalizeDefaultAddress = function (keepId) {
  const target = keepId ? this.addresses.id(keepId) : this.addresses.find((a) => a.isDefault);
  if (!target) {
    if (this.addresses.length) this.addresses[0].isDefault = true;
    return;
  }
  this.addresses.forEach((a) => { a.isDefault = String(a._id) === String(target._id); });
};

userSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret) => {
    delete ret.passwordHash; delete ret.otp; delete ret.otpExpiry; delete ret.refreshToken;
    delete ret.passwordResetToken; delete ret.passwordResetExpiry;
    delete ret.emailVerificationToken; delete ret.emailVerificationExpiry; delete ret.__v;
    return ret;
  },
});

export default mongoose.model('User', userSchema);

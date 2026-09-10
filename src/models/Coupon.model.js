import mongoose from 'mongoose';

const couponSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
    description: { type: String, trim: true },
    discountType: { type: String, enum: ['flat', 'percent'], required: true },
    discountValue: { type: Number, required: true, min: 0 },
    minOrderValue: { type: Number, default: 0, min: 0 },
    maxDiscountCap: { type: Number, default: null, min: 0 },
    usageLimit: { type: Number, default: null, min: 1 },
    perUserLimit: { type: Number, default: 1, min: 1 },
    usedCount: { type: Number, default: 0, min: 0 },
    usedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    validFrom: { type: Date, default: Date.now },
    validUntil: { type: Date, required: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

couponSchema.methods.computeDiscount = function (subtotal) {
  const raw = this.discountType === 'flat' ? this.discountValue : (subtotal * this.discountValue) / 100;
  const capped = this.maxDiscountCap ? Math.min(raw, this.maxDiscountCap) : raw;
  return Math.round(Math.min(capped, subtotal) * 100) / 100;
};

export default mongoose.model('Coupon', couponSchema);

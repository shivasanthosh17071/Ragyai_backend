import mongoose from 'mongoose';

const reelSchema = new mongoose.Schema(
  {
    video: {
      url: { type: String, required: true },
      publicId: { type: String, required: true },
    },
    caption: { type: String, trim: true, maxlength: 200 },
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
    displayOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

reelSchema.index({ isActive: 1, displayOrder: 1, createdAt: -1 });

export default mongoose.model('Reel', reelSchema);

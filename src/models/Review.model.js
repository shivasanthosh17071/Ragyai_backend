import mongoose from 'mongoose';
import Product from './Product.model.js';

const reviewSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, trim: true, maxlength: 2000 },
    images: [{ url: String, publicId: String }],
    isVerifiedPurchase: { type: Boolean, default: false },
    isApproved: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

reviewSchema.index({ product: 1, user: 1 }, { unique: true });

/** Ratings are recomputed from approved reviews only. */
reviewSchema.statics.recalculateRatings = async function (productId) {
  const [stats] = await this.aggregate([
    { $match: { product: new mongoose.Types.ObjectId(String(productId)), isApproved: true } },
    { $group: { _id: '$product', avg: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);
  await Product.findByIdAndUpdate(productId, {
    ratingsAverage: stats ? Math.round(stats.avg * 10) / 10 : 0,
    ratingsCount: stats ? stats.count : 0,
  });
};

reviewSchema.post('save', function () { this.constructor.recalculateRatings(this.product); });
reviewSchema.post('findOneAndUpdate', function (doc) { if (doc) doc.constructor.recalculateRatings(doc.product); });
reviewSchema.post('findOneAndDelete', function (doc) { if (doc) doc.constructor.recalculateRatings(doc.product); });

export default mongoose.model('Review', reviewSchema);

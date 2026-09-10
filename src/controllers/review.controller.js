import mongoose from 'mongoose';
import { Review, Order } from '../models/index.js';
import ApiError from '../utils/apiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess, paginationMeta } from '../utils/apiResponse.js';
import { q } from '../middleware/validate.js';

export const listProductReviews = asyncHandler(async (req, res) => {
  const { page, limit } = q(req);
  const filter = { product: req.params.productId, isApproved: true };

  const [reviews, total, breakdown] = await Promise.all([
    Review.find(filter).populate('user', 'name').sort({ createdAt: -1 })
      .skip((page - 1) * limit).limit(limit).lean(),
    Review.countDocuments(filter),
    Review.aggregate([
      { $match: { product: new mongoose.Types.ObjectId(String(req.params.productId)), isApproved: true } },
      { $group: { _id: '$rating', count: { $sum: 1 } } },
    ]),
  ]);

  const ratingBreakdown = [5, 4, 3, 2, 1].reduce((acc, r) => {
    acc[r] = breakdown.find((b) => b._id === r)?.count || 0;
    return acc;
  }, {});

  return sendSuccess(res, {
    data: { reviews, ratingBreakdown },
    meta: paginationMeta({ page, limit, total }),
  });
});

export const createReview = asyncHandler(async (req, res) => {
  const { product, rating, comment, images } = req.body;

  const existing = await Review.findOne({ product, user: req.user._id });
  if (existing) throw ApiError.conflict('You have already reviewed this product');

  // A delivered order for this product auto-approves the review.
  const purchased = await Order.exists({
    user: req.user._id,
    'items.product': product,
    orderStatus: 'delivered',
  });

  const review = await Review.create({
    product, user: req.user._id, rating, comment, images,
    isVerifiedPurchase: Boolean(purchased),
    isApproved: Boolean(purchased),
  });

  return sendSuccess(res, {
    status: 201,
    message: purchased ? 'Review published' : 'Review submitted for moderation',
    data: { review },
  });
});

export const updateReview = asyncHandler(async (req, res) => {
  const review = await Review.findById(req.params.id);
  if (!review) throw ApiError.notFound('Review not found');
  if (String(review.user) !== String(req.user._id)) throw ApiError.forbidden('You can only edit your own review');

  review.set(req.body);
  review.isApproved = review.isVerifiedPurchase;   // edited text goes back through moderation
  await review.save();

  return sendSuccess(res, { message: 'Review updated', data: { review } });
});

export const deleteReview = asyncHandler(async (req, res) => {
  const review = await Review.findById(req.params.id);
  if (!review) throw ApiError.notFound('Review not found');
  if (String(review.user) !== String(req.user._id) && req.user.role !== 'admin') {
    throw ApiError.forbidden('You can only delete your own review');
  }
  await Review.findOneAndDelete({ _id: review._id });
  return sendSuccess(res, { message: 'Review deleted' });
});

export const moderateReview = asyncHandler(async (req, res) => {
  const review = await Review.findOneAndUpdate(
    { _id: req.params.id },
    { isApproved: req.body.isApproved !== false },
    { new: true }
  );
  if (!review) throw ApiError.notFound('Review not found');
  return sendSuccess(res, { message: review.isApproved ? 'Review approved' : 'Review rejected', data: { review } });
});

export const listPendingReviews = asyncHandler(async (req, res) => {
  const { page, limit } = q(req);
  const [reviews, total] = await Promise.all([
    Review.find({ isApproved: false }).populate('user', 'name email').populate('product', 'name slug images')
      .sort({ createdAt: 1 }).skip((page - 1) * limit).limit(limit).lean(),
    Review.countDocuments({ isApproved: false }),
  ]);
  return sendSuccess(res, { data: { reviews }, meta: paginationMeta({ page, limit, total }) });
});

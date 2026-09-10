import { Coupon, Cart } from '../models/index.js';
import ApiError from '../utils/apiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess, paginationMeta } from '../utils/apiResponse.js';
import { q } from '../middleware/validate.js';
import { buildOrderLines, validateCoupon } from '../services/order.service.js';

/**
 * Preview endpoint for the cart screen. The subtotal is recomputed from the DB —
 * a client-sent cart total is never trusted, here or at order creation.
 */
export const applyCoupon = asyncHandler(async (req, res) => {
  const { code, items, fromCart } = req.body;

  let sourceItems = items;
  if (fromCart) {
    if (!req.user) throw ApiError.unauthorized('Log in to use your saved cart');
    const cart = await Cart.findOne({ user: req.user._id });
    if (!cart?.items.length) throw ApiError.badRequest('Your cart is empty');
    sourceItems = cart.items.map((i) => ({ product: i.product, sku: i.variant.sku, qty: i.qty }));
  }
  if (!sourceItems?.length) throw ApiError.badRequest('No items to apply the coupon to');

  const lines = await buildOrderLines(sourceItems);
  const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);
  const { coupon, discount } = await validateCoupon({ code, subtotal, userId: req.user?._id });

  return sendSuccess(res, {
    message: 'Coupon applied',
    data: {
      code: coupon.code,
      description: coupon.description,
      discountType: coupon.discountType,
      subtotal,
      discount,
      payable: Math.round((subtotal - discount) * 100) / 100,
    },
  });
});

export const listCoupons = asyncHandler(async (req, res) => {
  const { page, limit } = q(req);
  const [coupons, total] = await Promise.all([
    Coupon.find().sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Coupon.countDocuments(),
  ]);
  const withStats = coupons.map((c) => ({
    ...c,
    remainingUses: c.usageLimit === null ? null : Math.max(0, c.usageLimit - c.usedCount),
    isExpired: new Date(c.validUntil) < new Date(),
  }));
  return sendSuccess(res, { data: { coupons: withStats }, meta: paginationMeta({ page, limit, total }) });
});

export const createCoupon = asyncHandler(async (req, res) => {
  const coupon = await Coupon.create(req.body);
  return sendSuccess(res, { status: 201, message: 'Coupon created', data: { coupon } });
});

export const updateCoupon = asyncHandler(async (req, res) => {
  const coupon = await Coupon.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!coupon) throw ApiError.notFound('Coupon not found');
  return sendSuccess(res, { message: 'Coupon updated', data: { coupon } });
});

export const deleteCoupon = asyncHandler(async (req, res) => {
  const coupon = await Coupon.findByIdAndDelete(req.params.id);
  if (!coupon) throw ApiError.notFound('Coupon not found');
  return sendSuccess(res, { message: 'Coupon deleted' });
});

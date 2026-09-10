import { z } from 'zod';
import { objectId, paginationQuery, pincode, addressSchema } from './common.js';

/* ---------- cart ---------- */
export const addCartItemSchema = {
  body: z.object({
    product: objectId,
    sku: z.string().min(2),
    qty: z.number().int().min(1).max(20).default(1),
  }),
};
export const updateCartItemSchema = {
  params: z.object({ itemId: objectId }),
  body: z.object({ qty: z.number().int().min(1).max(20) }),
};

/* ---------- category ---------- */
export const categorySchema = {
  body: z.object({
    name: z.string().min(2).max(60),
    image: z.object({ url: z.string().url(), publicId: z.string() }).optional(),
    parentCategory: objectId.nullable().optional(),
    displayOrder: z.number().int().optional(),
    isActive: z.boolean().optional(),
  }),
};

/* ---------- coupon ---------- */
// Kept as a plain object so the update route can call .partial() on it —
// a refined schema (ZodEffects) has no .partial().
export const couponBody = z.object({
  code: z.string().min(3).max(30).transform((s) => s.toUpperCase()),
  description: z.string().max(200).optional(),
  discountType: z.enum(['flat', 'percent']),
  discountValue: z.number().positive(),
  minOrderValue: z.number().nonnegative().default(0),
  maxDiscountCap: z.number().positive().nullable().optional(),
  usageLimit: z.number().int().positive().nullable().optional(),
  perUserLimit: z.number().int().positive().default(1),
  validFrom: z.coerce.date().optional(),
  validUntil: z.coerce.date(),
  isActive: z.boolean().default(true),
});

const percentCap = (c) => c.discountType !== 'percent' || c.discountValue === undefined || c.discountValue <= 100;
const percentCapMsg = { message: 'Percent discount cannot exceed 100', path: ['discountValue'] };

export const couponSchema = { body: couponBody.refine(percentCap, percentCapMsg) };
export const updateCouponSchema = { body: couponBody.partial().refine(percentCap, percentCapMsg) };

export const applyCouponSchema = {
  body: z.object({
    code: z.string().min(3).max(30),
    items: z.array(z.object({ product: objectId, sku: z.string(), qty: z.number().int().min(1) })).optional(),
    fromCart: z.boolean().default(false),
  }),
};

/* ---------- review ---------- */
export const createReviewSchema = {
  body: z.object({
    product: objectId,
    rating: z.number().int().min(1).max(5),
    comment: z.string().max(2000).optional(),
    images: z.array(z.object({ url: z.string().url(), publicId: z.string() })).max(5).optional(),
  }),
};
export const updateReviewSchema = {
  params: z.object({ id: objectId }),
  body: z.object({
    rating: z.number().int().min(1).max(5).optional(),
    comment: z.string().max(2000).optional(),
  }),
};

/* ---------- shipping ---------- */
export const serviceabilitySchema = { body: z.object({ pincode }) };

/* ---------- payments ---------- */
export const createPaymentOrderSchema = { body: z.object({ orderId: objectId }) };
export const verifyPaymentSchema = {
  body: z.object({
    razorpay_order_id: z.string().min(5),
    razorpay_payment_id: z.string().min(5),
    razorpay_signature: z.string().min(10),
  }),
};
export const refundSchema = {
  params: z.object({ orderId: objectId }),
  body: z.object({ amount: z.number().positive().optional(), reason: z.string().max(300).optional() }),
};

/* ---------- users ---------- */
export const profileSchema = {
  body: z.object({
    name: z.string().min(2).max(80).optional(),
    email: z.string().email().optional(),
    phone: z.string().regex(/^[6-9]\d{9}$/).optional(),
  }),
};
export const addressBodySchema = { body: addressSchema };

/* ---------- admin ---------- */
export const salesChartSchema = {
  query: z.object({
    range: z.enum(['7d', '30d', '12m']).default('30d'),
    groupBy: z.enum(['day', 'week', 'month']).default('day'),
  }),
};
export const customersQuerySchema = { query: paginationQuery.extend({ search: z.string().max(60).optional() }) };
export { paginationQuery, objectId, pincode };

import { z } from 'zod';
import { objectId, phone, email, pincode, paginationQuery } from './common.js';
import { ORDER_STATUSES } from '../models/Order.model.js';

const shippingAddress = z.object({
  name: z.string().min(2).max(80),
  phone,
  line1: z.string().min(3).max(200),
  line2: z.string().max(200).optional(),
  city: z.string().min(2).max(60),
  state: z.string().min(2).max(60),
  pincode,
});

export const createOrderSchema = {
  body: z.object({
    // Client sends *what* to buy; the server decides what it costs.
    items: z.array(z.object({
      product: objectId,
      sku: z.string().min(2),
      qty: z.number().int().min(1).max(20),
    })).min(1).optional(),
    fromCart: z.boolean().default(false),
    shippingAddress,
    addressId: objectId.optional(),
    couponCode: z.string().max(30).optional(),
    paymentMethod: z.enum(['razorpay', 'cod']),
    notes: z.string().max(500).optional(),
  }).refine((b) => b.fromCart || (b.items && b.items.length), {
    message: 'Provide items or set fromCart', path: ['items'],
  }),
};

export const listOrdersSchema = {
  query: paginationQuery.extend({
    status: z.enum(ORDER_STATUSES).optional(),
    paymentStatus: z.enum(['pending', 'paid', 'failed', 'refunded']).optional(),
    paymentMethod: z.enum(['razorpay', 'cod']).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    search: z.string().max(60).optional(),
  }),
};

export const trackOrderSchema = {
  query: z.object({
    orderNumber: z.string().min(5),
    phone: phone.optional(),
    email: email.optional(),
  }).refine((v) => v.phone || v.email, { message: 'Provide the phone or email used at checkout' }),
};

export const updateStatusSchema = {
  params: z.object({ id: objectId }),
  body: z.object({ status: z.enum(ORDER_STATUSES), note: z.string().max(300).optional() }),
};

export const courierSchema = {
  params: z.object({ id: objectId }),
  body: z.object({
    name: z.string().min(2).max(60),
    awbNumber: z.string().min(3).max(60),
    trackingUrl: z.string().url().optional(),
    estimatedDelivery: z.coerce.date().optional(),
  }),
};

export const cancelOrderSchema = {
  params: z.object({ id: objectId }),
  body: z.object({ reason: z.string().min(3).max(300) }),
};

import crypto from 'crypto';
import { Order, Cart } from '../models/index.js';
import ApiError from '../utils/apiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { getRazorpay } from '../config/razorpay.js';
import { env } from '../config/env.js';
import { settlePaidOrder, restockItems } from '../services/order.service.js';

/** Constant-time compare so signature checks cannot be timed. */
const safeEqual = (a, b) => {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
};

export const createRazorpayOrder = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.body.orderId);
  if (!order) throw ApiError.notFound('Order not found');
  if (req.user && order.user && String(order.user) !== String(req.user._id)) {
    throw ApiError.forbidden('You cannot pay for this order');
  }
  if (order.paymentStatus === 'paid') throw ApiError.badRequest('This order is already paid');
  if (order.paymentMethod !== 'razorpay') throw ApiError.badRequest('This order is not a prepaid order');

  const rzp = getRazorpay();
  const rzpOrder = await rzp.orders.create({
    amount: Math.round(order.totalAmount * 100),   // paise
    currency: 'INR',
    receipt: order.orderNumber,
    notes: { orderId: String(order._id), orderNumber: order.orderNumber },
  });

  order.paymentDetails = { ...order.paymentDetails, razorpayOrderId: rzpOrder.id };
  await order.save();

  return sendSuccess(res, {
    status: 201,
    message: 'Razorpay order created',
    data: {
      razorpayOrderId: rzpOrder.id,
      amount: rzpOrder.amount,
      currency: rzpOrder.currency,
      keyId: env.razorpay.keyId,        // publishable key only
      orderNumber: order.orderNumber,
      prefill: {
        name: order.shippingAddress.name,
        contact: order.shippingAddress.phone,
        email: order.guestInfo?.email,
      },
    },
  });
});

/**
 * Called by the storefront after Razorpay's checkout handler fires. The client
 * callback is treated as a hint only — nothing is marked paid until the HMAC
 * over `order_id|payment_id` verifies against our key secret.
 */
export const verifyRazorpayPayment = asyncHandler(async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  const expected = crypto
    .createHmac('sha256', env.razorpay.keySecret)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');

  if (!safeEqual(expected, razorpay_signature)) {
    await Order.updateOne(
      { 'paymentDetails.razorpayOrderId': razorpay_order_id, paymentStatus: 'pending' },
      { paymentStatus: 'failed' }
    );
    throw ApiError.badRequest('Payment signature verification failed');
  }

  const order = await Order.findOne({ 'paymentDetails.razorpayOrderId': razorpay_order_id })
    .populate('user', 'name email phone');
  if (!order) throw ApiError.notFound('No order matches this payment');

  await settlePaidOrder(order, {
    razorpayOrderId: razorpay_order_id,
    razorpayPaymentId: razorpay_payment_id,
    razorpaySignature: razorpay_signature,
  });

  if (order.user) await Cart.updateOne({ user: order.user._id }, { $set: { items: [] } });

  return sendSuccess(res, { message: 'Payment verified', data: { order } });
});

/**
 * Razorpay retries webhooks until it gets a 2xx, and /verify may already have
 * settled the same order — every branch here is idempotent, and the route is
 * mounted with a raw body parser so the signature is computed over the exact bytes.
 */
export const razorpayWebhook = asyncHandler(async (req, res) => {
  const signature = req.headers['x-razorpay-signature'];
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body));

  const expected = crypto.createHmac('sha256', env.razorpay.webhookSecret).update(raw).digest('hex');
  if (!signature || !safeEqual(expected, signature)) throw ApiError.badRequest('Invalid webhook signature');

  const payload = JSON.parse(raw.toString());
  const event = payload.event;
  const entity = payload.payload?.payment?.entity || payload.payload?.refund?.entity || {};
  const rzpOrderId = entity.order_id;

  const order = rzpOrderId
    ? await Order.findOne({ 'paymentDetails.razorpayOrderId': rzpOrderId }).populate('user', 'name email phone')
    : null;

  // Always 200 on an unknown order — retrying will not make it appear.
  if (!order) {
    console.warn(`[razorpay:webhook] ${event} for unknown order ${rzpOrderId}`);
    return res.status(200).json({ received: true });
  }

  switch (event) {
    case 'payment.captured':
      if (order.paymentStatus !== 'paid') {
        await settlePaidOrder(order, { razorpayPaymentId: entity.id, razorpayOrderId: rzpOrderId });
        if (order.user) await Cart.updateOne({ user: order.user._id }, { $set: { items: [] } });
      }
      break;

    case 'payment.failed':
      if (order.paymentStatus === 'pending') {
        order.paymentStatus = 'failed';
        order.statusHistory.push({ status: order.orderStatus, timestamp: new Date(), note: `Payment failed: ${entity.error_description || 'unknown'}` });
        await order.save();
      }
      break;

    case 'refund.processed':
      if (order.paymentStatus !== 'refunded') {
        order.paymentStatus = 'refunded';
        order.paymentDetails.refundId = entity.id;
        order.paymentDetails.refundedAmount = (entity.amount || 0) / 100;
        if (order.stockDecremented) {
          await restockItems(order.items);
          order.stockDecremented = false;
        }
        await order.save();
      }
      break;

    default:
      console.log(`[razorpay:webhook] unhandled event ${event}`);
  }

  return res.status(200).json({ received: true });
});

export const refundOrder = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.orderId);
  if (!order) throw ApiError.notFound('Order not found');
  if (order.paymentStatus !== 'paid') throw ApiError.badRequest('Only a paid order can be refunded');
  if (order.paymentMethod !== 'razorpay') throw ApiError.badRequest('COD orders are refunded outside the gateway');

  const amount = req.body.amount ?? order.totalAmount;
  if (amount > order.totalAmount) throw ApiError.badRequest('Refund cannot exceed the order total');

  const rzp = getRazorpay();
  const refund = await rzp.payments.refund(order.paymentDetails.razorpayPaymentId, {
    amount: Math.round(amount * 100),
    notes: { reason: req.body.reason || 'Store-issued refund', orderNumber: order.orderNumber },
  });

  order.paymentStatus = 'refunded';
  order.paymentDetails.refundId = refund.id;
  order.paymentDetails.refundedAmount = amount;
  order.statusHistory.push({ status: order.orderStatus, timestamp: new Date(), note: `Refund initiated: Rs.${amount}` });
  if (order.stockDecremented) {
    await restockItems(order.items);
    order.stockDecremented = false;
  }
  await order.save();

  return sendSuccess(res, { message: 'Refund initiated', data: { order, refund: { id: refund.id, status: refund.status } } });
});

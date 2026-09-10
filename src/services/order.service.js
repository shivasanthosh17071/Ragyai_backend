import { Product, Coupon, Order, Settings } from '../models/index.js';
import ApiError from '../utils/apiError.js';
import { computeTotals } from '../utils/pricing.js';
import { env } from '../config/env.js';
import sendEmail from '../utils/sendEmail.js';
import sendSms from '../utils/sendSms.js';

/**
 * Rebuilds every line item from the database.
 * The client tells us WHAT it wants; prices and availability come from here only.
 */
export const buildOrderLines = async (requestedItems) => {
  const ids = [...new Set(requestedItems.map((i) => String(i.product)))];
  const products = await Product.find({ _id: { $in: ids }, isActive: true });
  const byId = new Map(products.map((p) => [String(p._id), p]));

  const lines = [];
  for (const item of requestedItems) {
    const product = byId.get(String(item.product));
    if (!product) throw ApiError.badRequest(`A product in your cart is no longer available`);

    const variant = product.variants.find((v) => v.sku === String(item.sku).toUpperCase());
    if (!variant || !variant.isActive) {
      throw ApiError.badRequest(`${product.name}: selected size/colour is unavailable`);
    }
    if (variant.stock < item.qty) {
      throw ApiError.conflict(
        `${product.name} (${variant.size}/${variant.color}): only ${variant.stock} left in stock`
      );
    }

    lines.push({
      product: product._id,
      productName: product.name,
      image: product.images?.[0]?.url,
      variant: { size: variant.size, color: variant.color, sku: variant.sku },
      qty: item.qty,
      price: variant.price,          // authoritative, from DB
    });
  }
  return lines;
};

/** Full server-side coupon check. Frontend-supplied discount values are ignored. */
export const validateCoupon = async ({ code, subtotal, userId }) => {
  const coupon = await Coupon.findOne({ code: String(code).toUpperCase() });
  if (!coupon || !coupon.isActive) throw ApiError.badRequest('Invalid coupon code');

  const now = new Date();
  if (coupon.validFrom > now) throw ApiError.badRequest('This coupon is not active yet');
  if (coupon.validUntil < now) throw ApiError.badRequest('This coupon has expired');
  if (subtotal < coupon.minOrderValue) {
    throw ApiError.badRequest(`Add items worth Rs.${(coupon.minOrderValue - subtotal).toFixed(0)} more to use this coupon`);
  }
  if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
    throw ApiError.badRequest('This coupon has reached its usage limit');
  }
  if (userId) {
    const usedByUser = coupon.usedBy.filter((u) => String(u) === String(userId)).length;
    if (usedByUser >= coupon.perUserLimit) throw ApiError.badRequest('You have already used this coupon');
  }

  return { coupon, discount: coupon.computeDiscount(subtotal) };
};

export const priceOrder = async ({ lines, couponCode, userId }) => {
  const settings = await Settings.get();
  const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);

  let discount = 0;
  let couponApplied;
  if (couponCode) {
    const result = await validateCoupon({ code: couponCode, subtotal, userId });
    discount = result.discount;
    couponApplied = { code: result.coupon.code, discountValue: result.discount };
  }

  return { totals: computeTotals({ items: lines, discount, settings }), couponApplied };
};

/**
 * Conditional per-variant decrement: the filter itself asserts sufficient stock,
 * so two concurrent orders cannot both take the last unit.
 */
export const decrementStock = async (order) => {
  const applied = [];
  for (const item of order.items) {
    const result = await Product.updateOne(
      { _id: item.product, variants: { $elemMatch: { sku: item.variant.sku, stock: { $gte: item.qty } } } },
      { $inc: { 'variants.$.stock': -item.qty } }
    );
    if (result.modifiedCount === 0) {
      // Roll back what we already took so we never leave stock half-consumed.
      await restockItems(applied);
      throw ApiError.conflict(`${item.productName} sold out while your payment was processing`);
    }
    applied.push(item);
  }
  return true;
};

export const restockItems = async (items) => {
  for (const item of items) {
    await Product.updateOne(
      { _id: item.product, 'variants.sku': item.variant.sku },
      { $inc: { 'variants.$.stock': item.qty } }
    );
  }
};

export const markCouponUsed = async (order) => {
  if (!order.couponApplied?.code) return;
  await Coupon.updateOne(
    { code: order.couponApplied.code },
    { $inc: { usedCount: 1 }, ...(order.user ? { $push: { usedBy: order.user } } : {}) }
  );
};

/**
 * The single settlement path for a paid order. Idempotent: safe to call from
 * /verify and from a retried webhook for the same payment.
 */
export const settlePaidOrder = async (order, paymentDetails = {}) => {
  if (order.paymentStatus === 'paid' && order.stockDecremented) return order;

  if (!order.stockDecremented) {
    await decrementStock(order);
    order.stockDecremented = true;
  }

  order.paymentStatus = 'paid';
  order.paymentDetails = { ...order.paymentDetails?.toObject?.(), ...paymentDetails, paidAt: new Date() };
  if (order.orderStatus === 'placed') order.pushStatus('confirmed', 'Payment received');
  order.codReleaseAt = null;
  await order.save();

  await markCouponUsed(order);
  notifyOrderPlaced(order).catch(() => {});
  checkLowStock(order).catch(() => {});
  return order;
};

/* ---------- notifications ---------- */
const customerContact = (order) => ({
  email: order.user?.email || order.guestInfo?.email,
  phone: order.user?.phone || order.guestInfo?.phone,
  name: order.shippingAddress?.name || order.user?.name || order.guestInfo?.name,
});

export const notifyOrderPlaced = async (order) => {
  const { email, phone, name } = customerContact(order);
  const line = `Order ${order.orderNumber} confirmed. Total Rs.${order.totalAmount}. Track it at ${env.apiBaseUrl}/track`;
  if (email) {
    await sendEmail({
      to: email,
      subject: `${env.brandName} — order ${order.orderNumber} confirmed`,
      html: `<p>Hi ${name}, thanks for your order.</p><p>${line}</p>`,
    });
  }
  if (phone) await sendSms({ to: phone, message: line });
};

export const notifyStatusChange = async (order) => {
  const { email, phone } = customerContact(order);
  const readable = order.orderStatus.replace(/_/g, ' ');
  const awb = order.courier?.awbNumber ? ` AWB: ${order.courier.awbNumber}.` : '';
  const line = `Order ${order.orderNumber} is now ${readable}.${awb}`;
  if (email) await sendEmail({ to: email, subject: `${env.brandName} — ${order.orderNumber} ${readable}`, html: `<p>${line}</p>` });
  if (phone) await sendSms({ to: phone, message: line });
};

export const checkLowStock = async (order) => {
  const settings = await Settings.get();
  const threshold = settings.lowStockThreshold ?? env.store.lowStockThreshold;
  const products = await Product.find({ _id: { $in: order.items.map((i) => i.product) } }).select('name variants');

  const low = [];
  products.forEach((p) => p.variants.forEach((v) => {
    if (v.isActive && v.stock <= threshold) low.push(`${p.name} (${v.size}/${v.color}) — ${v.stock} left`);
  }));

  if (low.length && env.mail.adminAlert) {
    await sendEmail({
      to: env.mail.adminAlert,
      subject: `${env.brandName} — low stock alert`,
      html: `<p>These variants are running low:</p><ul>${low.map((l) => `<li>${l}</li>`).join('')}</ul>`,
    });
  }
};

/**
 * COD orders hold stock from the moment they are placed. If the owner has not
 * confirmed them inside the configured window, the stock goes back on sale.
 */
export const releaseUnconfirmedCodOrders = async () => {
  const due = await Order.find({
    paymentMethod: 'cod',
    orderStatus: 'placed',
    stockDecremented: true,
    codReleaseAt: { $lte: new Date() },
  });

  for (const order of due) {
    await restockItems(order.items);
    order.stockDecremented = false;
    order.cancelReason = 'Not confirmed within the COD confirmation window';
    order.pushStatus('cancelled', 'Auto-cancelled: COD confirmation window elapsed');
    order.codReleaseAt = null;
    await order.save();
  }
  if (due.length) console.log(`[cod-sweep] released ${due.length} unconfirmed order(s)`);
  return due.length;
};

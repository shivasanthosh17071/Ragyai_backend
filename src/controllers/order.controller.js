import { Order, Cart, Settings, STATUS_FLOW } from '../models/index.js';
import ApiError from '../utils/apiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess, paginationMeta } from '../utils/apiResponse.js';
import { q } from '../middleware/validate.js';
import { streamInvoice } from '../utils/invoice.js';
import {
  buildOrderLines, priceOrder, decrementStock, restockItems,
  markCouponUsed, notifyOrderPlaced, notifyStatusChange,
} from '../services/order.service.js';

export const createOrder = asyncHandler(async (req, res) => {
  const { items, fromCart, shippingAddress, addressId, guestInfo, couponCode, paymentMethod } = req.body;
  const user = req.user || null;

  if (!user && !guestInfo) throw ApiError.badRequest('Guest checkout requires name, email and phone');

  let sourceItems = items;
  if (fromCart) {
    if (!user) throw ApiError.unauthorized('Log in to check out from a saved cart');
    const cart = await Cart.findOne({ user: user._id });
    if (!cart?.items.length) throw ApiError.badRequest('Your cart is empty');
    sourceItems = cart.items.map((i) => ({ product: i.product, sku: i.variant.sku, qty: i.qty }));
  }

  let address = shippingAddress;
  if (addressId && user) {
    const saved = user.addresses.id(addressId);
    if (!saved) throw ApiError.notFound('Address not found');
    address = {
      name: saved.label === 'Home' ? user.name : saved.label,
      phone: saved.phone, line1: saved.line1, line2: saved.line2,
      city: saved.city, state: saved.state, pincode: saved.pincode,
    };
  }

  const settings = await Settings.get();
  if (paymentMethod === 'cod' && !settings.codEnabled) {
    throw ApiError.badRequest('Cash on delivery is currently unavailable');
  }

  // Prices, stock and discount all recomputed server-side.
  const lines = await buildOrderLines(sourceItems);
  const { totals, couponApplied } = await priceOrder({ lines, couponCode, userId: user?._id });

  const order = new Order({
    user: user?._id || null,
    guestInfo: user ? undefined : guestInfo,
    items: lines,
    shippingAddress: address,
    ...totals,
    couponApplied,
    paymentMethod,
    paymentStatus: 'pending',
    orderStatus: 'placed',
  });

  // Prepaid: stock is held only once Razorpay confirms payment.
  // COD: reserve now, with an auto-release deadline if the owner never confirms.
  if (paymentMethod === 'cod') {
    await decrementStock(order);
    order.stockDecremented = true;
    order.codReleaseAt = new Date(Date.now() + (settings.codConfirmWindowHours || 24) * 3600 * 1000);
  }

  await order.save();

  if (paymentMethod === 'cod') {
    await markCouponUsed(order);
    if (fromCart) await Cart.updateOne({ user: user._id }, { $set: { items: [] } });
    notifyOrderPlaced(order).catch(() => {});
  }

  return sendSuccess(res, {
    status: 201,
    message: paymentMethod === 'cod' ? 'Order placed' : 'Order created — proceed to payment',
    data: { order, nextStep: paymentMethod === 'razorpay' ? 'POST /api/v1/payments/razorpay/create-order' : null },
  });
});

export const listOrders = asyncHandler(async (req, res) => {
  const { page, limit, status, paymentStatus, paymentMethod, from, to, search } = q(req);
  const isAdmin = req.user.role === 'admin';

  const filter = isAdmin ? {} : { user: req.user._id };
  if (status) filter.orderStatus = status;
  if (paymentStatus) filter.paymentStatus = paymentStatus;
  if (paymentMethod) filter.paymentMethod = paymentMethod;
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = from;
    if (to) filter.createdAt.$lte = to;
  }
  if (search && isAdmin) {
    filter.$or = [
      { orderNumber: new RegExp(search, 'i') },
      { 'shippingAddress.phone': new RegExp(search, 'i') },
      { 'guestInfo.email': new RegExp(search, 'i') },
    ];
  }

  const [orders, total] = await Promise.all([
    Order.find(filter)
      .populate('user', 'name email phone')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Order.countDocuments(filter),
  ]);

  return sendSuccess(res, { data: { orders }, meta: paginationMeta({ page, limit, total }) });
});

const loadOrderForRequester = async (req) => {
  const order = await Order.findById(req.params.id).populate('user', 'name email phone');
  if (!order) throw ApiError.notFound('Order not found');
  const isOwner = order.user && String(order.user._id) === String(req.user?._id);
  if (req.user?.role !== 'admin' && !isOwner) throw ApiError.forbidden('You cannot view this order');
  return order;
};

export const getOrder = asyncHandler(async (req, res) =>
  sendSuccess(res, { data: { order: await loadOrderForRequester(req) } }));

/** Public tracking: order number plus the phone or email used at checkout. */
export const trackOrder = asyncHandler(async (req, res) => {
  const { orderNumber, phone, email } = q(req);

  const order = await Order.findOne({ orderNumber: orderNumber.toUpperCase() }).populate('user', 'email phone');
  const matches = order && (
    (phone && (order.guestInfo?.phone === phone || order.user?.phone === phone || order.shippingAddress?.phone === phone)) ||
    (email && (order.guestInfo?.email === email || order.user?.email === email))
  );
  // Deliberately identical error for "no such order" and "details do not match".
  if (!matches) throw ApiError.notFound('No order found for those details');

  return sendSuccess(res, {
    data: {
      order: {
        orderNumber: order.orderNumber,
        orderStatus: order.orderStatus,
        statusHistory: order.statusHistory,
        courier: order.courier,
        items: order.items.map(({ productName, variant, qty, image }) => ({ productName, variant, qty, image })),
        totalAmount: order.totalAmount,
        paymentStatus: order.paymentStatus,
        placedAt: order.createdAt,
      },
    },
  });
});

export const cancelOrder = asyncHandler(async (req, res) => {
  const order = await loadOrderForRequester(req);

  if (!['placed', 'confirmed', 'packed'].includes(order.orderStatus)) {
    throw ApiError.badRequest(`An order that is already ${order.orderStatus.replace(/_/g, ' ')} cannot be cancelled`);
  }

  if (order.stockDecremented) {
    await restockItems(order.items);
    order.stockDecremented = false;
  }
  order.cancelReason = req.body.reason;
  order.codReleaseAt = null;
  order.pushStatus('cancelled', `Cancelled by ${req.user.role === 'admin' ? 'store' : 'customer'}`);
  await order.save();

  notifyStatusChange(order).catch(() => {});
  return sendSuccess(res, {
    message: order.paymentStatus === 'paid'
      ? 'Order cancelled. A refund can now be issued from the admin panel'
      : 'Order cancelled',
    data: { order },
  });
});

export const updateStatus = asyncHandler(async (req, res) => {
  const { status, note } = req.body;
  const order = await Order.findById(req.params.id).populate('user', 'name email phone');
  if (!order) throw ApiError.notFound('Order not found');

  const allowed = STATUS_FLOW[order.orderStatus] || [];
  if (!allowed.includes(status)) {
    throw ApiError.badRequest(
      `Cannot move from "${order.orderStatus}" to "${status}". Allowed: ${allowed.join(', ') || 'none'}`
    );
  }
  if (status === 'cancelled' && order.stockDecremented) {
    await restockItems(order.items);
    order.stockDecremented = false;
  }
  if (status === 'confirmed') order.codReleaseAt = null;

  // Cash changes hands on delivery — nothing else in the app ever settles a COD order,
  // so without this its revenue would never appear in paid-only dashboard aggregates.
  if (status === 'delivered' && order.paymentMethod === 'cod' && order.paymentStatus === 'pending') {
    order.paymentStatus = 'paid';
    order.paymentDetails = { ...order.paymentDetails, paidAt: new Date() };
  }

  order.pushStatus(status, note);
  await order.save();

  notifyStatusChange(order).catch(() => {});
  return sendSuccess(res, { message: `Order marked ${status}`, data: { order } });
});

export const updateCourier = asyncHandler(async (req, res) => {
  const order = await Order.findByIdAndUpdate(
    req.params.id,
    { courier: req.body },
    { new: true, runValidators: true }
  ).populate('user', 'name email phone');
  if (!order) throw ApiError.notFound('Order not found');

  notifyStatusChange(order).catch(() => {});
  return sendSuccess(res, { message: 'Courier details saved', data: { order } });
});

export const getInvoice = asyncHandler(async (req, res) => {
  const order = await loadOrderForRequester(req);
  if (order.paymentStatus === 'failed') throw ApiError.badRequest('No invoice for an unpaid order');
  return streamInvoice(order, res);
});

import mongoose from 'mongoose';
import { Order, Product, User, Settings } from '../models/index.js';
import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/apiError.js';
import { sendSuccess, paginationMeta } from '../utils/apiResponse.js';
import { q } from '../middleware/validate.js';
import { env } from '../config/env.js';

const startOf = (unit) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (unit === 'week') d.setDate(d.getDate() - d.getDay());
  if (unit === 'month') d.setDate(1);
  return d;
};

// Revenue counts paid, non-cancelled orders only.
const REVENUE_MATCH = { paymentStatus: { $in: ['paid'] }, orderStatus: { $nin: ['cancelled', 'returned'] } };

const revenueBetween = async (from) => {
  const [row] = await Order.aggregate([
    { $match: { ...REVENUE_MATCH, createdAt: { $gte: from } } },
    { $group: { _id: null, revenue: { $sum: '$totalAmount' }, orders: { $sum: 1 } } },
  ]);
  return { revenue: Math.round((row?.revenue || 0) * 100) / 100, orders: row?.orders || 0 };
};

export const dashboardSummary = asyncHandler(async (req, res) => {
  const settings = await Settings.get();
  const threshold = settings.lowStockThreshold ?? env.store.lowStockThreshold;

  const [today, week, month, allTime, pendingOrders, lowStock, customers] = await Promise.all([
    revenueBetween(startOf('day')),
    revenueBetween(startOf('week')),
    revenueBetween(startOf('month')),
    revenueBetween(new Date(0)),
    Order.countDocuments({ orderStatus: { $in: ['placed', 'confirmed', 'packed'] } }),
    Product.countDocuments({ isActive: true, variants: { $elemMatch: { isActive: true, stock: { $lte: threshold } } } }),
    User.countDocuments({ role: 'customer' }),
  ]);

  return sendSuccess(res, {
    data: {
      today, week, month,
      averageOrderValue: allTime.orders ? Math.round((allTime.revenue / allTime.orders) * 100) / 100 : 0,
      pendingOrders,
      lowStockProducts: lowStock,
      totalCustomers: customers,
      lifetimeRevenue: allTime.revenue,
    },
  });
});

export const salesChart = asyncHandler(async (req, res) => {
  const { range, groupBy } = q(req);

  const from = new Date();
  if (range === '7d') from.setDate(from.getDate() - 7);
  else if (range === '30d') from.setDate(from.getDate() - 30);
  else from.setMonth(from.getMonth() - 12);
  from.setHours(0, 0, 0, 0);

  const fmt = { day: '%Y-%m-%d', week: '%Y-W%V', month: '%Y-%m' }[groupBy];

  const points = await Order.aggregate([
    { $match: { ...REVENUE_MATCH, createdAt: { $gte: from } } },
    {
      $group: {
        _id: { $dateToString: { format: fmt, date: '$createdAt', timezone: 'Asia/Kolkata' } },
        revenue: { $sum: '$totalAmount' },
        orders: { $sum: 1 },
        units: { $sum: { $sum: '$items.qty' } },
      },
    },
    { $sort: { _id: 1 } },
    { $project: { _id: 0, period: '$_id', revenue: { $round: ['$revenue', 2] }, orders: 1, units: 1 } },
  ]);

  return sendSuccess(res, { data: { range, groupBy, points } });
});

export const topProducts = asyncHandler(async (req, res) => {
  const limit = Number(req.query.limit) || 10;
  const products = await Order.aggregate([
    { $match: REVENUE_MATCH },
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items.product',
        name: { $first: '$items.productName' },
        unitsSold: { $sum: '$items.qty' },
        revenue: { $sum: { $multiply: ['$items.price', '$items.qty'] } },
      },
    },
    { $sort: { unitsSold: -1 } },
    { $limit: limit },
    { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' } },
    {
      $project: {
        _id: 1, name: 1, unitsSold: 1, revenue: { $round: ['$revenue', 2] },
        slug: { $first: '$product.slug' }, image: { $first: { $first: '$product.images.url' } },
      },
    },
  ]);
  return sendSuccess(res, { data: { products } });
});

export const categorySplit = asyncHandler(async (_req, res) => {
  const split = await Order.aggregate([
    { $match: REVENUE_MATCH },
    { $unwind: '$items' },
    { $lookup: { from: 'products', localField: 'items.product', foreignField: '_id', as: 'p' } },
    { $unwind: '$p' },
    { $lookup: { from: 'categories', localField: 'p.category', foreignField: '_id', as: 'c' } },
    { $unwind: '$c' },
    {
      $group: {
        _id: '$c.name',
        revenue: { $sum: { $multiply: ['$items.price', '$items.qty'] } },
        units: { $sum: '$items.qty' },
      },
    },
    { $sort: { revenue: -1 } },
    { $project: { _id: 0, category: '$_id', revenue: { $round: ['$revenue', 2] }, units: 1 } },
  ]);
  return sendSuccess(res, { data: { split } });
});

export const recentOrders = asyncHandler(async (req, res) => {
  const limit = Number(req.query.limit) || 10;
  const orders = await Order.find()
    .sort({ createdAt: -1 }).limit(limit)
    .populate('user', 'name email')
    .select('orderNumber totalAmount orderStatus paymentStatus paymentMethod createdAt shippingAddress.name items')
    .lean();
  return sendSuccess(res, { data: { orders } });
});

export const listCustomers = asyncHandler(async (req, res) => {
  const { page, limit, search } = q(req);
  const match = { role: 'customer' };
  if (search) {
    match.$or = [
      { name: new RegExp(search, 'i') },
      { email: new RegExp(search, 'i') },
      { phone: new RegExp(search, 'i') },
    ];
  }

  const [customers, total] = await Promise.all([
    User.aggregate([
      { $match: match },
      { $sort: { createdAt: -1 } },
      { $skip: (page - 1) * limit },
      { $limit: limit },
      {
        $lookup: {
          from: 'orders',
          let: { uid: '$_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$user', '$$uid'] }, paymentStatus: 'paid' } },
            { $group: { _id: null, count: { $sum: 1 }, spend: { $sum: '$totalAmount' }, last: { $max: '$createdAt' } } },
          ],
          as: 'stats',
        },
      },
      {
        $project: {
          name: 1, email: 1, phone: 1, createdAt: 1,
          orderCount: { $ifNull: [{ $first: '$stats.count' }, 0] },
          totalSpend: { $round: [{ $ifNull: [{ $first: '$stats.spend' }, 0] }, 2] },
          lastOrderAt: { $first: '$stats.last' },
        },
      },
    ]),
    User.countDocuments(match),
  ]);

  return sendSuccess(res, { data: { customers }, meta: paginationMeta({ page, limit, total }) });
});

export const getCustomer = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user || user.role !== 'customer') throw ApiError.notFound('Customer not found');

  const [orders, [stats]] = await Promise.all([
    Order.find({ user: user._id }).sort({ createdAt: -1 }).limit(50)
      .select('orderNumber totalAmount orderStatus paymentStatus createdAt items').lean(),
    Order.aggregate([
      { $match: { user: new mongoose.Types.ObjectId(String(user._id)), paymentStatus: 'paid' } },
      { $group: { _id: null, orderCount: { $sum: 1 }, totalSpend: { $sum: '$totalAmount' } } },
    ]),
  ]);

  return sendSuccess(res, {
    data: {
      customer: user,
      orders,
      stats: {
        orderCount: stats?.orderCount || 0,
        totalSpend: Math.round((stats?.totalSpend || 0) * 100) / 100,
        averageOrderValue: stats?.orderCount ? Math.round((stats.totalSpend / stats.orderCount) * 100) / 100 : 0,
      },
    },
  });
});

/** Flat variant-level view — what the inventory screen actually needs. */
export const lowStock = asyncHandler(async (req, res) => {
  const settings = await Settings.get();
  const threshold = Number(req.query.threshold) || settings.lowStockThreshold || env.store.lowStockThreshold;

  const rows = await Product.aggregate([
    { $match: { isActive: true } },
    { $unwind: '$variants' },
    { $match: { 'variants.isActive': true, 'variants.stock': { $lte: threshold } } },
    { $sort: { 'variants.stock': 1 } },
    {
      $project: {
        _id: 0,
        productId: '$_id', name: 1, slug: 1,
        image: { $first: '$images.url' },
        variantId: '$variants._id', sku: '$variants.sku',
        size: '$variants.size', color: '$variants.color', stock: '$variants.stock',
      },
    },
  ]);

  return sendSuccess(res, { data: { threshold, variants: rows } });
});

export const getSettings = asyncHandler(async (_req, res) => {
  const settings = await Settings.get();
  return sendSuccess(res, {
    data: {
      settings,
      // Keys are shown masked so the owner can confirm which account is live.
      paymentKeys: {
        razorpayKeyId: env.razorpay.keyId ? `${env.razorpay.keyId.slice(0, 8)}****` : null,
        razorpaySecretSet: Boolean(env.razorpay.keySecret),
        webhookSecretSet: Boolean(env.razorpay.webhookSecret),
      },
    },
  });
});

export const updateSettings = asyncHandler(async (req, res) => {
  const settings = await Settings.get();
  settings.set(req.body);
  await settings.save();
  return sendSuccess(res, { message: 'Settings saved', data: { settings } });
});

import { Cart, Product } from '../models/index.js';
import ApiError from '../utils/apiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { computeTotals } from '../utils/pricing.js';
import { Settings } from '../models/index.js';

const getOrCreateCart = async (userId) =>
  (await Cart.findOne({ user: userId })) || Cart.create({ user: userId, items: [] });

/**
 * Cart reads re-price every line against the current catalogue, so a price change
 * or a sell-out surfaces before checkout instead of at payment time.
 */
const hydrateCart = async (cart) => {
  await cart.populate({ path: 'items.product', select: 'name slug images variants isActive basePrice' });
  const settings = await Settings.get();

  const items = [];
  let removed = 0;
  for (const item of cart.items) {
    const product = item.product;
    const variant = product?.variants?.find((v) => v.sku === item.variant.sku);
    if (!product?.isActive || !variant?.isActive) { removed += 1; continue; }

    items.push({
      _id: item._id,
      product: { _id: product._id, name: product.name, slug: product.slug, image: product.images?.[0]?.url },
      variant: { size: variant.size, color: variant.color, sku: variant.sku },
      qty: item.qty,
      price: variant.price,
      priceAtAdd: item.priceAtAdd,
      priceChanged: variant.price !== item.priceAtAdd,
      stock: variant.stock,
      inStock: variant.stock >= item.qty,
    });
  }

  const totals = computeTotals({ items, settings });
  return { items, totals, removedUnavailable: removed };
};

export const getCart = asyncHandler(async (req, res) => {
  const cart = await getOrCreateCart(req.user._id);
  return sendSuccess(res, { data: await hydrateCart(cart) });
});

export const addItem = asyncHandler(async (req, res) => {
  const { product: productId, sku, qty } = req.body;

  const product = await Product.findOne({ _id: productId, isActive: true });
  if (!product) throw ApiError.notFound('Product not found');

  const variant = product.variants.find((v) => v.sku === sku.toUpperCase() && v.isActive);
  if (!variant) throw ApiError.badRequest('That size/colour is unavailable');

  const cart = await getOrCreateCart(req.user._id);
  const existing = cart.items.find((i) => i.variant.sku === variant.sku && String(i.product) === String(product._id));
  const newQty = (existing?.qty || 0) + qty;
  if (variant.stock < newQty) throw ApiError.conflict(`Only ${variant.stock} left in stock`);

  if (existing) {
    existing.qty = newQty;
    existing.priceAtAdd = variant.price;
  } else {
    cart.items.push({
      product: product._id,
      variant: { size: variant.size, color: variant.color, sku: variant.sku },
      qty,
      priceAtAdd: variant.price,
    });
  }
  await cart.save();

  return sendSuccess(res, { status: 201, message: 'Added to cart', data: await hydrateCart(cart) });
});

export const updateItem = asyncHandler(async (req, res) => {
  const cart = await getOrCreateCart(req.user._id);
  const item = cart.items.id(req.params.itemId);
  if (!item) throw ApiError.notFound('Item not in cart');

  const product = await Product.findById(item.product);
  const variant = product?.variants.find((v) => v.sku === item.variant.sku);
  if (!variant) throw ApiError.badRequest('That variant is no longer available');
  if (variant.stock < req.body.qty) throw ApiError.conflict(`Only ${variant.stock} left in stock`);

  item.qty = req.body.qty;
  await cart.save();
  return sendSuccess(res, { message: 'Cart updated', data: await hydrateCart(cart) });
});

export const removeItem = asyncHandler(async (req, res) => {
  const cart = await getOrCreateCart(req.user._id);
  const item = cart.items.id(req.params.itemId);
  if (!item) throw ApiError.notFound('Item not in cart');
  item.deleteOne();
  await cart.save();
  return sendSuccess(res, { message: 'Item removed', data: await hydrateCart(cart) });
});

export const clearCart = asyncHandler(async (req, res) => {
  const cart = await getOrCreateCart(req.user._id);
  cart.items = [];
  await cart.save();
  return sendSuccess(res, { message: 'Cart cleared', data: { items: [], totals: computeTotals({ items: [] }) } });
});

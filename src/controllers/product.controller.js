import mongoose from 'mongoose';
import { Product, Category } from '../models/index.js';
import ApiError from '../utils/apiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess, paginationMeta } from '../utils/apiResponse.js';
import { q } from '../middleware/validate.js';
import { destroyAsset } from '../config/cloudinary.js';

const SORTS = {
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
  price_asc: { basePrice: 1 },
  price_desc: { basePrice: -1 },
  rating: { ratingsAverage: -1, ratingsCount: -1 },
  popular: { ratingsCount: -1, ratingsAverage: -1 },
  discount: { discountPercent: -1 },
};

/** Accepts either a category slug or an ObjectId, so pretty URLs work as filters. */
const resolveCategory = async (value) => {
  if (!value) return null;
  if (mongoose.isValidObjectId(value)) return value;
  const cat = await Category.findOne({ slug: value }).select('_id');
  return cat?._id || new mongoose.Types.ObjectId(); // no match -> deliberately empty result
};

export const listProducts = asyncHandler(async (req, res) => {
  const {
    page, limit, category, subCategory, size, color,
    minPrice, maxPrice, search, sort, isFeatured, isBestseller, isNewArrival, inStock, includeInactive,
  } = q(req);

  // Only an admin caller may see archived (soft-deleted) products — e.g. the admin
  // product list — everyone else always gets the active-only storefront view.
  const filter = req.user?.role === 'admin' && includeInactive ? {} : { isActive: true };
  if (category) filter.category = await resolveCategory(category);
  if (subCategory) filter.subCategory = await resolveCategory(subCategory);
  if (isFeatured !== undefined) filter.isFeatured = isFeatured;
  if (isBestseller !== undefined) filter.isBestseller = isBestseller;
  if (isNewArrival !== undefined) filter.isNewArrival = isNewArrival;
  if (search) filter.$text = { $search: search };

  if (minPrice !== undefined || maxPrice !== undefined) {
    filter.basePrice = {};
    if (minPrice !== undefined) filter.basePrice.$gte = minPrice;
    if (maxPrice !== undefined) filter.basePrice.$lte = maxPrice;
  }

  // size / color / stock must match within the SAME variant, hence $elemMatch.
  const variantMatch = { isActive: true };
  if (size) variantMatch.size = { $in: size.split(',').map((s) => s.trim()) };
  if (color) variantMatch.color = { $in: color.split(',').map((c) => c.trim()) };
  if (inStock) variantMatch.stock = { $gt: 0 };
  if (Object.keys(variantMatch).length > 1) filter.variants = { $elemMatch: variantMatch };

  const sortSpec = search && sort === 'newest' ? { score: { $meta: 'textScore' } } : SORTS[sort];
  const projection = search ? { score: { $meta: 'textScore' } } : {};

  const [products, total] = await Promise.all([
    Product.find(filter, projection)
      .populate('category', 'name slug')
      .populate('subCategory', 'name slug')
      .sort(sortSpec)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean({ virtuals: true }),
    Product.countDocuments(filter),
  ]);

  return sendSuccess(res, { data: { products }, meta: paginationMeta({ page, limit, total }) });
});

export const getProductBySlug = asyncHandler(async (req, res) => {
  const product = await Product.findOne({ slug: req.params.slug, isActive: true })
    .populate('category', 'name slug')
    .populate('subCategory', 'name slug');
  if (!product) throw ApiError.notFound('Product not found');
  return sendSuccess(res, { data: { product } });
});

export const getRelatedProducts = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id).select('category tags _id');
  if (!product) throw ApiError.notFound('Product not found');

  const related = await Product.find({
    _id: { $ne: product._id },
    isActive: true,
    $or: [{ category: product.category }, { tags: { $in: product.tags || [] } }],
  })
    .sort({ ratingsCount: -1, createdAt: -1 })
    .limit(8)
    .select('name slug images basePrice baseMrp ratingsAverage variants')
    .lean({ virtuals: true });

  return sendSuccess(res, { data: { products: related } });
});

export const createProduct = asyncHandler(async (req, res) => {
  const product = await Product.create(req.body);
  return sendSuccess(res, { status: 201, message: 'Product created', data: { product } });
});

export const updateProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) throw ApiError.notFound('Product not found');
  product.set(req.body);
  await product.save();
  return sendSuccess(res, { message: 'Product updated', data: { product } });
});

/** Soft delete only — hard deletes would orphan historical order line items. */
export const deleteProduct = asyncHandler(async (req, res) => {
  const product = await Product.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
  if (!product) throw ApiError.notFound('Product not found');
  return sendSuccess(res, { message: 'Product archived', data: { product } });
});

export const updateVariantStock = asyncHandler(async (req, res) => {
  const { stock, delta } = req.body;
  const product = await Product.findById(req.params.id);
  if (!product) throw ApiError.notFound('Product not found');

  const variant = product.variants.id(req.params.variantId);
  if (!variant) throw ApiError.notFound('Variant not found');

  variant.stock = stock !== undefined ? stock : Math.max(0, variant.stock + delta);
  await product.save();
  return sendSuccess(res, { message: 'Stock updated', data: { variant } });
});

export const attachImages = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) throw ApiError.notFound('Product not found');

  const uploaded = (req.files || []).map((f) => ({ url: f.path, publicId: f.filename }));
  if (!uploaded.length) throw ApiError.badRequest('No files uploaded');

  product.images.push(...uploaded);
  await product.save();
  return sendSuccess(res, { status: 201, message: 'Images attached', data: { images: product.images } });
});

export const removeImage = asyncHandler(async (req, res) => {
  const { id, publicId } = req.params;
  const product = await Product.findById(id);
  if (!product) throw ApiError.notFound('Product not found');
  if (product.images.length <= 2) throw ApiError.badRequest('A product must keep at least two images');

  product.images = product.images.filter((img) => img.publicId !== publicId);
  await product.save();
  await destroyAsset(publicId).catch((e) => console.error('[cloudinary]', e.message));

  return sendSuccess(res, { message: 'Image removed', data: { images: product.images } });
});

/** Drag-to-reorder in the admin gallery. */
export const reorderImages = asyncHandler(async (req, res) => {
  const { order } = req.body; // array of publicIds in the desired order
  const product = await Product.findById(req.params.id);
  if (!product) throw ApiError.notFound('Product not found');

  const byId = new Map(product.images.map((i) => [i.publicId, i]));
  const reordered = order.map((pid) => byId.get(pid)).filter(Boolean);
  if (reordered.length !== product.images.length) throw ApiError.badRequest('Order must include every image');

  product.images = reordered;
  await product.save();
  return sendSuccess(res, { message: 'Images reordered', data: { images: product.images } });
});

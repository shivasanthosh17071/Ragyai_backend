import { Category, Product } from '../models/index.js';
import ApiError from '../utils/apiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';

/** Returns the full parent -> children tree the storefront nav renders from. */
export const getCategoryTree = asyncHandler(async (req, res) => {
  // Admins managing the catalogue need to see deactivated categories too; the public
  // storefront nav never should, so this only relaxes the filter for an admin caller.
  const includeInactive = req.user?.role === 'admin' && req.query.includeInactive === 'true';
  const filter = includeInactive ? {} : { isActive: true };
  const categories = await Category.find(filter).sort({ displayOrder: 1, name: 1 }).lean();
  const byId = new Map(categories.map((c) => [String(c._id), { ...c, children: [] }]));
  const tree = [];

  categories.forEach((c) => {
    const node = byId.get(String(c._id));
    if (c.parentCategory && byId.has(String(c.parentCategory))) {
      byId.get(String(c.parentCategory)).children.push(node);
    } else {
      tree.push(node);
    }
  });

  return sendSuccess(res, { data: { categories: tree } });
});

export const createCategory = asyncHandler(async (req, res) => {
  const category = await Category.create(req.body);
  return sendSuccess(res, { status: 201, message: 'Category created', data: { category } });
});

export const updateCategory = asyncHandler(async (req, res) => {
  if (req.body.parentCategory && req.body.parentCategory === req.params.id) {
    throw ApiError.badRequest('A category cannot be its own parent');
  }
  const category = await Category.findById(req.params.id);
  if (!category) throw ApiError.notFound('Category not found');
  category.set(req.body);
  await category.save();
  return sendSuccess(res, { message: 'Category updated', data: { category } });
});

export const deleteCategory = asyncHandler(async (req, res) => {
  const [productCount, childCount] = await Promise.all([
    Product.countDocuments({ category: req.params.id, isActive: true }),
    Category.countDocuments({ parentCategory: req.params.id, isActive: true }),
  ]);
  if (productCount || childCount) {
    throw ApiError.conflict('Category still has products or sub-categories. Deactivate it instead');
  }
  const category = await Category.findByIdAndDelete(req.params.id);
  if (!category) throw ApiError.notFound('Category not found');
  return sendSuccess(res, { message: 'Category deleted' });
});

import { z } from 'zod';
import { objectId, paginationQuery } from './common.js';

const variant = z.object({
  sku: z.string().min(2).max(40),
  size: z.string().min(1).max(20),
  color: z.string().min(1).max(30),
  colorHex: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/).optional(),
  price: z.number().nonnegative(),
  mrp: z.number().nonnegative(),
  stock: z.number().int().nonnegative().default(0),
  isActive: z.boolean().default(true),
}).refine((v) => v.mrp >= v.price, { message: 'MRP cannot be lower than price', path: ['mrp'] });

const image = z.object({ url: z.string().url(), publicId: z.string().min(1) });

export const listProductsSchema = {
  query: paginationQuery.extend({
    category: z.string().optional(),
    subCategory: z.string().optional(),
    size: z.string().optional(),
    color: z.string().optional(),
    minPrice: z.coerce.number().nonnegative().optional(),
    maxPrice: z.coerce.number().nonnegative().optional(),
    search: z.string().max(100).optional(),
    sort: z.enum(['newest', 'oldest', 'price_asc', 'price_desc', 'rating', 'popular', 'discount']).default('newest'),
    isFeatured: z.coerce.boolean().optional(),
    isBestseller: z.coerce.boolean().optional(),
    isNewArrival: z.coerce.boolean().optional(),
    inStock: z.coerce.boolean().optional(),
    includeInactive: z.coerce.boolean().optional(),
  }),
};

export const createProductSchema = {
  body: z.object({
    name: z.string().min(2).max(160),
    description: z.string().min(10),
    category: objectId,
    subCategory: objectId.nullable().optional(),
    brand: z.string().max(60).optional(),
    tags: z.array(z.string().max(30)).max(20).optional(),
    images: z.array(image).min(2, 'Provide at least two images (front + back)'),
    videos: z.array(image.partial({ publicId: true })).optional(),
    variants: z.array(variant).min(1),
    isFeatured: z.boolean().optional(),
    isBestseller: z.boolean().optional(),
    isNewArrival: z.boolean().optional(),
    seo: z.object({ metaTitle: z.string().max(70).optional(), metaDescription: z.string().max(180).optional() }).optional(),
  }),
};

export const updateProductSchema = {
  params: z.object({ id: objectId }),
  body: createProductSchema.body.partial().extend({ isActive: z.boolean().optional() }),
};

export const stockSchema = {
  params: z.object({ id: objectId, variantId: objectId }),
  body: z.object({
    stock: z.number().int().nonnegative().optional(),
    delta: z.number().int().optional(),
  }).refine((b) => b.stock !== undefined || b.delta !== undefined, { message: 'Provide stock or delta' }),
};

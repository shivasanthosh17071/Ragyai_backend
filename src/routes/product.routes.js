import { Router } from 'express';
import { z } from 'zod';
import * as c from '../controllers/product.controller.js';
import { protect, restrictTo, optionalAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { uploadImages, handleUploadError } from '../middleware/upload.js';
import { writeLimiter } from '../middleware/rateLimiter.js';
import { idParam, objectId } from '../validators/common.js';
import * as v from '../validators/product.validator.js';

const router = Router();
const adminOnly = [protect, restrictTo('admin')];

router.get('/', optionalAuth, validate(v.listProductsSchema), c.listProducts);
router.get('/:slug', validate({ params: z.object({ slug: z.string().min(1) }) }), c.getProductBySlug);
router.get('/:id/related', validate({ params: idParam }), c.getRelatedProducts);

router.post('/', adminOnly, writeLimiter, validate(v.createProductSchema), c.createProduct);
router.put('/:id', adminOnly, validate(v.updateProductSchema), c.updateProduct);
router.delete('/:id', adminOnly, validate({ params: idParam }), c.deleteProduct);

router.patch('/:id/variants/:variantId/stock', adminOnly, validate(v.stockSchema), c.updateVariantStock);

router.post('/:id/images', adminOnly, uploadImages.array('images', 10), handleUploadError, c.attachImages);
router.delete('/:id/images/:publicId(*)', adminOnly, c.removeImage);
router.patch('/:id/images/reorder', adminOnly,
  validate({ params: idParam, body: z.object({ order: z.array(z.string()).min(2) }) }), c.reorderImages);

export default router;

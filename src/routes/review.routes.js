import { Router } from 'express';
import { z } from 'zod';
import * as c from '../controllers/review.controller.js';
import { protect, restrictTo, optionalAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { idParam, objectId, paginationQuery } from '../validators/common.js';
import { createReviewSchema, updateReviewSchema } from '../validators/misc.validator.js';

const router = Router();
const adminOnly = [protect, restrictTo('admin')];

router.get('/pending', adminOnly, validate({ query: paginationQuery }), c.listPendingReviews);
router.get('/product/:productId', optionalAuth,
  validate({ params: z.object({ productId: objectId }), query: paginationQuery }), c.listProductReviews);

router.post('/', protect, validate(createReviewSchema), c.createReview);
router.put('/:id', protect, validate(updateReviewSchema), c.updateReview);
router.delete('/:id', protect, validate({ params: idParam }), c.deleteReview);
router.patch('/:id/approve', adminOnly,
  validate({ params: idParam, body: z.object({ isApproved: z.boolean().default(true) }) }), c.moderateReview);

export default router;

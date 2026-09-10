import { Router } from 'express';
import * as c from '../controllers/coupon.controller.js';
import { protect, restrictTo, optionalAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { idParam, paginationQuery } from '../validators/common.js';
import { applyCouponSchema, couponSchema, updateCouponSchema } from '../validators/misc.validator.js';

const router = Router();
const adminOnly = [protect, restrictTo('admin')];

router.post('/apply', optionalAuth, validate(applyCouponSchema), c.applyCoupon);

router.get('/', adminOnly, validate({ query: paginationQuery }), c.listCoupons);
router.post('/', adminOnly, validate(couponSchema), c.createCoupon);
router.put('/:id', adminOnly, validate({ params: idParam, ...updateCouponSchema }), c.updateCoupon);
router.delete('/:id', adminOnly, validate({ params: idParam }), c.deleteCoupon);

export default router;

import { Router } from 'express';
import * as c from '../controllers/order.controller.js';
import { protect, restrictTo, optionalAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { writeLimiter } from '../middleware/rateLimiter.js';
import { idParam } from '../validators/common.js';
import * as v from '../validators/order.validator.js';

const router = Router();
const adminOnly = [protect, restrictTo('admin')];

// Guest tracking must be declared before /:id so it is not swallowed by it.
router.get('/track', validate(v.trackOrderSchema), c.trackOrder);

router.post('/', optionalAuth, writeLimiter, validate(v.createOrderSchema), c.createOrder);
router.get('/', protect, validate(v.listOrdersSchema), c.listOrders);
router.get('/:id', protect, validate({ params: idParam }), c.getOrder);
router.get('/:id/invoice', protect, validate({ params: idParam }), c.getInvoice);

router.patch('/:id/cancel', protect, validate(v.cancelOrderSchema), c.cancelOrder);
router.patch('/:id/status', adminOnly, validate(v.updateStatusSchema), c.updateStatus);
router.patch('/:id/courier', adminOnly, validate(v.courierSchema), c.updateCourier);

export default router;

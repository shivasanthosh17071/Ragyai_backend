import { Router } from 'express';
import * as c from '../controllers/payment.controller.js';
import { protect, restrictTo, optionalAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { paymentLimiter } from '../middleware/rateLimiter.js';
import { createPaymentOrderSchema, verifyPaymentSchema, refundSchema } from '../validators/misc.validator.js';

const router = Router();

// Guest checkout must be able to pay, so these are optionalAuth, not protect.
router.post('/razorpay/create-order', paymentLimiter, optionalAuth, validate(createPaymentOrderSchema), c.createRazorpayOrder);
router.post('/razorpay/verify', paymentLimiter, optionalAuth, validate(verifyPaymentSchema), c.verifyRazorpayPayment);

// No auth and no rate limit: Razorpay calls this, and the HMAC is the auth.
router.post('/razorpay/webhook', c.razorpayWebhook);

router.post('/:orderId/refund', protect, restrictTo('admin'), validate(refundSchema), c.refundOrder);

export default router;

import { Router } from 'express';
import * as c from '../controllers/auth.controller.js';
import { validate } from '../middleware/validate.js';
import { protect } from '../middleware/auth.js';
import { authLimiter, otpLimiter, resendVerificationLimiter } from '../middleware/rateLimiter.js';
import * as v from '../validators/auth.validator.js';

const router = Router();

router.post('/register', authLimiter, validate(v.registerSchema), c.register);
router.post('/login', authLimiter, validate(v.loginSchema), c.login);
router.post('/send-otp', otpLimiter, validate(v.sendOtpSchema), c.sendOtp);
router.post('/verify-otp', otpLimiter, validate(v.verifyOtpSchema), c.verifyOtp);
router.post('/refresh-token', c.refreshToken);
router.post('/logout', c.logout);
router.post('/forgot-password', authLimiter, validate(v.forgotPasswordSchema), c.forgotPassword);
router.post('/reset-password', authLimiter, validate(v.resetPasswordSchema), c.resetPassword);
router.post('/verify-email', authLimiter, validate(v.verifyEmailSchema), c.verifyEmail);
router.post('/resend-verification', resendVerificationLimiter, validate(v.resendVerificationSchema), c.resendVerificationEmail);
router.get('/me', protect, c.me);

export default router;

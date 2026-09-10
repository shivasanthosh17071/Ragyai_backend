import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

const base = {
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => env.nodeEnv === 'test',
  handler: (_req, res, _next, options) =>
    res.status(429).json({ success: false, message: options.message }),
};

export const globalLimiter = rateLimit({
  ...base, windowMs: 15 * 60 * 1000, max: 1000,
  message: 'Too many requests, please try again later',
});

export const authLimiter = rateLimit({
  ...base, windowMs: 15 * 60 * 1000, max: 10,
  message: 'Too many login attempts. Try again in 15 minutes',
});

export const otpLimiter = rateLimit({
  ...base, windowMs: 10 * 60 * 1000, max: 5,
  keyGenerator: (req) => `${req.ip}:${req.body?.phone || ''}`,
  message: 'Too many OTP requests. Please wait before retrying',
});

export const paymentLimiter = rateLimit({
  ...base, windowMs: 5 * 60 * 1000, max: 30,
  message: 'Too many payment requests, please slow down',
});

export const writeLimiter = rateLimit({
  ...base, windowMs: 60 * 1000, max: 60,
  message: 'Too many requests, please slow down',
});

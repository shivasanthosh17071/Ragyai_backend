import { z } from 'zod';
import { email, password, phone } from './common.js';

export const registerSchema = {
  body: z.object({
    name: z.string().min(2).max(80),
    email,
    phone: phone.optional(),
    password,
  }),
};

export const loginSchema = {
  body: z.object({
    identifier: z.string().min(3, 'Enter your email or phone'),
    password: z.string().min(1, 'Password is required'),
  }),
};

export const sendOtpSchema = {
  body: z.object({ phone, purpose: z.enum(['login', 'verify']).default('login') }),
};

export const verifyOtpSchema = {
  body: z.object({ phone, otp: z.string().regex(/^\d{6}$/, 'OTP must be 6 digits') }),
};

export const forgotPasswordSchema = { body: z.object({ email }) };

export const resetPasswordSchema = {
  body: z.object({ token: z.string().min(10), password }),
};

export const verifyEmailSchema = {
  body: z.object({ token: z.string().min(10) }),
};

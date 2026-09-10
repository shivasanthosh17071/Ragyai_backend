import crypto from 'crypto';
import { User } from '../models/index.js';
import ApiError from '../utils/apiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { env } from '../config/env.js';
import sendEmail from '../utils/sendEmail.js';
import sendSms from '../utils/sendSms.js';
import {
  signAccessToken, signRefreshToken, verifyRefreshToken, hashToken,
  setRefreshCookie, clearRefreshCookie, readRefreshCookie, generateOtp, randomToken,
} from '../utils/generateToken.js';

const issueSession = async (user, res) => {
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);
  user.refreshToken = hashToken(refreshToken);
  await user.save({ validateBeforeSave: false });
  setRefreshCookie(res, refreshToken);
  return { accessToken, refreshToken };
};

const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

/** Issues a fresh verification token for the user and emails the link. Never throws. */
const sendVerificationEmail = async (user) => {
  const raw = randomToken();
  user.emailVerificationToken = crypto.createHash('sha256').update(raw).digest('hex');
  user.emailVerificationExpiry = new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS);
  await user.save({ validateBeforeSave: false });

  const link = `${env.clientOrigins[0]}/verify-email?token=${raw}`;
  return sendEmail({
    to: user.email,
    subject: `Verify your email for ${env.brandName}`,
    html: `<p>Hi ${user.name}, thanks for creating an account with ${env.brandName}.</p>
      <p>Confirm your email address within 24 hours:</p>
      <p><a href="${link}">${link}</a></p>`,
  });
};

export const register = asyncHandler(async (req, res) => {
  const { name, email, phone, password } = req.body;

  // Phone is optional now — an omitted phone must never match another phone-less user via
  // a stray `{ phone: undefined }` clause (Mongo treats that as "phone is null or missing").
  const dupeFilter = phone ? { $or: [{ email }, { phone }] } : { email };
  const existing = await User.findOne(dupeFilter);
  if (existing) {
    throw ApiError.conflict(existing.email === email ? 'Email already registered' : 'Phone already registered');
  }

  const user = new User({ name, email, phone });
  await user.setPassword(password);
  await user.save();

  const { accessToken } = await issueSession(user, res);
  const emailResult = await sendVerificationEmail(user);

  return sendSuccess(res, {
    status: 201,
    message: 'Account created',
    // devVerificationSent lets the storefront show the dev-mode hint the same way OTP does.
    data: { user, accessToken, ...(env.isProd ? {} : { devVerificationSent: emailResult?.dev === true }) },
  });
});

export const verifyEmail = asyncHandler(async (req, res) => {
  const { token } = req.body;
  const hashed = crypto.createHash('sha256').update(token).digest('hex');

  const user = await User.findOne({
    emailVerificationToken: hashed,
    emailVerificationExpiry: { $gt: new Date() },
  }).select('+emailVerificationToken +emailVerificationExpiry');
  if (!user) throw ApiError.badRequest('Verification link is invalid or has expired');

  user.isEmailVerified = true;
  user.emailVerificationToken = undefined;
  user.emailVerificationExpiry = undefined;
  await user.save({ validateBeforeSave: false });

  return sendSuccess(res, { message: 'Email verified', data: { user } });
});

export const resendVerificationEmail = asyncHandler(async (req, res) => {
  if (req.user.isEmailVerified) throw ApiError.badRequest('Your email is already verified');
  await sendVerificationEmail(req.user);
  return sendSuccess(res, { message: 'Verification email sent' });
});

export const login = asyncHandler(async (req, res) => {
  const { identifier, password } = req.body;
  const query = identifier.includes('@') ? { email: identifier.toLowerCase() } : { phone: identifier };

  const user = await User.findOne(query).select('+passwordHash');
  // Same message either way — do not reveal which accounts exist.
  if (!user || !(await user.comparePassword(password))) {
    throw ApiError.unauthorized('Invalid credentials');
  }
  if (!user.isActive) throw ApiError.forbidden('This account has been disabled');

  const { accessToken } = await issueSession(user, res);
  return sendSuccess(res, { message: 'Logged in', data: { user, accessToken } });
});

export const sendOtp = asyncHandler(async (req, res) => {
  const { phone, purpose } = req.body;
  const user = await User.findOne({ phone }).select('+otp +otpExpiry');
  if (!user && purpose === 'verify') throw ApiError.notFound('No account found for this number');

  const target = user || new User({
    name: 'Guest', phone, email: `${phone}@otp.pending`, passwordHash: 'otp-only',
  });

  const otp = generateOtp();
  target.otp = hashToken(otp);
  target.otpExpiry = new Date(Date.now() + env.otpTtlMinutes * 60 * 1000);
  target.otpAttempts = 0;
  await target.save({ validateBeforeSave: false });

  await sendSms({ to: phone, message: `${otp} is your ${env.brandName} verification code. Valid for ${env.otpTtlMinutes} minutes.` });

  return sendSuccess(res, {
    message: 'OTP sent',
    data: { expiresIn: env.otpTtlMinutes * 60, ...(env.isProd ? {} : { devOtp: otp }) },
  });
});

export const verifyOtp = asyncHandler(async (req, res) => {
  const { phone, otp } = req.body;
  const user = await User.findOne({ phone }).select('+otp +otpExpiry +otpAttempts');
  if (!user?.otp) throw ApiError.badRequest('Request an OTP first');
  if (user.otpExpiry < new Date()) throw ApiError.badRequest('OTP has expired');
  if (user.otpAttempts >= 5) throw ApiError.tooMany('Too many incorrect attempts. Request a new OTP');

  if (user.otp !== hashToken(otp)) {
    user.otpAttempts += 1;
    await user.save({ validateBeforeSave: false });
    throw ApiError.badRequest('Incorrect OTP');
  }

  user.otp = undefined;
  user.otpExpiry = undefined;
  user.otpAttempts = 0;
  user.isPhoneVerified = true;
  await user.save({ validateBeforeSave: false });

  const { accessToken } = await issueSession(user, res);
  return sendSuccess(res, { message: 'Phone verified', data: { user, accessToken } });
});

export const refreshToken = asyncHandler(async (req, res) => {
  const token = readRefreshCookie(req);
  if (!token) throw ApiError.unauthorized('Refresh token missing');

  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch {
    throw ApiError.unauthorized('Invalid or expired refresh token');
  }

  const user = await User.findById(payload.sub).select('+refreshToken');
  // Rotation: a token that no longer matches the stored hash has been replaced or revoked.
  if (!user || user.refreshToken !== hashToken(token)) {
    throw ApiError.unauthorized('Refresh token has been revoked');
  }

  const { accessToken } = await issueSession(user, res);
  return sendSuccess(res, { message: 'Token refreshed', data: { accessToken } });
});

export const logout = asyncHandler(async (req, res) => {
  const token = readRefreshCookie(req);
  if (token) {
    try {
      const payload = verifyRefreshToken(token);
      await User.findByIdAndUpdate(payload.sub, { $unset: { refreshToken: 1 } });
    } catch { /* already invalid */ }
  }
  clearRefreshCookie(res);
  return sendSuccess(res, { message: 'Logged out' });
});

export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });

  // Always respond identically so the endpoint cannot enumerate accounts.
  if (user) {
    const raw = randomToken();
    user.passwordResetToken = crypto.createHash('sha256').update(raw).digest('hex');
    user.passwordResetExpiry = new Date(Date.now() + 30 * 60 * 1000);
    await user.save({ validateBeforeSave: false });

    await sendEmail({
      to: email,
      subject: `Reset your ${env.brandName} password`,
      html: `<p>Use this token within 30 minutes to reset your password:</p><p><b>${raw}</b></p>`,
    });
  }

  return sendSuccess(res, { message: 'If that email is registered, a reset link has been sent' });
});

export const resetPassword = asyncHandler(async (req, res) => {
  const { token, password } = req.body;
  const hashed = crypto.createHash('sha256').update(token).digest('hex');

  const user = await User.findOne({
    passwordResetToken: hashed,
    passwordResetExpiry: { $gt: new Date() },
  }).select('+passwordResetToken +passwordResetExpiry');
  if (!user) throw ApiError.badRequest('Reset token is invalid or has expired');

  await user.setPassword(password);
  user.passwordResetToken = undefined;
  user.passwordResetExpiry = undefined;
  user.tokenVersion += 1;      // invalidate existing refresh tokens
  user.refreshToken = undefined;
  await user.save();

  return sendSuccess(res, { message: 'Password updated. Please log in again' });
});

export const me = asyncHandler(async (req, res) =>
  sendSuccess(res, { data: { user: req.user } }));

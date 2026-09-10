import { User } from '../models/index.js';
import ApiError from '../utils/apiError.js';
import { verifyAccessToken } from '../utils/generateToken.js';
import asyncHandler from '../utils/asyncHandler.js';

const extractToken = (req) => {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return req.cookies?.accessToken || null;
};

export const protect = asyncHandler(async (req, _res, next) => {
  const token = extractToken(req);
  if (!token) throw ApiError.unauthorized('Authentication required');

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch (err) {
    throw ApiError.unauthorized(err.name === 'TokenExpiredError' ? 'Access token expired' : 'Invalid token');
  }

  const user = await User.findById(payload.sub);
  if (!user || !user.isActive) throw ApiError.unauthorized('Account no longer active');

  req.user = user;
  next();
});

/** Populates req.user when a token is present, but never rejects — for guest-friendly routes. */
export const optionalAuth = asyncHandler(async (req, _res, next) => {
  const token = extractToken(req);
  if (!token) return next();
  try {
    const payload = verifyAccessToken(token);
    const user = await User.findById(payload.sub);
    if (user?.isActive) req.user = user;
  } catch {
    /* ignore — treated as guest */
  }
  next();
});

export const restrictTo = (...roles) => (req, _res, next) => {
  if (!req.user) return next(ApiError.unauthorized('Authentication required'));
  if (!roles.includes(req.user.role)) return next(ApiError.forbidden('You do not have permission to perform this action'));
  next();
};

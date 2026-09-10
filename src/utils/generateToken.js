import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { env } from '../config/env.js';

export const signAccessToken = (user) =>
  jwt.sign({ sub: String(user._id), role: user.role }, env.jwt.accessSecret, {
    expiresIn: env.jwt.accessExpires,
  });

export const signRefreshToken = (user) =>
  jwt.sign({ sub: String(user._id), tv: user.tokenVersion || 0 }, env.jwt.refreshSecret, {
    expiresIn: env.jwt.refreshExpires,
  });

export const verifyAccessToken = (token) => jwt.verify(token, env.jwt.accessSecret);
export const verifyRefreshToken = (token) => jwt.verify(token, env.jwt.refreshSecret);

/** Refresh tokens are stored hashed — a DB leak must not yield usable tokens. */
export const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const REFRESH_COOKIE = 'refreshToken';
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

export const setRefreshCookie = (res, token) => {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: env.isProd,
    sameSite: env.isProd ? 'none' : 'lax',
    domain: env.jwt.cookieDomain,
    path: '/api/v1/auth',
    maxAge: SEVEN_DAYS,
  });
};

export const clearRefreshCookie = (res) =>
  res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth', domain: env.jwt.cookieDomain });

export const readRefreshCookie = (req) => req.cookies?.[REFRESH_COOKIE] || req.body?.refreshToken;

export const generateOtp = () => String(crypto.randomInt(100000, 1000000));
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('hex');

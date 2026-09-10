import mongoose from 'mongoose';
import ApiError from '../utils/apiError.js';
import { env } from '../config/env.js';

export const notFound = (req, _res, next) =>
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));

// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, _req, res, _next) => {
  let error = err;

  if (err instanceof mongoose.Error.ValidationError) {
    const errors = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
    error = ApiError.unprocessable('Validation failed', errors);
  } else if (err instanceof mongoose.Error.CastError) {
    error = ApiError.badRequest(`Invalid value for ${err.path}`);
  } else if (err?.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    error = ApiError.conflict(`${field} already exists`);
  } else if (err?.type === 'entity.too.large') {
    error = ApiError.badRequest('Payload too large');
  } else if (!(err instanceof ApiError)) {
    error = new ApiError(err.statusCode || 500, err.message || 'Something went wrong');
    error.isOperational = false;
  }

  if (!error.isOperational || error.statusCode >= 500) console.error('[error]', err);

  res.status(error.statusCode).json({
    success: false,
    message: error.statusCode >= 500 && env.isProd ? 'Something went wrong' : error.message,
    ...(error.errors && { errors: error.errors }),
    ...(!env.isProd && error.statusCode >= 500 && { stack: err.stack }),
  });
};

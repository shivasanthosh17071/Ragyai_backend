import ApiError from '../utils/apiError.js';

/**
 * validate({ body, query, params }) — each key holds a zod schema.
 * Parsed output replaces the raw input, so controllers get coerced, trimmed data.
 */
export const validate = (schemas) => (req, _res, next) => {
  const errors = [];
  for (const source of ['body', 'query', 'params']) {
    const schema = schemas[source];
    if (!schema) continue;
    const result = schema.safeParse(req[source]);
    if (result.success) {
      if (source === 'query') {
        // req.query has no setter on some Express versions — mutate a mirror.
        req.validatedQuery = result.data;
      } else {
        req[source] = result.data;
      }
    } else {
      result.error.issues.forEach((i) =>
        errors.push({ field: `${source}.${i.path.join('.')}`, message: i.message })
      );
    }
  }
  if (errors.length) return next(ApiError.unprocessable('Validation failed', errors));
  next();
};

/** Controllers read query params through this so validation is never bypassed. */
export const q = (req) => req.validatedQuery ?? req.query;

export default validate;

import mongoSanitize from 'express-mongo-sanitize';

/**
 * Strips `$`-prefixed and dotted keys from request payloads (NoSQL injection).
 * Applied per-property because Express 5 exposes req.query as a getter.
 */
export const sanitizeRequest = (req, _res, next) => {
  for (const key of ['body', 'params', 'query']) {
    if (req[key]) mongoSanitize.sanitize(req[key], { replaceWith: '_' });
  }
  next();
};

export default sanitizeRequest;

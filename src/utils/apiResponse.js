export const sendSuccess = (res, { status = 200, message = 'OK', data = undefined, meta = undefined } = {}) =>
  res.status(status).json({ success: true, message, ...(data !== undefined && { data }), ...(meta && { meta }) });

export const paginationMeta = ({ page, limit, total }) => ({
  page,
  limit,
  total,
  totalPages: Math.max(1, Math.ceil(total / limit)),
  hasNextPage: page * limit < total,
});

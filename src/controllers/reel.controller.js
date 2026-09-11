import { Reel } from '../models/index.js';
import ApiError from '../utils/apiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { destroyAsset } from '../config/cloudinary.js';

/** Storefront sees active reels only; an admin passing includeInactive sees everything. */
export const listReels = asyncHandler(async (req, res) => {
  const includeInactive = req.user?.role === 'admin' && req.query.includeInactive === 'true';
  const filter = includeInactive ? {} : { isActive: true };
  const reels = await Reel.find(filter)
    .sort({ displayOrder: 1, createdAt: -1 })
    .populate('product', 'name slug images basePrice');
  return sendSuccess(res, { data: { reels } });
});

export const createReel = asyncHandler(async (req, res) => {
  const reel = await Reel.create(req.body);
  await reel.populate('product', 'name slug images basePrice');
  return sendSuccess(res, { status: 201, message: 'Reel posted', data: { reel } });
});

export const updateReel = asyncHandler(async (req, res) => {
  const reel = await Reel.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true })
    .populate('product', 'name slug images basePrice');
  if (!reel) throw ApiError.notFound('Reel not found');
  return sendSuccess(res, { message: 'Reel updated', data: { reel } });
});

export const deleteReel = asyncHandler(async (req, res) => {
  const reel = await Reel.findByIdAndDelete(req.params.id);
  if (!reel) throw ApiError.notFound('Reel not found');
  await destroyAsset(reel.video.publicId, 'video').catch((e) => console.error('[cloudinary]', e.message));
  return sendSuccess(res, { message: 'Reel deleted' });
});

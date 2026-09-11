import { Settings } from '../models/index.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';

/** Only the subset of Settings safe to expose to unauthenticated storefront visitors. */
export const getPublicSettings = asyncHandler(async (_req, res) => {
  const settings = await Settings.get();
  return sendSuccess(res, {
    data: {
      shippingFee: settings.shippingFee,
      freeShippingThreshold: settings.freeShippingThreshold,
      freeShippingBannerText: settings.freeShippingBannerText || '',
      instagram: settings.business?.instagram || '',
    },
  });
});

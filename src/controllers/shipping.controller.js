import { Settings } from '../models/index.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';
import ApiError from '../utils/apiError.js';
import * as shiprocket from '../services/shiprocket.service.js';

/**
 * Rule-based serviceability for the MVP: block-list plus optional allow-list of
 * prefixes, with metro pincodes getting a shorter delivery estimate.
 * Phase 2 swaps the body for shiprocket.checkServiceability().
 */
export const checkServiceability = asyncHandler(async (req, res) => {
  const { pincode } = req.body;
  const settings = await Settings.get();

  if (settings.nonServiceablePincodes?.includes(pincode)) {
    return sendSuccess(res, { data: { pincode, serviceable: false, reason: 'We do not deliver to this pincode yet' } });
  }
  if (settings.servicePincodePrefixes?.length) {
    const allowed = settings.servicePincodePrefixes.some((p) => pincode.startsWith(p));
    if (!allowed) {
      return sendSuccess(res, { data: { pincode, serviceable: false, reason: 'Outside our current delivery zone' } });
    }
  }

  const isMetro = (settings.metroPincodePrefixes || []).some((p) => pincode.startsWith(p));
  return sendSuccess(res, {
    data: {
      pincode,
      serviceable: true,
      codAvailable: settings.codEnabled,
      estimatedDays: isMetro ? 3 : 6,
      shippingFee: settings.shippingFee,
      freeShippingThreshold: settings.freeShippingThreshold,
    },
  });
});

export const createShipment = asyncHandler(async () => {
  throw new ApiError(501, 'Shiprocket integration lands in phase 2');
});

export const shiprocketWebhook = asyncHandler(async (req, res) => {
  const token = req.headers['x-api-key'];
  if (!token || token !== process.env.SHIPROCKET_WEBHOOK_TOKEN) {
    throw ApiError.unauthorized('Invalid webhook token');
  }
  const result = await shiprocket.handleWebhook(req.body);
  return res.status(200).json(result);
});

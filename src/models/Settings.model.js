import mongoose from 'mongoose';
import { env } from '../config/env.js';

/**
 * Singleton document backing the admin "Settings" screen. Values fall back to
 * .env defaults so a fresh install works before the owner touches anything.
 */
const settingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'store', unique: true },
    business: {
      name: { type: String, default: env.brandName },
      email: String,
      phone: String,
      address: String,
      gstin: String,
      instagram: String,
    },
    shippingFee: { type: Number, default: env.store.shippingFee },
    freeShippingThreshold: { type: Number, default: env.store.freeShippingThreshold },
    taxPercent: { type: Number, default: env.store.taxPercent },
    lowStockThreshold: { type: Number, default: env.store.lowStockThreshold },
    codEnabled: { type: Boolean, default: true },
    codConfirmWindowHours: { type: Number, default: env.store.codConfirmWindowHours },
    // Rule-based serviceability until Shiprocket lands in phase 2.
    nonServiceablePincodes: [{ type: String }],
    servicePincodePrefixes: [{ type: String }],
    metroPincodePrefixes: { type: [String], default: ['11', '40', '56', '60', '70', '50', '38'] },
  },
  { timestamps: true }
);

settingsSchema.statics.get = async function () {
  let doc = await this.findOne({ key: 'store' });
  if (!doc) doc = await this.create({ key: 'store' });
  return doc;
};

export default mongoose.model('Settings', settingsSchema);

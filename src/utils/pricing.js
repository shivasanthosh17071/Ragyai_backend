import { env } from '../config/env.js';

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Single source of truth for order money maths.
 * Every input here must already have come from the DB, never from the client.
 */
export const computeTotals = ({ items, discount = 0, settings = {} }) => {
  const shippingFeeRule = settings.shippingFee ?? env.store.shippingFee;
  const freeThreshold = settings.freeShippingThreshold ?? env.store.freeShippingThreshold;
  const taxPercent = settings.taxPercent ?? env.store.taxPercent;

  const subtotal = round2(items.reduce((sum, i) => sum + i.price * i.qty, 0));
  const cappedDiscount = round2(Math.min(discount, subtotal));
  const taxable = round2(subtotal - cappedDiscount);
  const shippingFee = taxable >= freeThreshold ? 0 : shippingFeeRule;
  const tax = round2((taxable * taxPercent) / 100);
  const totalAmount = round2(taxable + shippingFee + tax);

  return { subtotal, discount: cappedDiscount, shippingFee, tax, totalAmount };
};

export { round2 };

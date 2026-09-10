import Razorpay from 'razorpay';
import { env } from './env.js';

let instance = null;

/** Lazy: the app still boots (seeding, local dev) without payment keys set. */
export const getRazorpay = () => {
  if (!env.razorpay.keyId || !env.razorpay.keySecret) {
    throw new Error('Razorpay keys are not configured (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET)');
  }
  if (!instance) {
    instance = new Razorpay({ key_id: env.razorpay.keyId, key_secret: env.razorpay.keySecret });
  }
  return instance;
};

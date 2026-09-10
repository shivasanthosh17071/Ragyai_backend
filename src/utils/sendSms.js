import { env } from '../config/env.js';

/**
 * Provider-agnostic SMS sender. Swap the `switch` for MSG91 / Twilio / Gupshup
 * in one place; callers stay unchanged. Never throws.
 */
export const sendSms = async ({ to, message }) => {
  try {
    switch (env.sms.provider) {
      case 'console':
      default:
        console.log(`[sms:dev] to=${to} :: ${message}`);
        return { sent: false, dev: true };
    }
  } catch (err) {
    console.error('[sms:error]', err.message);
    return { sent: false, error: err.message };
  }
};

export default sendSms;

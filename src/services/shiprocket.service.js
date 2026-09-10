import { env } from '../config/env.js';

/**
 * Phase 2 stub. The shapes below match Shiprocket's v1 API so the order
 * controller does not have to change when this is wired up for real.
 */
let cachedToken = null;
let tokenExpiry = 0;

const BASE = 'https://apiv2.shiprocket.in/v1/external';

export const isConfigured = () => Boolean(env.shiprocket.email && env.shiprocket.password);

export const authenticate = async () => {
  if (!isConfigured()) throw new Error('Shiprocket credentials are not configured');
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;

  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: env.shiprocket.email, password: env.shiprocket.password }),
  });
  if (!res.ok) throw new Error(`Shiprocket auth failed: ${res.status}`);

  const data = await res.json();
  cachedToken = data.token;
  tokenExpiry = Date.now() + 9 * 24 * 60 * 60 * 1000; // tokens last 10 days
  return cachedToken;
};

export const createShipment = async (/* order */) => {
  throw new Error('Shiprocket shipment creation is not implemented yet (phase 2)');
};

export const checkServiceability = async (/* { pickupPincode, deliveryPincode, weight, cod } */) => {
  throw new Error('Shiprocket serviceability is not implemented yet (phase 2)');
};

export const handleWebhook = async (payload) => {
  // Expected: { awb, current_status, order_id, etd, ... }
  console.log('[shiprocket:webhook]', payload?.awb, payload?.current_status);
  return { received: true };
};

import { z } from 'zod';

export const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');
export const phone = z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number');
export const pincode = z.string().regex(/^\d{6}$/, 'Pincode must be 6 digits');
export const email = z.string().email('Enter a valid email address').toLowerCase();
export const password = z.string().min(8, 'Password must be at least 8 characters')
  .max(72, 'Password is too long')
  .regex(/[a-zA-Z]/, 'Password must contain a letter')
  .regex(/\d/, 'Password must contain a number');

export const idParam = z.object({ id: objectId });
export const numeric = (def) => z.coerce.number().optional().default(def);

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const addressSchema = z.object({
  label: z.string().max(30).optional(),
  line1: z.string().min(3).max(200),
  line2: z.string().max(200).optional(),
  city: z.string().min(2).max(60),
  state: z.string().min(2).max(60),
  pincode,
  phone,
  isDefault: z.boolean().optional(),
});

import { Router } from 'express';
import * as c from '../controllers/user.controller.js';
import { protect } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { idParam } from '../validators/common.js';
import { addressBodySchema, profileSchema } from '../validators/misc.validator.js';
import { z } from 'zod';
import { objectId } from '../validators/common.js';

const router = Router();
router.use(protect);

router.get('/me/addresses', c.listAddresses);
router.post('/me/addresses', validate(addressBodySchema), c.addAddress);
router.put('/me/addresses/:id', validate({ params: idParam, ...addressBodySchema }), c.updateAddress);
router.delete('/me/addresses/:id', validate({ params: idParam }), c.deleteAddress);

router.put('/me/profile', validate(profileSchema), c.updateProfile);

const productParam = { params: z.object({ productId: objectId }) };

router.get('/me/wishlist', c.getWishlist);
router.post('/me/wishlist/:productId', validate(productParam), c.addToWishlist);
router.delete('/me/wishlist/:productId', validate(productParam), c.removeFromWishlist);

router.get('/me/compare', c.getCompare);
router.post('/me/compare/:productId', validate(productParam), c.addToCompare);
router.delete('/me/compare/:productId', validate(productParam), c.removeFromCompare);

export default router;

import { Router } from 'express';
import * as c from '../controllers/cart.controller.js';
import { protect } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { addCartItemSchema, updateCartItemSchema } from '../validators/misc.validator.js';
import { z } from 'zod';
import { objectId } from '../validators/common.js';

const router = Router();
router.use(protect);

router.get('/', c.getCart);
router.post('/items', validate(addCartItemSchema), c.addItem);
router.put('/items/:itemId', validate(updateCartItemSchema), c.updateItem);
router.delete('/items/:itemId', validate({ params: z.object({ itemId: objectId }) }), c.removeItem);
router.delete('/', c.clearCart);

export default router;

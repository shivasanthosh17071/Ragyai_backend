import { Router } from 'express';
import * as c from '../controllers/shipping.controller.js';
import { protect, restrictTo } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { serviceabilitySchema } from '../validators/misc.validator.js';

const router = Router();

router.post('/check-serviceability', validate(serviceabilitySchema), c.checkServiceability);
router.post('/shiprocket/create-shipment', protect, restrictTo('admin'), c.createShipment);
router.post('/shiprocket/webhook', c.shiprocketWebhook);

export default router;

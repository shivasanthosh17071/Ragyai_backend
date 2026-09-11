import { Router } from 'express';
import * as c from '../controllers/contact.controller.js';
import { validate } from '../middleware/validate.js';
import { contactLimiter } from '../middleware/rateLimiter.js';
import { contactSchema } from '../validators/misc.validator.js';

const router = Router();

router.post('/', contactLimiter, validate(contactSchema), c.submitContact);

export default router;

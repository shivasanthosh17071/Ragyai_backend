import { Router } from 'express';
import * as c from '../controllers/reel.controller.js';
import { protect, restrictTo, optionalAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { idParam } from '../validators/common.js';
import { reelSchema, updateReelSchema } from '../validators/misc.validator.js';

const router = Router();
const adminOnly = [protect, restrictTo('admin')];

router.get('/', optionalAuth, c.listReels);
router.post('/', adminOnly, validate(reelSchema), c.createReel);
router.put('/:id', adminOnly, validate({ params: idParam, ...updateReelSchema }), c.updateReel);
router.delete('/:id', adminOnly, validate({ params: idParam }), c.deleteReel);

export default router;

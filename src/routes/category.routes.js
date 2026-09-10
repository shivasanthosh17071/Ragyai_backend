import { Router } from 'express';
import * as c from '../controllers/category.controller.js';
import { protect, restrictTo, optionalAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { idParam } from '../validators/common.js';
import { categorySchema } from '../validators/misc.validator.js';

const router = Router();
const adminOnly = [protect, restrictTo('admin')];

router.get('/', optionalAuth, c.getCategoryTree);
router.post('/', adminOnly, validate(categorySchema), c.createCategory);
router.put('/:id', adminOnly, validate({ params: idParam, body: categorySchema.body.partial() }), c.updateCategory);
router.delete('/:id', adminOnly, validate({ params: idParam }), c.deleteCategory);

export default router;

import { Router } from 'express';
import * as c from '../controllers/settings.controller.js';

const router = Router();

router.get('/public', c.getPublicSettings);

export default router;

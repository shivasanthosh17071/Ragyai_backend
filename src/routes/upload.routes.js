import { Router } from 'express';
import * as c from '../controllers/upload.controller.js';
import { protect, restrictTo } from '../middleware/auth.js';
import { uploadImages, uploadVideos, handleUploadError } from '../middleware/upload.js';

const router = Router();
router.use(protect, restrictTo('admin'));

router.get('/signature', c.getUploadSignature);
router.post('/image', uploadImages.array('files', 10), handleUploadError, c.uploadImage);
router.post('/video', uploadVideos.array('files', 3), handleUploadError, c.uploadVideo);
router.delete('/:publicId(*)', c.deleteAsset);

export default router;

import { Router } from 'express';
import authRoutes from './auth.routes.js';
import userRoutes from './user.routes.js';
import productRoutes from './product.routes.js';
import categoryRoutes from './category.routes.js';
import cartRoutes from './cart.routes.js';
import couponRoutes from './coupon.routes.js';
import orderRoutes from './order.routes.js';
import paymentRoutes from './payment.routes.js';
import reviewRoutes from './review.routes.js';
import uploadRoutes from './upload.routes.js';
import shippingRoutes from './shipping.routes.js';
import adminRoutes from './admin.routes.js';
import contactRoutes from './contact.routes.js';
import settingsRoutes from './settings.routes.js';
import reelRoutes from './reel.routes.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/products', productRoutes);
router.use('/categories', categoryRoutes);
router.use('/cart', cartRoutes);
router.use('/coupons', couponRoutes);
router.use('/orders', orderRoutes);
router.use('/payments', paymentRoutes);
router.use('/reviews', reviewRoutes);
router.use('/upload', uploadRoutes);
router.use('/shipping', shippingRoutes);
router.use('/admin', adminRoutes);
router.use('/contact', contactRoutes);
router.use('/settings', settingsRoutes);
router.use('/reels', reelRoutes);

export default router;

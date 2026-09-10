import { Router } from 'express';
import * as c from '../controllers/admin.controller.js';
import { protect, restrictTo } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { idParam } from '../validators/common.js';
import { salesChartSchema, customersQuerySchema } from '../validators/misc.validator.js';

const router = Router();
// Double-protected: authenticated AND role-checked.
router.use(protect, restrictTo('admin'));

router.get('/dashboard/summary', c.dashboardSummary);
router.get('/dashboard/sales-chart', validate(salesChartSchema), c.salesChart);
router.get('/dashboard/top-products', c.topProducts);
router.get('/dashboard/category-split', c.categorySplit);
router.get('/dashboard/recent-orders', c.recentOrders);

router.get('/customers', validate(customersQuerySchema), c.listCustomers);
router.get('/customers/:id', validate({ params: idParam }), c.getCustomer);

router.get('/inventory/low-stock', c.lowStock);

router.get('/settings', c.getSettings);
router.put('/settings', c.updateSettings);

export default router;

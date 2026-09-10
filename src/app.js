import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import cookieParser from 'cookie-parser';

import { env } from './config/env.js';
import routes from './routes/index.js';
import { sanitizeRequest } from './middleware/sanitize.js';
import { globalLimiter } from './middleware/rateLimiter.js';
import { notFound, errorHandler } from './middleware/error.js';

const app = express();

app.set('trust proxy', 1);   // correct client IPs behind a load balancer

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin: (origin, cb) => {
    // Non-browser callers (Razorpay webhooks, curl, mobile) send no Origin.
    if (!origin || env.clientOrigins.includes(origin)) return cb(null, true);
    return cb(new Error(`Origin not allowed by CORS: ${origin}`));
  },
  credentials: true,
}));
app.use(compression());
app.use(cookieParser());
if (!env.isProd) app.use(morgan('dev'));

// The webhook signature is computed over the exact bytes Razorpay sent,
// so this route must see the raw body — mounted before the JSON parser.
app.use('/api/v1/payments/razorpay/webhook', express.raw({ type: 'application/json' }));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(sanitizeRequest);
app.use('/api', globalLimiter);

app.get('/health', (_req, res) =>
  res.json({ success: true, brand: env.brandName, uptime: process.uptime(), env: env.nodeEnv }));

app.use('/api/v1', routes);

app.use(notFound);
app.use(errorHandler);

export default app;

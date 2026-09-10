# Backend — single-seller D2C fashion store

Node.js + Express + MongoDB, Cloudinary for media, Razorpay for payments. ES modules throughout.

## Getting started

```bash
cp .env.example .env      # fill in MONGO_URI and the two JWT secrets at minimum
npm install
npm run seed              # 15 products, 4 sub-categories, 3 coupons, admin + test customer
npm run dev
```

Seeded logins: `admin@example.com / Admin@12345` and `customer@example.com / Customer@12345`. Change them before any deploy.

Health check: `GET /health`. API reference: [API.md](./API.md).

The brand name lives in `BRAND_NAME` rather than the source, so nothing needs a find-and-replace once it's chosen — it feeds emails, invoices, SEO titles and the seeded `brand` field.

## Layout

```
src/
  config/       env, db, cloudinary, razorpay
  models/       User Product Category Cart Coupon Review Order Counter Settings
  controllers/  one per resource
  routes/       one per resource, mounted in routes/index.js
  middleware/   auth, error, upload, validate, rateLimiter, sanitize
  services/     order.service.js (pricing, stock, coupons, notifications), shiprocket.service.js
  utils/        apiError, apiResponse, asyncHandler, generateToken, sendEmail, sendSms, invoice, pricing
  app.js        middleware chain
  server.js     boot, COD sweep, graceful shutdown
seed/seed.js
```

## How the money-critical paths work

**Prices** — `POST /orders` accepts only `{ product, sku, qty }`. A `price` in the request body is stripped by validation and never read. `buildOrderLines()` re-reads every variant from MongoDB, and `computeTotals()` in `utils/pricing.js` is the only place order maths happens (cart preview and checkout share it, so the numbers cannot drift apart).

**Stock** — prepaid orders decrement only when payment is confirmed, so abandoned checkouts never hold inventory. COD decrements at placement and sets `codReleaseAt`; an hourly sweep in `server.js` restocks and auto-cancels anything the owner hasn't confirmed inside `COD_CONFIRM_WINDOW_HOURS`. The decrement is a conditional update (`stock: { $gte: qty }`) rather than a read-then-write, so two shoppers cannot both take the last unit; a partial failure rolls back the lines it already took.

**Payments** — nothing is marked paid without a server-side HMAC check. `/verify` validates `order_id|payment_id` against the key secret with a constant-time compare; the webhook validates over the *raw* request bytes, which is why that one route is mounted with `express.raw` before the JSON parser in `app.js`. Both funnel into `settlePaidOrder()`, which is idempotent — Razorpay retries webhooks, and `/verify` often wins the race, so the second caller is a no-op via the `stockDecremented` flag.

**Coupons** — validated server-side on preview *and* again at order creation: window, usage limit, per-user limit, minimum order value, cap. The discount value in the request is ignored; usage is recorded only once payment settles.

**Deletes** — products soft-delete to `isActive: false` so historical order lines keep resolving.

## Notes on choices worth knowing about

- **`multer-storage-cloudinary` is not used.** It still peer-depends on the Cloudinary v1 SDK and fails to install alongside v2. `middleware/upload.js` has a small storage engine written against v2 directly — same interface (`file.path`, `file.filename`), one less abandoned dependency.
- **Express is pinned to 4.x.** `express-mongo-sanitize` mutates `req.query`, which is a getter in Express 5. `middleware/sanitize.js` sanitizes each property in place so the upgrade path stays open, but the pin is deliberate.
- **A `Settings` singleton was added** beyond the original model list — the admin Settings screen needs somewhere to persist shipping rules, the free-shipping threshold, the COD toggle and business info. It falls back to `.env` defaults, so a fresh install works untouched.
- **`Counter`** backs the atomic `ORD-2026-00042` sequence. **`stockDecremented`** and **`codReleaseAt`** on Order are the idempotency and auto-restock flags described above.
- **The hourly COD sweep uses `setInterval`.** Fine on one instance; move it to BullMQ, Agenda or a system cron before scaling horizontally, or every instance will run it.
- **OTP login** creates a placeholder user with a `@otp.pending` email when the number is new. Collect a real email at first checkout, or drop the unique-email requirement if phone-first signup becomes the default.
- **`sendSms` is a console stub.** Drop MSG91 or Twilio into the single `switch` in `utils/sendSms.js`; callers don't change. Email works as soon as SMTP vars are set and no-ops loudly before that. Neither ever throws — a failed notification must not fail the order it belongs to.

## Before going live

- [ ] Real `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` (32+ random bytes each), never the example values
- [ ] `CLIENT_ORIGINS` locked to the real storefront and admin domains
- [ ] Razorpay webhook registered at `POST /api/v1/payments/razorpay/webhook` with `RAZORPAY_WEBHOOK_SECRET` set — without it, every webhook is rejected
- [ ] Seeded admin credentials changed
- [ ] `NODE_ENV=production` (this switches cookies to `secure`/`sameSite=none` and stops leaking `devOtp` in OTP responses)
- [ ] MongoDB Atlas IP allow-list, or a firewalled self-hosted instance
- [ ] The COD sweep moved to a real scheduler if you run more than one process

## Testing

`node --check` passes on every file and the full route tree (80 routes) mounts clean. The money paths — shipping thresholds, discount capping, tax on the discounted amount, HMAC verification, schema rules, status transitions — are covered by assertions run during the build. There is no integration suite yet; adding Vitest + `mongodb-memory-server` + Supertest around `order.service.js` first would give the best return, since that file holds nearly all the correctness rules.

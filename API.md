# API Reference

Base URL: `{API_BASE_URL}/api/v1` · Auth: `Authorization: Bearer <accessToken>` · Refresh token: httpOnly cookie scoped to `/api/v1/auth`.

**Response envelope**

```jsonc
// success
{ "success": true, "message": "OK", "data": { ... }, "meta": { "page": 1, "limit": 20, "total": 42, "totalPages": 3, "hasNextPage": true } }
// error
{ "success": false, "message": "Validation failed", "errors": [{ "field": "body.email", "message": "Enter a valid email address" }] }
```

Status codes: `400` bad request · `401` not authenticated · `403` wrong role · `404` not found · `409` conflict (duplicate / out of stock) · `422` validation · `429` rate limited · `500` server.

Legend: 🔓 public · 🔐 logged in · 👑 admin

---

## Auth — `/auth`

| Method | Path                    | Access | Notes                                                                         |
| ------ | ----------------------- | ------ | ------------------------------------------------------------------------------ |
| POST   | `/register`             | 🔓     | `{ name, email, phone, password }` → `{ user }`. No session is created — sends a verification email; the account cannot log in until it's clicked |
| POST   | `/login`                | 🔓     | `{ identifier, password }` — identifier is email **or** phone. `403 { code: "EMAIL_NOT_VERIFIED" }` if the account's email isn't verified yet |
| POST   | `/send-otp`             | 🔓     | `{ phone, purpose: 'login'\|'verify' }`. Returns `devOtp` outside production  |
| POST   | `/verify-otp`           | 🔓     | `{ phone, otp }` → session. 5 wrong attempts invalidate the OTP               |
| POST   | `/refresh-token`        | 🔓     | Reads the cookie, rotates it, returns a new access token                      |
| POST   | `/logout`               | 🔓     | Clears the cookie and the stored token hash                                   |
| POST   | `/forgot-password`      | 🔓     | `{ email }` — always the same response, so accounts cannot be enumerated      |
| POST   | `/reset-password`       | 🔓     | `{ token, password }` — bumps `tokenVersion`, killing existing sessions       |
| POST   | `/verify-email`         | 🔓     | `{ token }` — marks the account verified. Token expires 24h after being issued |
| POST   | `/resend-verification`  | 🔓     | `{ email }` — always the same response, so accounts cannot be enumerated      |
| GET    | `/me`                   | 🔐     | Current user                                                                  |

Password rule: min 8 chars, at least one letter and one digit.

## Users — `/users` (all 🔐)

`GET|POST /me/addresses` · `PUT|DELETE /me/addresses/:id` · `PUT /me/profile`
`GET /me/wishlist` · `POST|DELETE /me/wishlist/:productId`
`GET /me/compare` · `POST|DELETE /me/compare/:productId` (max 4 items)

Changing email or phone resets the matching `isVerified` flag. Exactly one address stays `isDefault`.

## Products — `/products`

| Method | Path                             | Access                               |
| ------ | -------------------------------- | ------------------------------------ |
| GET    | `/`                              | 🔓                                   |
| GET    | `/:slug`                         | 🔓                                   |
| GET    | `/:id/related`                   | 🔓                                   |
| POST   | `/`                              | 👑                                   |
| PUT    | `/:id`                           | 👑                                   |
| DELETE | `/:id`                           | 👑 soft delete (`isActive: false`)   |
| PATCH  | `/:id/variants/:variantId/stock` | 👑 `{ stock }` or `{ delta }`        |
| POST   | `/:id/images`                    | 👑 multipart `images[]` → Cloudinary |
| DELETE | `/:id/images/:publicId`          | 👑 refuses below 2 images            |
| PATCH  | `/:id/images/reorder`            | 👑 `{ order: [publicId, ...] }`      |

**List query params:** `category`, `subCategory` (slug or id), `size`, `color` (comma-separated), `minPrice`, `maxPrice`, `search`, `sort` (`newest\|oldest\|price_asc\|price_desc\|rating\|popular\|discount`), `isFeatured`, `isBestseller`, `isNewArrival`, `inStock`, `page`, `limit`.

`size`/`color`/`inStock` match within a single variant, so "black in M" cannot be satisfied by a black XL plus a white M.

Every product carries a virtual `discountPercent`, `totalStock` and `inStock`.

## Categories — `/categories`

`GET /` 🔓 returns the nested tree. `POST /` · `PUT /:id` · `DELETE /:id` 👑 — delete is refused while products or sub-categories still reference it.

## Cart — `/cart` (all 🔐)

`GET /` · `POST /items` `{ product, sku, qty }` · `PUT /items/:itemId` `{ qty }` · `DELETE /items/:itemId` · `DELETE /`

Every read re-prices against the live catalogue and flags `priceChanged`, `inStock` and `stock` per line. Guests keep a client-side cart and post it into `POST /orders` at checkout.

## Coupons — `/coupons`

`POST /apply` 🔓 `{ code, items[] | fromCart }` — preview only; the subtotal is recomputed from the DB.
`GET /` · `POST /` · `PUT /:id` · `DELETE /:id` 👑 (list includes `remainingUses` and `isExpired`).

## Orders — `/orders`

| Method | Path                         | Access                                                     |
| ------ | ---------------------------- | ---------------------------------------------------------- |
| POST   | `/`                          | 🔓 guest or 🔐                                             |
| GET    | `/`                          | 🔐 own orders · 👑 all orders                              |
| GET    | `/track?orderNumber=&phone=` | 🔓                                                         |
| GET    | `/:id`                       | 🔐 owner or 👑                                             |
| GET    | `/:id/invoice`               | 🔐 owner or 👑 — PDF                                       |
| PATCH  | `/:id/cancel`                | 🔐 `{ reason }`, allowed up to `packed`                    |
| PATCH  | `/:id/status`                | 👑 `{ status, note }`                                      |
| PATCH  | `/:id/courier`               | 👑 `{ name, awbNumber, trackingUrl?, estimatedDelivery? }` |

**Create body**

```jsonc
{
  "items": [{ "product": "<id>", "sku": "TS001-BL-M", "qty": 2 }], // or "fromCart": true
  "shippingAddress": {
    "name": "...",
    "phone": "9000000000",
    "line1": "...",
    "city": "...",
    "state": "...",
    "pincode": "500081",
  },
  "addressId": "<saved address id>", // optional, logged-in users
  "guestInfo": { "name": "...", "email": "...", "phone": "..." }, // required for guests
  "couponCode": "WELCOME10",
  "paymentMethod": "razorpay", // or "cod"
}
```

Any `price` sent by the client is discarded — totals come from the current DB variant price. `razorpay` orders respond with `nextStep`; COD orders are placed immediately.

Status machine: `placed → confirmed → packed → shipped → out_for_delivery → delivered`, with `cancelled` reachable up to `packed` and `returned` from `shipped` onward. Out-of-order transitions are rejected with the allowed list.

Tracking returns the same 404 for an unknown order and a details mismatch.

## Payments — `/payments`

| Method | Path                     | Access                                                                        |
| ------ | ------------------------ | ----------------------------------------------------------------------------- |
| POST   | `/razorpay/create-order` | 🔓/🔐 `{ orderId }` → `{ razorpayOrderId, amount, currency, keyId, prefill }` |
| POST   | `/razorpay/verify`       | 🔓/🔐 `{ razorpay_order_id, razorpay_payment_id, razorpay_signature }`        |
| POST   | `/razorpay/webhook`      | Razorpay only — HMAC over the raw body                                        |
| POST   | `/:orderId/refund`       | 👑 `{ amount?, reason? }`                                                     |

Webhook events handled: `payment.captured`, `payment.failed`, `refund.processed`. Unknown orders get a `200` so Razorpay stops retrying.

## Reviews — `/reviews`

`GET /product/:productId` 🔓 (approved only, plus a `ratingBreakdown` by star)
`POST /` 🔐 — auto-approved when the user has a delivered order containing the product
`PUT /:id` · `DELETE /:id` 🔐 own only · `GET /pending` · `PATCH /:id/approve` 👑

## Upload — `/upload` (all 👑)

`GET /signature` (for direct browser → Cloudinary uploads) · `POST /image` · `POST /video` · `DELETE /:publicId?type=image|video`

Images: jpeg/png/webp/avif up to `MAX_IMAGE_SIZE_MB`. Videos: mp4/webm/mov up to `MAX_VIDEO_SIZE_MB`.

## Admin — `/admin` (all 👑)

`GET /dashboard/summary` — today / week / month revenue + orders, average order value, pending orders, low-stock count, lifetime revenue
`GET /dashboard/sales-chart?range=7d|30d|12m&groupBy=day|week|month` — bucketed in Asia/Kolkata
`GET /dashboard/top-products?limit=` · `GET /dashboard/category-split` · `GET /dashboard/recent-orders?limit=`
`GET /customers?search=&page=&limit=` — with order count and lifetime spend · `GET /customers/:id`
`GET /inventory/low-stock?threshold=` — flat variant rows
`GET /settings` · `PUT /settings` — shipping rules, COD toggle, business info, masked gateway keys

Revenue figures count paid orders that are not cancelled or returned.

## Shipping — `/shipping`

`POST /check-serviceability` 🔓 `{ pincode }` → `{ serviceable, estimatedDays, codAvailable, shippingFee, freeShippingThreshold }`
`POST /shiprocket/create-shipment` 👑 → `501` until phase 2 · `POST /shiprocket/webhook` (token header)

## Rate limits

`/auth/login`, `/register`, `/forgot-password`, `/reset-password`, `/verify-email` 10 per 15 min · `/auth/send-otp`, `/verify-otp` 5 per 10 min per IP+phone · `/auth/resend-verification` 5 per 15 min per IP+email · `/payments/*` 30 per 5 min (webhook exempt) · writes 60/min · everything under `/api` 1000 per 15 min.

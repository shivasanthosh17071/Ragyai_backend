import dotenv from "dotenv";
dotenv.config();

const num = (v, d) => (v === undefined || v === "" ? d : Number(v));

export const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  isProd: process.env.NODE_ENV === "production",
  port: num(process.env.PORT, 5000),
  brandName: process.env.BRAND_NAME || "YOUR_BRAND",
  apiBaseUrl: process.env.API_BASE_URL || "http://localhost:5000",
  clientOrigins: (process.env.CLIENT_ORIGINS || "http://localhost:3000")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),

  mongoUri: process.env.MONGO_URI,

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    accessExpires: process.env.JWT_ACCESS_EXPIRES || "15m",
    refreshExpires: process.env.JWT_REFRESH_EXPIRES || "7d",
    cookieDomain: process.env.COOKIE_DOMAIN || undefined,
  },
  bcryptRounds: num(process.env.BCRYPT_ROUNDS, 12),

  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
    folder: process.env.CLOUDINARY_FOLDER || "brand-store",
    maxImageMb: num(process.env.MAX_IMAGE_SIZE_MB, 5),
    maxVideoMb: num(process.env.MAX_VIDEO_SIZE_MB, 50),
  },

  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID,
    keySecret: process.env.RAZORPAY_KEY_SECRET,
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET,
  },

  mail: {
    host: process.env.SMTP_HOST,
    port: num(process.env.SMTP_PORT, 587),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.MAIL_FROM || "no-reply@example.com",
    adminAlert: process.env.ADMIN_ALERT_EMAIL,
  },

  sms: {
    provider: process.env.SMS_PROVIDER || "console",
    apiKey: process.env.SMS_API_KEY,
    senderId: process.env.SMS_SENDER_ID,
  },
  otpTtlMinutes: num(process.env.OTP_TTL_MINUTES, 10),

  store: {
    shippingFee: num(process.env.DEFAULT_SHIPPING_FEE, 59),
    freeShippingThreshold: num(process.env.FREE_SHIPPING_THRESHOLD, 999),
    taxPercent: num(process.env.TAX_PERCENT, 0),
    lowStockThreshold: num(process.env.LOW_STOCK_THRESHOLD, 5),
    codConfirmWindowHours: num(process.env.COD_CONFIRM_WINDOW_HOURS, 24),
  },

  shiprocket: {
    email: process.env.SHIPROCKET_EMAIL,
    password: process.env.SHIPROCKET_PASSWORD,
    webhookToken: process.env.SHIPROCKET_WEBHOOK_TOKEN,
  },
};

export const assertRequiredEnv = () => {
  const required = ["MONGO_URI", "JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET"];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length)
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
};

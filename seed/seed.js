import mongoose from "mongoose";
import { env, assertRequiredEnv } from "../src/config/env.js";
import { connectDB, disconnectDB } from "../src/config/db.js";
import {
  User,
  Product,
  Category,
  Coupon,
  Order,
  Cart,
  Review,
  Settings,
  Counter,
} from "../src/models/index.js";

/*
 * Curated real apparel photography (Unsplash, free-license). Every photo below was
 * individually downloaded and visually inspected — not just matched by search alt-text —
 * specifically to exclude shots with a third-party brand's logo or graphic printed on the
 * garment (an easy mistake: most "t-shirt" stock photos are branded product shots, and
 * alt-text like "man in black crew neck tee" gives no hint that it reads "NIKE" up close).
 * `PRIMARY_SHOTS` are single clean garments (worn or on a hanger) for front/back hero
 * images; `DETAIL_SHOTS` are flat-lay/rack shots. Rotated deterministically per product.
 */
const PRIMARY_SHOTS = [
  "photo-1521572163474-6864f9cf17ab", // man wearing a plain white crew-neck tee
  "photo-1622445275463-afa2ab738c34", // man in a plain white oversized tee, cap, outdoors
  "premium_photo-1727942419945-1908baae3c8e", // man in a plain white tee, seated studio portrait
  "photo-1595211877493-41a4e5f236b3", // man in a plain black long-sleeve tee, smiling
  "photo-1581655353564-df123a1eb820", // plain white tee on a hanger, concrete wall
  "photo-1651761179569-4ba2aa054997", // plain white tee, flat product shot
  "photo-1778671394516-8270eac13c42", // plain white tee on a wooden hanger
  "photo-1610502778270-c5c6f4c7d575", // plain black/charcoal tees on hangers
];

const DETAIL_SHOTS = [
  "photo-1620799140408-edc6dcb6d633", // flat-lay tee styled with jeans and sneakers
  "photo-1562157873-818bc0726f68", // assorted folded plain shirts on a wooden panel
  "photo-1489987707025-afc232f7ea0f", // plain shirts hanging on a rack, close-up
  "photo-1620799139834-6b8f844fbe61", // two folded white tees, flat lay
];

// Unsplash Plus photos (`premium_photo-...` ids) are served from a different subdomain
// than free photos and 404 on images.unsplash.com.
const unsplash = (photoId, w = 900, h = 1200) => {
  const base = photoId.startsWith("premium_photo-")
    ? "https://plus.unsplash.com"
    : "https://images.unsplash.com";
  return `${base}/${photoId}?w=${w}&h=${h}&fit=crop&auto=format&q=80`;
};

const img = (photoId, seed, n) => ({
  url: unsplash(photoId),
  publicId: `${env.cloudinary.folder}/seed/${seed}-${n}`,
});

/** Front + back (hover-swap pair) from PRIMARY_SHOTS, plus one DETAIL_SHOTS close-up. */
const productImages = (index, seed) => [
  img(PRIMARY_SHOTS[index % PRIMARY_SHOTS.length], seed, "front"),
  img(PRIMARY_SHOTS[(index + 7) % PRIMARY_SHOTS.length], seed, "back"),
  img(DETAIL_SHOTS[index % DETAIL_SHOTS.length], seed, "detail"),
];

const SIZES = ["S", "M", "L", "XL", "XXL"];
const COLORS = [
  { color: "Black", colorHex: "#111111" },
  { color: "White", colorHex: "#FAFAFA" },
  { color: "Olive", colorHex: "#556B2F" },
  { color: "Sand", colorHex: "#D9C7A7" },
];

const TSHIRTS = [
  [
    "Heavyweight Oversized Tee",
    "oversized-tees",
    1299,
    1999,
    ["oversized", "heavyweight", "unisex"],
  ],
  ["Acid Wash Boxy Tee", "oversized-tees", 1499, 2199, ["acid wash", "boxy"]],
  ["Minimal Logo Tee", "classic-tees", 899, 1399, ["minimal", "logo"]],
  ["Drop Shoulder Cotton Tee", "oversized-tees", 1199, 1799, ["drop shoulder"]],
  [
    "Vintage Wash Graphic Tee",
    "graphic-tees",
    1399,
    2099,
    ["vintage", "graphic"],
  ],
  [
    "Streetwear Back Print Tee",
    "graphic-tees",
    1599,
    2399,
    ["streetwear", "back print"],
  ],
  ["Ribbed Crew Neck Tee", "classic-tees", 999, 1499, ["ribbed", "crew neck"]],
  ["Sun Faded Pocket Tee", "classic-tees", 1099, 1599, ["pocket", "faded"]],
  ["Anime Print Oversized Tee", "graphic-tees", 1499, 2299, ["anime", "print"]],
  ["Essential Henley Tee", "classic-tees", 1249, 1899, ["henley", "essential"]],
  ["Colour Block Relaxed Tee", "oversized-tees", 1349, 1999, ["colour block"]],
  ["Typographic Statement Tee", "graphic-tees", 1199, 1799, ["typography"]],
  ["Garment Dyed Boxy Tee", "oversized-tees", 1599, 2499, ["garment dyed"]],
  [
    "Long Sleeve Layering Tee",
    "full-sleeve",
    1699,
    2499,
    ["long sleeve", "layering"],
  ],
  ["Raglan Sleeve Tee", "full-sleeve", 1449, 2099, ["raglan"]],
];

const buildVariants = (index, price, mrp) => {
  const colors = COLORS.slice(0, 2 + (index % 3));
  const variants = [];
  colors.forEach((c, ci) => {
    SIZES.forEach((size, si) => {
      variants.push({
        sku: `TS${String(index + 1).padStart(3, "0")}-${c.color.slice(0, 2).toUpperCase()}-${size}`,
        size,
        color: c.color,
        colorHex: c.colorHex,
        price: price + (size === "XXL" ? 100 : 0),
        mrp: mrp + (size === "XXL" ? 100 : 0),
        stock: [12, 25, 30, 18, 6][si] - ci * 2,
        isActive: true,
      });
    });
  });
  return variants;
};

const run = async () => {
  assertRequiredEnv();
  await connectDB();

  const destroy = process.argv.includes("--destroy");
  console.log("Clearing existing data...");
  await Promise.all([
    Product.deleteMany({}),
    Category.deleteMany({}),
    Coupon.deleteMany({}),
    Order.deleteMany({}),
    Cart.deleteMany({}),
    Review.deleteMany({}),
    Counter.deleteMany({}),
    User.deleteMany({
      email: { $in: ["admin@example.com", "customer@example.com"] },
    }),
  ]);
  if (destroy) {
    console.log("Data destroyed.");
    await disconnectDB();
    return;
  }

  /* ---------- categories ---------- */
  const tshirts = await Category.create({ name: "T-Shirts", displayOrder: 1 });
  const subs = await Category.insertMany([
    {
      name: "Oversized Tees",
      slug: "oversized-tees",
      parentCategory: tshirts._id,
      displayOrder: 1,
      image: img(PRIMARY_SHOTS[1], "cat-oversized", "cover"),
    },
    {
      name: "Classic Tees",
      slug: "classic-tees",
      parentCategory: tshirts._id,
      displayOrder: 2,
      image: img(PRIMARY_SHOTS[4], "cat-classic", "cover"),
    },
    {
      name: "Graphic Tees",
      slug: "graphic-tees",
      parentCategory: tshirts._id,
      displayOrder: 3,
      image: img(PRIMARY_SHOTS[2], "cat-graphic", "cover"),
    },
    {
      name: "Full Sleeve",
      slug: "full-sleeve",
      parentCategory: tshirts._id,
      displayOrder: 4,
      image: img(PRIMARY_SHOTS[3], "cat-full-sleeve", "cover"),
    },
  ]);
  const subBySlug = Object.fromEntries(subs.map((s) => [s.slug, s._id]));
  console.log(`Created ${subs.length + 1} categories`);

  /* ---------- products ---------- */
  const products = [];
  for (const [i, [name, subSlug, price, mrp, tags]] of TSHIRTS.entries()) {
    const seed = name.toLowerCase().replace(/\s+/g, "-");
    // Created one at a time so the slug pre-hook runs per document.
    const product = await Product.create({
      name,
      description: `${name} cut from 240 GSM combed cotton with a relaxed shoulder line and a soft hand feel. Pre-shrunk, colour-fast and built to hold shape after repeated washes.`,
      category: tshirts._id,
      subCategory: subBySlug[subSlug],
      brand: env.brandName,
      tags,
      images: productImages(i, seed),
      variants: buildVariants(i, price, mrp),
      isFeatured: i < 4,
      isBestseller: i % 5 === 0,
      isNewArrival: i >= TSHIRTS.length - 4,
      seo: {
        metaTitle: `${name} | ${env.brandName}`,
        metaDescription: `Shop the ${name} at ${env.brandName}.`,
      },
    });
    products.push(product);
  }
  console.log(`Created ${products.length} products`);

  /* ---------- users ---------- */
  const admin = new User({
    name: "Store Owner",
    email: "admin@ragyaim.com",
    phone: "9000000001",
    role: "admin",
    isEmailVerified: true,
    isPhoneVerified: true,
  });
  await admin.setPassword("Santhosh@123@12345");
  await admin.save();

  const customer = new User({
    name: "Test Customer",
    email: "customer@example.com",
    phone: "9000000002",
    isEmailVerified: true,
    addresses: [
      {
        label: "Home",
        line1: "12 MG Road",
        line2: "Near Metro Station",
        city: "Hyderabad",
        state: "Telangana",
        pincode: "500081",
        phone: "9000000002",
        isDefault: true,
      },
    ],
  });
  await customer.setPassword("Customer@12345");
  await customer.save();
  console.log("Created admin + test customer");

  /* ---------- coupons ---------- */
  const in90Days = new Date(Date.now() + 90 * 24 * 3600 * 1000);
  await Coupon.insertMany([
    {
      code: "WELCOME10",
      description: "10% off your first order",
      discountType: "percent",
      discountValue: 10,
      minOrderValue: 999,
      maxDiscountCap: 300,
      usageLimit: 500,
      perUserLimit: 1,
      validUntil: in90Days,
    },
    {
      code: "FLAT200",
      description: "Flat Rs.200 off above Rs.1499",
      discountType: "flat",
      discountValue: 200,
      minOrderValue: 1499,
      usageLimit: null,
      perUserLimit: 3,
      validUntil: in90Days,
    },
    {
      code: "INSTA15",
      description: "15% off for Instagram followers",
      discountType: "percent",
      discountValue: 15,
      minOrderValue: 1999,
      maxDiscountCap: 500,
      validUntil: in90Days,
    },
  ]);
  console.log("Created 3 coupons");

  await Settings.get();

  console.log("\nSeed complete.");
  console.log("  admin:    admin@example.com / Admin@12345");
  console.log("  customer: customer@example.com / Customer@12345");

  await disconnectDB();
};

run().catch(async (err) => {
  console.error("Seed failed:", err);
  await mongoose.connection.close().catch(() => {});
  process.exit(1);
});

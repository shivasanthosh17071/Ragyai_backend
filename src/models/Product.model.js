import mongoose from 'mongoose';
import slugify from 'slugify';

const variantSchema = new mongoose.Schema(
  {
    sku: { type: String, required: true, trim: true, uppercase: true },
    size: { type: String, required: true, trim: true },
    color: { type: String, required: true, trim: true },
    colorHex: { type: String, trim: true, match: [/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'colorHex must be a hex colour'] },
    price: { type: Number, required: true, min: 0 },
    mrp: { type: Number, required: true, min: 0 },
    stock: { type: Number, required: true, min: 0, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { _id: true }
);

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    slug: { type: String, unique: true, index: true },
    description: { type: String, required: true },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true, index: true },
    subCategory: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null, index: true },
    brand: { type: String, trim: true },
    tags: [{ type: String, trim: true, lowercase: true }],

    // Two images minimum: the storefront cards swap image[0] -> image[1] on hover/tap.
    images: {
      type: [{ url: { type: String, required: true }, publicId: { type: String, required: true } }],
      validate: [(v) => v.length >= 2, 'At least two images are required (front + back)'],
    },
    videos: [{ url: String, publicId: String }],

    variants: {
      type: [variantSchema],
      validate: [(v) => v.length >= 1, 'At least one variant is required'],
    },

    basePrice: { type: Number, required: true, min: 0, index: true },
    baseMrp: { type: Number, required: true, min: 0 },

    ratingsAverage: { type: Number, default: 0, min: 0, max: 5 },
    ratingsCount: { type: Number, default: 0 },

    isFeatured: { type: Boolean, default: false, index: true },
    isBestseller: { type: Boolean, default: false, index: true },
    isNewArrival: { type: Boolean, default: false, index: true },
    isActive: { type: Boolean, default: true, index: true },

    seo: { metaTitle: String, metaDescription: String },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

productSchema.index({ name: 'text', description: 'text', tags: 'text', brand: 'text' });
productSchema.index({ 'variants.sku': 1 }, { unique: true, sparse: true });
productSchema.index({ createdAt: -1 });

productSchema.virtual('discountPercent').get(function () {
  if (!this.baseMrp || this.baseMrp <= this.basePrice) return 0;
  return Math.round(((this.baseMrp - this.basePrice) / this.baseMrp) * 100);
});

productSchema.virtual('totalStock').get(function () {
  return (this.variants || []).reduce((s, v) => s + (v.isActive ? v.stock : 0), 0);
});

productSchema.virtual('inStock').get(function () {
  return (this.variants || []).some((v) => v.isActive && v.stock > 0);
});

productSchema.virtual('reviews', {
  ref: 'Review', localField: '_id', foreignField: 'product',
});

/** Slug is derived from the name and de-duplicated with a short suffix. */
productSchema.pre('validate', async function (next) {
  if (this.isModified('name') || !this.slug) {
    const base = slugify(this.name, { lower: true, strict: true });
    let candidate = base;
    let n = 1;
    // eslint-disable-next-line no-await-in-loop
    while (await this.constructor.exists({ slug: candidate, _id: { $ne: this._id } })) {
      candidate = `${base}-${n++}`;
    }
    this.slug = candidate;
  }
  // basePrice / baseMrp track the cheapest active variant unless set explicitly.
  const active = (this.variants || []).filter((v) => v.isActive);
  if (active.length) {
    const cheapest = active.reduce((a, b) => (a.price <= b.price ? a : b));
    if (this.basePrice == null || this.isModified('variants')) this.basePrice = cheapest.price;
    if (this.baseMrp == null || this.isModified('variants')) this.baseMrp = cheapest.mrp;
  }
  next();
});

export default mongoose.model('Product', productSchema);

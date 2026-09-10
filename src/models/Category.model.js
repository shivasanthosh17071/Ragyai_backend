import mongoose from 'mongoose';
import slugify from 'slugify';

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    slug: { type: String, unique: true, index: true },
    image: { url: String, publicId: String },
    parentCategory: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null, index: true },
    displayOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

categorySchema.pre('validate', function (next) {
  if (this.isModified('name') || !this.slug) this.slug = slugify(this.name, { lower: true, strict: true });
  next();
});

export default mongoose.model('Category', categorySchema);

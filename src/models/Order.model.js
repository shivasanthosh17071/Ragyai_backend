import mongoose from 'mongoose';
import Counter from './Counter.model.js';

export const ORDER_STATUSES = [
  'placed', 'confirmed', 'packed', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'returned',
];

/** Statuses an order may move to. Terminal states have no forward transitions. */
export const STATUS_FLOW = {
  placed: ['confirmed', 'cancelled'],
  confirmed: ['packed', 'cancelled'],
  packed: ['shipped', 'cancelled'],
  shipped: ['out_for_delivery', 'returned'],
  out_for_delivery: ['delivered', 'returned'],
  delivered: ['returned'],
  cancelled: [],
  returned: [],
};

const orderItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    productName: { type: String, required: true },
    image: { type: String },
    variant: {
      size: { type: String, required: true },
      color: { type: String, required: true },
      sku: { type: String, required: true, uppercase: true },
    },
    qty: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, unique: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    guestInfo: {
      name: { type: String, trim: true },
      email: { type: String, lowercase: true, trim: true, match: [/^\S+@\S+\.\S+$/, 'Invalid email address'] },
      phone: { type: String, match: [/^[6-9]\d{9}$/, 'Invalid Indian mobile number'] },
    },
    items: { type: [orderItemSchema], validate: [(v) => v.length > 0, 'Order must contain at least one item'] },
    shippingAddress: {
      name: { type: String, required: true, trim: true },
      phone: { type: String, required: true, match: [/^[6-9]\d{9}$/, 'Invalid Indian mobile number'] },
      line1: { type: String, required: true, trim: true },
      line2: { type: String, trim: true },
      city: { type: String, required: true, trim: true },
      state: { type: String, required: true, trim: true },
      pincode: { type: String, required: true, match: [/^\d{6}$/, 'Pincode must be 6 digits'] },
    },

    subtotal: { type: Number, required: true, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    shippingFee: { type: Number, default: 0, min: 0 },
    tax: { type: Number, default: 0, min: 0 },
    totalAmount: { type: Number, required: true, min: 0 },
    couponApplied: { code: String, discountValue: Number },

    paymentMethod: { type: String, enum: ['razorpay', 'cod'], required: true },
    paymentStatus: { type: String, enum: ['pending', 'paid', 'failed', 'refunded'], default: 'pending', index: true },
    paymentDetails: {
      razorpayOrderId: { type: String, index: true },
      razorpayPaymentId: String,
      razorpaySignature: String,
      refundId: String,
      refundedAmount: Number,
      paidAt: Date,
    },

    orderStatus: { type: String, enum: ORDER_STATUSES, default: 'placed', index: true },
    statusHistory: [{ status: String, timestamp: { type: Date, default: Date.now }, note: String }],

    courier: { name: String, awbNumber: String, trackingUrl: String, estimatedDelivery: Date },

    // Guards against double-decrementing stock when Razorpay retries a webhook
    // after /verify has already settled the same order.
    stockDecremented: { type: Boolean, default: false },
    codReleaseAt: { type: Date, default: null, index: true },

    cancelReason: String,
    returnReason: String,
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

orderSchema.index({ createdAt: -1 });
orderSchema.index({ 'guestInfo.phone': 1 });
orderSchema.index({ 'guestInfo.email': 1 });

orderSchema.virtual('isGuest').get(function () { return !this.user; });

orderSchema.virtual('customerEmail').get(function () {
  return this.user?.email || this.guestInfo?.email;
});

orderSchema.pre('validate', async function (next) {
  if (!this.orderNumber) {
    const year = new Date().getFullYear();
    const seq = await Counter.next(`order-${year}`);
    this.orderNumber = `ORD-${year}-${String(seq).padStart(5, '0')}`;
  }
  if (!this.statusHistory?.length) {
    this.statusHistory = [{ status: this.orderStatus, timestamp: new Date(), note: 'Order placed' }];
  }
  next();
});

orderSchema.methods.pushStatus = function (status, note) {
  this.orderStatus = status;
  this.statusHistory.push({ status, timestamp: new Date(), note });
};

export default mongoose.model('Order', orderSchema);

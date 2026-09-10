import { User, Product } from '../models/index.js';
import ApiError from '../utils/apiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';

/* ---------- addresses ---------- */
export const listAddresses = asyncHandler(async (req, res) =>
  sendSuccess(res, { data: { addresses: req.user.addresses } }));

export const addAddress = asyncHandler(async (req, res) => {
  const user = req.user;
  const isFirst = user.addresses.length === 0;
  user.addresses.push({ ...req.body, isDefault: req.body.isDefault || isFirst });
  const added = user.addresses[user.addresses.length - 1];
  if (added.isDefault) user.normalizeDefaultAddress(added._id);
  await user.save();
  return sendSuccess(res, { status: 201, message: 'Address added', data: { address: added } });
});

export const updateAddress = asyncHandler(async (req, res) => {
  const address = req.user.addresses.id(req.params.id);
  if (!address) throw ApiError.notFound('Address not found');
  address.set(req.body);
  if (req.body.isDefault) req.user.normalizeDefaultAddress(address._id);
  await req.user.save();
  return sendSuccess(res, { message: 'Address updated', data: { address } });
});

export const deleteAddress = asyncHandler(async (req, res) => {
  const address = req.user.addresses.id(req.params.id);
  if (!address) throw ApiError.notFound('Address not found');
  address.deleteOne();
  req.user.normalizeDefaultAddress();
  await req.user.save();
  return sendSuccess(res, { message: 'Address removed' });
});

/* ---------- profile ---------- */
export const updateProfile = asyncHandler(async (req, res) => {
  const { name, email, phone } = req.body;
  if (email || phone) {
    const clash = await User.findOne({
      _id: { $ne: req.user._id },
      $or: [...(email ? [{ email }] : []), ...(phone ? [{ phone }] : [])],
    });
    if (clash) throw ApiError.conflict('That email or phone is already in use');
  }
  if (name) req.user.name = name;
  if (email && email !== req.user.email) { req.user.email = email; req.user.isEmailVerified = false; }
  if (phone && phone !== req.user.phone) { req.user.phone = phone; req.user.isPhoneVerified = false; }
  await req.user.save();
  return sendSuccess(res, { message: 'Profile updated', data: { user: req.user } });
});

/* ---------- wishlist / compare ---------- */
const listField = (field) => asyncHandler(async (req, res) => {
  const user = await req.user.populate({
    path: field,
    match: { isActive: true },
    select: 'name slug images basePrice baseMrp ratingsAverage ratingsCount variants',
  });
  return sendSuccess(res, { data: { [field]: user[field] } });
});

const addToField = (field, max) => asyncHandler(async (req, res) => {
  const product = await Product.findOne({ _id: req.params.productId, isActive: true });
  if (!product) throw ApiError.notFound('Product not found');
  if (max && req.user[field].length >= max && !req.user[field].some((id) => String(id) === String(product._id))) {
    throw ApiError.badRequest(`You can compare up to ${max} products at a time`);
  }
  await User.updateOne({ _id: req.user._id }, { $addToSet: { [field]: product._id } });
  return sendSuccess(res, { message: 'Added' });
});

const removeFromField = (field) => asyncHandler(async (req, res) => {
  await User.updateOne({ _id: req.user._id }, { $pull: { [field]: req.params.productId } });
  return sendSuccess(res, { message: 'Removed' });
});

export const getWishlist = listField('wishlist');
export const addToWishlist = addToField('wishlist');
export const removeFromWishlist = removeFromField('wishlist');

export const getCompare = listField('compareList');
export const addToCompare = addToField('compareList', 4);
export const removeFromCompare = removeFromField('compareList');
